import { describe, expect, it } from "vitest";
import {
  errorTitle,
  formatBytes,
  formatMs,
  friendlyError,
  headersToObject,
  normalizeUrl,
  scoreGrade,
  statusClass,
  validateForm,
  waterfall,
  waterfallScale,
  type Hop,
  type Timings,
} from "./http-inspector";

const t = (o: Partial<Timings> = {}): Timings => ({
  dns_ms: 0,
  connect_ms: 0,
  tls_ms: 0,
  ttfb_ms: 0,
  transfer_ms: 0,
  total_ms: 0,
  ...o,
});

describe("http-inspector helpers", () => {
  it("builds header object, skipping blank names", () => {
    expect(
      headersToObject([
        { name: " X-A ", value: "1" },
        { name: "", value: "x" },
        { name: "X-A", value: "2" },
      ]),
    ).toEqual({ "X-A": "2" });
  });

  it("normalizes urls", () => {
    expect(normalizeUrl(" example.com/x ")).toBe("https://example.com/x");
    expect(normalizeUrl("http://a.b")).toBe("http://a.b");
    expect(normalizeUrl("")).toBe("");
  });

  it("validates the form", () => {
    expect(validateForm("", "")).toMatch(/URL/);
    expect(validateForm("ftp://x.y", "")).toMatch(/http/);
    expect(validateForm("example.com", "")).toBe("");
    expect(validateForm("example.com", "x".repeat(65537))).toMatch(/64 KB/);
  });

  it("formats sizes and durations", () => {
    expect(formatBytes(10)).toBe("10 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3.0 MB");
    expect(formatMs(0.2)).toBe("<1 ms");
    expect(formatMs(12.4)).toBe("12 ms");
    expect(formatMs(1500)).toBe("1.50 s");
  });

  it("classifies status codes", () => {
    expect(statusClass(200)).toBe("success");
    expect(statusClass(301)).toBe("info");
    expect(statusClass(404)).toBe("warning");
    expect(statusClass(502)).toBe("error");
  });

  it("lays out the waterfall sequentially", () => {
    const segs = waterfall(t({ dns_ms: 10, connect_ms: 10, ttfb_ms: 60, transfer_ms: 20 }));
    expect(segs.map((s) => s.key)).toEqual(["dns", "connect", "tls", "ttfb", "transfer"]);
    expect(segs[0].left).toBe(0);
    expect(segs[1].left).toBeCloseTo(10);
    expect(segs[3].left).toBeCloseTo(20);
    expect(segs[4].left + segs[4].width).toBeCloseTo(100);
    expect(waterfall(t({ ttfb_ms: 50 }), 200)[3].width).toBeCloseTo(25);
  });

  it("finds a common scale", () => {
    const hops = [
      { timings: t({ ttfb_ms: 5 }) },
      { timings: t({ ttfb_ms: 40, transfer_ms: 10 }) },
    ] as Hop[];
    expect(waterfallScale(hops)).toBe(50);
  });

  it("grades scores", () => {
    expect(scoreGrade(100).grade).toBe("A");
    expect(scoreGrade(50).grade).toBe("C");
    expect(scoreGrade(0).cls).toBe("error");
  });

  it("maps errors to friendly text", () => {
    expect(friendlyError(429, null, "12")).toMatch(/12 seconds/);
    expect(friendlyError(503)).toMatch(/busy/);
    expect(friendlyError(403, { code: "blocked_target", message: "Target blocked: x" })).toBe(
      "Target blocked: x",
    );
    expect(friendlyError(403)).toMatch(/blocked/);
    expect(friendlyError(504)).toMatch(/timed out/);
    expect(friendlyError(400, { message: "url is required" })).toBe("url is required");
    expect(friendlyError(500)).toMatch(/500/);
    expect(errorTitle("blocked_target")).toBe("Target blocked");
    expect(errorTitle(undefined)).toBe("Request failed");
  });
});
