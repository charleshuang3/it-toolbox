import { describe, it, expect } from "vitest";
import { encodeText, decodeText, base64ToBytes, bytesToBase64, stripDataUri } from "./base64";

describe("base64", () => {
  it("encodes ascii", () => {
    expect(encodeText("hello")).toBe("aGVsbG8=");
  });

  it("round-trips UTF-8", () => {
    const s = "héllo 世界 😀";
    expect(decodeText(encodeText(s))).toBe(s);
  });

  it("supports url-safe and no padding", () => {
    const bytes = new Uint8Array([0xfb, 0xff, 0xfe]);
    expect(bytesToBase64(bytes)).toBe("+//+");
    expect(bytesToBase64(bytes, { urlSafe: true })).toBe("-__-");
    expect(bytesToBase64(new Uint8Array([1]), { padding: false })).toBe("AQ");
  });

  it("decodes url-safe and unpadded input", () => {
    expect(Array.from(base64ToBytes("-__-"))).toEqual([0xfb, 0xff, 0xfe]);
    expect(decodeText("aGVsbG8")).toBe("hello");
  });

  it("ignores whitespace", () => {
    expect(decodeText("aGVs\nbG8=")).toBe("hello");
  });

  it("throws on invalid input", () => {
    expect(() => decodeText("a$b")).toThrow(/Invalid Base64/);
    expect(() => decodeText("abcde")).toThrow(/length/);
  });

  it("throws on non UTF-8 bytes", () => {
    expect(() => decodeText(bytesToBase64(new Uint8Array([0xff, 0xfe])))).toThrow(/UTF-8/);
  });

  it("handles large input", () => {
    const bytes = new Uint8Array(100000).fill(65);
    expect(base64ToBytes(bytesToBase64(bytes)).length).toBe(100000);
  });

  it("strips data URI prefix", () => {
    expect(stripDataUri("data:text/plain;base64,aGk=")).toBe("aGk=");
    expect(stripDataUri("aGk=")).toBe("aGk=");
  });
});
