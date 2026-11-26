import { describe, it, expect, vi } from "vitest";
import {
  compareAnswers,
  describeRcode,
  formatTtl,
  friendlyHttpError,
  isValidCustomResolver,
  lookupDns,
  DnsApiError,
  type DnsResolverResult,
} from "./dns-lookup";

function res(
  resolver: string,
  displays: string[],
  extra: Partial<DnsResolverResult> = {},
): DnsResolverResult {
  return {
    resolver,
    rcode: "NOERROR",
    authoritative: false,
    truncated: false,
    usedTcp: false,
    queryTimeMs: 1,
    answers: displays.map((d, i) => ({
      name: "example.com.",
      type: "A",
      ttl: 100 + i,
      data: {},
      display: d,
    })),
    ...extra,
  };
}

describe("compareAnswers", () => {
  it("reports agreement ignoring TTL and order", () => {
    const a = res("a", ["1.1.1.1", "2.2.2.2"]);
    const b = res("b", ["2.2.2.2", "1.1.1.1"]);
    b.answers.forEach((x) => (x.ttl = 5));
    const c = compareAnswers([a, b]);
    expect(c.disagree).toBe(false);
    expect(c.results.flatMap((r) => r.records).every((r) => r.status === "common")).toBe(true);
  });

  it("marks records missing from some resolver as unique", () => {
    const c = compareAnswers([res("a", ["1.1.1.1", "2.2.2.2"]), res("b", ["1.1.1.1"])]);
    expect(c.disagree).toBe(true);
    expect(c.results[0]!.records.map((r) => r.status)).toEqual(["common", "unique"]);
    expect(c.results[1]!.records.map((r) => r.status)).toEqual(["common"]);
  });

  it("flags differing rcodes", () => {
    const c = compareAnswers([res("a", []), res("b", [], { rcode: "NXDOMAIN" })]);
    expect(c.rcodeDiffers).toBe(true);
    expect(c.disagree).toBe(true);
  });

  it("ignores resolvers with errors", () => {
    const c = compareAnswers([res("a", ["1.1.1.1"]), res("b", [], { error: "timeout" })]);
    expect(c.disagree).toBe(false);
    expect(c.results[0]!.records[0]!.status).toBe("common");
  });

  it("does not flag a single resolver", () => {
    expect(compareAnswers([res("a", ["1.1.1.1"])]).disagree).toBe(false);
  });
});

describe("helpers", () => {
  it("formats TTLs", () => {
    expect(formatTtl(30)).toBe("30s");
    expect(formatTtl(300)).toBe("5m");
    expect(formatTtl(3661)).toBe("1h 1m 1s");
    expect(formatTtl(86400)).toBe("1d");
  });

  it("validates custom resolvers", () => {
    for (const ok of ["1.1.1.1", "1.1.1.1:5353", "2606:4700::1111", "[2606:4700::1111]:53"]) {
      expect(isValidCustomResolver(ok)).toBe(true);
    }
    for (const bad of ["", "example.com", "1.1.1", "300.1.1.1", "1.1.1.1:0", "1.1.1.1:70000"]) {
      expect(isValidCustomResolver(bad)).toBe(false);
    }
  });

  it("maps HTTP errors to friendly text", () => {
    expect(friendlyHttpError(429)).toMatch(/Too many requests/);
    expect(friendlyHttpError(503)).toMatch(/busy/);
    expect(friendlyHttpError(400, "name is required")).toBe("name is required");
    expect(friendlyHttpError(500)).toMatch(/500/);
  });

  it("describes rcodes", () => {
    expect(describeRcode("NXDOMAIN")).toBe("Name does not exist");
    expect(describeRcode(undefined)).toBe("");
  });
});

describe("lookupDns", () => {
  const req = { name: "example.com", type: "A", resolvers: ["google"] };

  it("returns the parsed body on success", async () => {
    const body = { name: "example.com", type: "A", results: [] };
    const f = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
    expect(await lookupDns(req, undefined, f)).toEqual(body);
    expect(f.mock.calls[0]![0]).toBe("/api/net/dns");
  });

  it("throws a friendly error on 429 and surfaces 400 messages", async () => {
    const f429 = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status: 429 }));
    await expect(lookupDns(req, undefined, f429)).rejects.toMatchObject({ status: 429 });
    const f400 = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ error: "bad name" }), { status: 400 }));
    await expect(lookupDns(req, undefined, f400)).rejects.toThrow("bad name");
  });

  it("wraps network failures", async () => {
    const f = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("fail"));
    await expect(lookupDns(req, undefined, f)).rejects.toBeInstanceOf(DnsApiError);
  });
});
