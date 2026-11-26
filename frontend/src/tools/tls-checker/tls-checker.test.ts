import { describe, it, expect } from "vitest";
import {
  parseTarget,
  verdictView,
  friendlyError,
  describeDays,
  keyDescription,
  type TlsResult,
  type TlsCert,
} from "./tls-checker";

describe("parseTarget", () => {
  it("defaults the port", () => {
    expect(parseTarget("example.com")).toEqual({ host: "example.com", port: 443 });
  });
  it("parses host:port", () => {
    expect(parseTarget(" example.com:8443 ")).toEqual({ host: "example.com", port: 8443 });
  });
  it("strips URL scheme, userinfo and path", () => {
    expect(parseTarget("https://user:pw@example.com:993/a/b?x=1#h")).toEqual({
      host: "example.com",
      port: 993,
    });
    expect(parseTarget("https://example.com/")).toEqual({ host: "example.com", port: 443 });
  });
  it("handles IPv6", () => {
    expect(parseTarget("[::1]:8443")).toEqual({ host: "::1", port: 8443 });
    expect(parseTarget("https://[2001:db8::1]/")).toEqual({ host: "2001:db8::1", port: 443 });
    expect(parseTarget("2001:db8::1")).toEqual({ host: "2001:db8::1", port: 443 });
  });
  it("rejects bad input", () => {
    expect(parseTarget("")).toBeNull();
    expect(parseTarget("example.com:abc")).toBeNull();
    expect(parseTarget("example.com:70000")).toBeNull();
    expect(parseTarget("https://")).toBeNull();
  });
});

function result(valid: boolean, days: number, reasons: TlsResult["verdict"]["reasons"] = []) {
  return {
    verdict: { valid, reasons },
    chain: [{ days_remaining: days } as TlsCert],
  } as TlsResult;
}

describe("verdictView", () => {
  it("ok", () => {
    expect(verdictView(result(true, 90))).toMatchObject({ level: "ok" });
  });
  it("warns when expiring soon", () => {
    const v = verdictView(result(true, 5));
    expect(v.level).toBe("warning");
    expect(v.title).toContain("5 days");
  });
  it("lists invalid reasons", () => {
    const v = verdictView(
      result(false, -3, [
        { code: "expired", message: "expired on x" },
        { code: "hostname_mismatch", message: "wrong host" },
      ]),
    );
    expect(v.level).toBe("error");
    expect(v.title).toContain("expired");
    expect(v.details).toEqual(["expired on x", "wrong host"]);
  });
});

describe("helpers", () => {
  it("describeDays", () => {
    expect(describeDays(1)).toBe("1 day remaining");
    expect(describeDays(-2)).toBe("expired 2 days ago");
    expect(describeDays(0)).toBe("expires today");
  });
  it("friendlyError", () => {
    expect(friendlyError(429)).toMatch(/Too many/);
    expect(friendlyError(503)).toMatch(/busy/);
    expect(friendlyError(403)).toMatch(/not allowed/);
    expect(friendlyError(504)).toMatch(/timed out/);
    expect(friendlyError(502, "connection failed: connection refused")).toMatch(/refused/);
    expect(friendlyError(502, "could not resolve host: x")).toBe("could not resolve host: x");
  });
  it("keyDescription", () => {
    expect(keyDescription({ key_algorithm: "RSA", key_size: 2048 } as TlsCert)).toBe(
      "RSA 2048-bit",
    );
    expect(keyDescription({ key_algorithm: "ECDSA", curve: "P-256" } as TlsCert)).toBe(
      "ECDSA P-256",
    );
  });
});
