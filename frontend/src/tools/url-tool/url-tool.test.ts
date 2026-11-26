import { describe, it, expect } from "vitest";
import { encodeUrl, decodeUrl, parseUrl, buildUrl } from "./url-tool";

describe("encode/decode", () => {
  it("component mode escapes reserved characters", () => {
    expect(encodeUrl("a b&c=d/é", "component")).toBe("a%20b%26c%3Dd%2F%C3%A9");
  });

  it("uri mode keeps reserved characters", () => {
    expect(encodeUrl("https://x.com/a b?q=1&r=é", "uri")).toBe("https://x.com/a%20b?q=1&r=%C3%A9");
  });

  it("decodes both modes", () => {
    expect(decodeUrl("a%20b%26c", "component")).toBe("a b&c");
    expect(decodeUrl("a%20b%26c", "uri")).toBe("a b%26c");
  });

  it("throws on malformed input", () => {
    expect(() => decodeUrl("%E0%A4%A", "component")).toThrow(/Malformed/);
  });
});

describe("parseUrl", () => {
  it("parses all parts", () => {
    const p = parseUrl("https://user:pw@example.com:8080/a/b?x=1&y=hello%20world&x=2#frag");
    expect(p.protocol).toBe("https:");
    expect(p.username).toBe("user");
    expect(p.password).toBe("pw");
    expect(p.hostname).toBe("example.com");
    expect(p.port).toBe("8080");
    expect(p.pathname).toBe("/a/b");
    expect(p.hash).toBe("#frag");
    expect(p.params).toEqual([
      { key: "x", value: "1" },
      { key: "y", value: "hello world" },
      { key: "x", value: "2" },
    ]);
  });

  it("throws on invalid URL", () => {
    expect(() => parseUrl("not a url")).toThrow(/Invalid URL/);
  });
});

describe("buildUrl", () => {
  it("round-trips with edited params", () => {
    const p = parseUrl("https://example.com/p?a=1#h");
    p.params.push({ key: "b c", value: "d&e" });
    expect(buildUrl(p)).toBe("https://example.com/p?a=1&b+c=d%26e#h");
  });

  it("drops empty rows", () => {
    const p = parseUrl("https://example.com/");
    p.params.push({ key: "", value: "" });
    expect(buildUrl(p)).toBe("https://example.com/");
  });
});
