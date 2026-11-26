import { describe, it, expect } from "vitest";
import { runRegex, toSegments, groupNameMap, MAX_MATCHES, MAX_TEXT_LENGTH } from "./regex-tester";

describe("regex-tester", () => {
  it("returns nothing for empty pattern", () => {
    const r = runRegex({ pattern: "", flags: "g", text: "abc" });
    expect(r.matches).toEqual([]);
    expect(r.error).toBe("");
  });

  it("finds global matches with indexes", () => {
    const r = runRegex({ pattern: "a+", flags: "g", text: "aa b a" });
    expect(r.matches.map((m) => [m.text, m.index, m.end])).toEqual([
      ["aa", 0, 2],
      ["a", 5, 6],
    ]);
  });

  it("finds only first match without g", () => {
    const r = runRegex({ pattern: "a", flags: "", text: "aaa" });
    expect(r.matches).toHaveLength(1);
  });

  it("reports capture groups, including named ones", () => {
    const r = runRegex({ pattern: "(?<year>\\d{4})-(\\d{2})", flags: "g", text: "2024-05" });
    expect(r.matches[0]!.groups).toEqual([
      { index: 1, name: "year", value: "2024" },
      { index: 2, value: "05" },
    ]);
  });

  it("reports an error for an invalid pattern", () => {
    expect(runRegex({ pattern: "(", flags: "g", text: "x" }).error).not.toBe("");
  });

  it("reports an error for invalid flags", () => {
    expect(runRegex({ pattern: "a", flags: "z", text: "x" }).error).not.toBe("");
  });

  it("does not loop forever on empty matches", () => {
    const r = runRegex({ pattern: "x*", flags: "g", text: "abc" });
    expect(r.matches).toHaveLength(4);
  });

  it("caps the number of matches", () => {
    const r = runRegex({ pattern: "a", flags: "g", text: "a".repeat(MAX_MATCHES + 50) });
    expect(r.matches).toHaveLength(MAX_MATCHES);
    expect(r.truncated).toBe(true);
  });

  it("rejects overly long text", () => {
    const r = runRegex({ pattern: "a", flags: "g", text: "a".repeat(MAX_TEXT_LENGTH + 1) });
    expect(r.error).toMatch(/too long/);
  });

  it("performs replacement with group references", () => {
    const r = runRegex({
      pattern: "(\\w+)@(\\w+)",
      flags: "g",
      text: "me@host you@box",
      replacement: "$2:$1",
    });
    expect(r.replaced).toBe("host:me box:you");
  });

  it("replaces only first without g flag", () => {
    const r = runRegex({ pattern: "a", flags: "", text: "aaa", replacement: "b" });
    expect(r.replaced).toBe("baa");
  });

  it("maps group names", () => {
    expect(groupNameMap("(a)(?:b)(?<n>c)[(](?<=x)\\((d)")).toEqual(new Map([[2, "n"]]));
  });

  it("builds segments", () => {
    const r = runRegex({ pattern: "b", flags: "g", text: "abcb" });
    expect(toSegments("abcb", r.matches)).toEqual([
      { text: "a", matchIndex: null },
      { text: "b", matchIndex: 0 },
      { text: "c", matchIndex: null },
      { text: "b", matchIndex: 1 },
    ]);
  });
});
