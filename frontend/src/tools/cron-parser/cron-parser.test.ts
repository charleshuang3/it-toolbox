import { describe, it, expect } from "vitest";
import { parseCron, isValidTimeZone, formatInZone, MAX_RUNS } from "./cron-parser";

const FROM = new Date("2024-01-15T10:00:00Z");

describe("cron-parser", () => {
  it("returns empty result without error for empty input", () => {
    const r = parseCron("   ", "UTC", 5, FROM);
    expect(r.error).toBe("");
    expect(r.runs).toEqual([]);
  });

  it("describes and schedules a 5-field expression", () => {
    const r = parseCron("*/15 * * * *", "UTC", 4, FROM);
    expect(r.error).toBe("");
    expect(r.description.toLowerCase()).toContain("15 minutes");
    expect(r.runs.map((x) => new Date(x.ms).toISOString())).toEqual([
      "2024-01-15T10:15:00.000Z",
      "2024-01-15T10:30:00.000Z",
      "2024-01-15T10:45:00.000Z",
      "2024-01-15T11:00:00.000Z",
    ]);
  });

  it("supports 6-field expressions with seconds", () => {
    const r = parseCron("30 0 12 * * *", "UTC", 2, FROM);
    expect(r.error).toBe("");
    expect(r.fieldCount).toBe(6);
    expect(new Date(r.runs[0]!.ms).toISOString()).toBe("2024-01-15T12:00:30.000Z");
  });

  it("respects the time zone", () => {
    const r = parseCron("0 9 * * *", "Asia/Tokyo", 1, FROM);
    // 09:00 JST = 00:00 UTC; next after 10:00Z on Jan 15 is Jan 16
    expect(new Date(r.runs[0]!.ms).toISOString()).toBe("2024-01-16T00:00:00.000Z");
    expect(r.runs[0]!.formatted).toContain("09:00:00");
  });

  it("supports macros", () => {
    const r = parseCron("@daily", "UTC", 1, FROM);
    expect(r.error).toBe("");
    expect(new Date(r.runs[0]!.ms).toISOString()).toBe("2024-01-16T00:00:00.000Z");
  });

  it("rejects an unsupported macro", () => {
    expect(parseCron("@nope", "UTC", 1, FROM).error).toMatch(/Unsupported macro/);
  });

  it("rejects wrong field count", () => {
    const r = parseCron("* * *", "UTC", 1, FROM);
    expect(r.error).toMatch(/Expected 5 fields/);
    expect(r.runs).toEqual([]);
  });

  it("rejects out-of-range values", () => {
    expect(parseCron("61 * * * *", "UTC", 1, FROM).error).not.toBe("");
  });

  it("rejects an unknown time zone", () => {
    expect(parseCron("* * * * *", "Mars/Base", 1, FROM).error).toMatch(/time zone/);
  });

  it("caps the run count", () => {
    const r = parseCron("* * * * *", "UTC", 1000, FROM);
    expect(r.runs).toHaveLength(MAX_RUNS);
  });

  it("validates time zones", () => {
    expect(isValidTimeZone("Europe/Paris")).toBe(true);
    expect(isValidTimeZone("Nope/Nope")).toBe(false);
  });

  it("formats in a zone", () => {
    expect(formatInZone(Date.UTC(2024, 0, 15, 10, 0, 0), "UTC")).toContain("10:00:00");
  });
});
