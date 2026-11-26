import { describe, it, expect } from "vitest";
import { clampSize, decodeQr, generateSvg, isValidHexColor, type QrOptions } from "./qr";

const base: QrOptions = {
  text: "hello",
  errorCorrection: "M",
  size: 200,
  foreground: "#000000",
  background: "#ffffff",
};

describe("isValidHexColor", () => {
  it("accepts 3 and 6 digit hex", () => {
    expect(isValidHexColor("#fff")).toBe(true);
    expect(isValidHexColor("#A0b1C2")).toBe(true);
  });
  it("rejects others", () => {
    expect(isValidHexColor("red")).toBe(false);
    expect(isValidHexColor("#ffff")).toBe(false);
  });
});

describe("clampSize", () => {
  it("clamps and rounds", () => {
    expect(clampSize(1)).toBe(64);
    expect(clampSize(99999)).toBe(2048);
    expect(clampSize(100.4)).toBe(100);
    expect(clampSize(NaN)).toBe(256);
  });
});

describe("generateSvg", () => {
  it("produces svg with colors", async () => {
    const svg = await generateSvg({ ...base, foreground: "#112233" });
    expect(svg).toContain("<svg");
    expect(svg).toContain("#112233");
  });
  it("rejects empty text and bad colors", async () => {
    await expect(generateSvg({ ...base, text: "" })).rejects.toThrow(/./);
    await expect(generateSvg({ ...base, foreground: "nope" })).rejects.toThrow(/./);
  });
});

describe("decodeQr", () => {
  it("returns null for blank image", async () => {
    const data = new Uint8ClampedArray(50 * 50 * 4).fill(255);
    expect(await decodeQr(data, 50, 50)).toBeNull();
  });
});
