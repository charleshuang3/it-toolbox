import { describe, it, expect } from "vitest";
import { getFormats, toPickerHex, wcagResult } from "./color";

describe("getFormats", () => {
  it("converts hex to all formats", () => {
    const f = getFormats("#ff0000");
    expect(f).not.toBeNull();
    expect(f!.hex).toBe("#ff0000");
    expect(f!.rgb).toBe("rgb(255, 0, 0)");
    expect(f!.hsl).toBe("hsl(0, 100%, 50%)");
    expect(f!.hwb).toBe("hwb(0 0% 0%)");
    expect(f!.oklch).toMatch(/^oklch\(62\.8\d?%/);
  });

  it("accepts rgb and named input", () => {
    expect(getFormats("rgb(0, 128, 0)")!.hex).toBe("#008000");
    expect(getFormats("white")!.hex).toBe("#ffffff");
  });

  it("keeps alpha", () => {
    const f = getFormats("#ff000080");
    expect(f!.hex).toBe("#ff000080");
    expect(f!.hwb).toContain("/");
  });

  it("returns null for invalid input", () => {
    expect(getFormats("not a color")).toBeNull();
    expect(getFormats("")).toBeNull();
  });
});

describe("toPickerHex", () => {
  it("returns 6-digit hex", () => {
    expect(toPickerHex("rgb(255, 255, 255)")).toBe("#ffffff");
    expect(toPickerHex("zzz")).toBeNull();
  });
});

describe("wcagResult", () => {
  it("black on white is 21:1", () => {
    const r = wcagResult("#000", "#fff");
    expect(r!.ratio).toBe(21);
    expect(r!.aaaNormal).toBe(true);
  });
  it("low contrast fails", () => {
    const r = wcagResult("#777777", "#888888");
    expect(r!.aaNormal).toBe(false);
  });
  it("null for invalid", () => {
    expect(wcagResult("x", "#fff")).toBeNull();
  });
});
