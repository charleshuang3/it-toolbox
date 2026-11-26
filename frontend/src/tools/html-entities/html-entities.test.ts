import { describe, it, expect } from "vitest";
import { encode, decode, escapeHtml } from "./html-entities";

describe("html entities", () => {
  it("escapes markup characters", () => {
    expect(escapeHtml(`<a href="x">T&C's</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;T&amp;C&#x27;s&lt;/a&gt;",
    );
  });

  it("leaves non-ASCII alone by default", () => {
    expect(encode("é <")).toBe("é &lt;");
  });

  it("encodes non-ASCII numerically", () => {
    expect(encode("é😀", { nonAscii: true })).toBe("&#233;&#128512;");
  });

  it("encodes non-ASCII as decimal or named", () => {
    expect(encode("é", { nonAscii: true, hex: true })).toBe("&#xE9;");
    expect(encode("é", { nonAscii: true })).toBe("&#233;");
    expect(encode("é", { nonAscii: true, named: true })).toBe("&eacute;");
  });

  it("decodes named, decimal and hex entities", () => {
    expect(decode("&lt;p&gt; &amp; &eacute; &#233; &#xE9; &copy;")).toBe("<p> & é é é ©");
  });

  it("round-trips", () => {
    const s = `<div class="a">héllo & 世界 😀</div>`;
    expect(decode(encode(s, { nonAscii: true, named: true }))).toBe(s);
  });
});
