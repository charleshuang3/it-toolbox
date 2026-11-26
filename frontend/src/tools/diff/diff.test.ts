import { describe, it, expect } from "vitest";
import { computeDiff, normalizeJson, buildRows, splitPanes, sortKeysDeep } from "./diff";

describe("diff", () => {
  describe("computeDiff line mode", () => {
    it("reports identical texts", () => {
      const r = computeDiff("a\nb\n", "a\nb\n", { mode: "line" });
      expect(r.identical).toBe(true);
      expect(r.added).toBe(0);
      expect(r.removed).toBe(0);
    });

    it("counts added and removed lines", () => {
      const r = computeDiff("a\nb\nc\n", "a\nx\nc\nd\n", { mode: "line" });
      expect(r.removed).toBe(1);
      expect(r.added).toBe(2);
      expect(r.identical).toBe(false);
    });

    it("can ignore whitespace", () => {
      const r = computeDiff("  a b  \n", "a b\n", { mode: "line", ignoreWhitespace: true });
      expect(r.identical).toBe(true);
    });
  });

  describe("computeDiff word mode", () => {
    it("diffs by word", () => {
      const r = computeDiff("the quick fox", "the slow fox", { mode: "word" });
      expect(r.lineBased).toBe(false);
      expect(r.parts.find((p) => p.type === "del")?.text).toContain("quick");
      expect(r.parts.find((p) => p.type === "add")?.text).toContain("slow");
    });
  });

  describe("computeDiff json mode", () => {
    it("ignores key order and formatting", () => {
      const r = computeDiff('{"b":1,"a":{"d":2,"c":3}}', '{\n "a": {"c":3,"d":2},\n "b": 1\n}', {
        mode: "json",
      });
      expect(r.error).toBe("");
      expect(r.identical).toBe(true);
    });

    it("detects value differences", () => {
      const r = computeDiff('{"a":1}', '{"a":2}', { mode: "json" });
      expect(r.identical).toBe(false);
      expect(r.added).toBe(1);
      expect(r.removed).toBe(1);
    });

    it("reports invalid JSON on the left", () => {
      const r = computeDiff("{oops", "{}", { mode: "json" });
      expect(r.error).toMatch(/Left side/);
    });

    it("reports invalid JSON on the right", () => {
      const r = computeDiff("{}", "[1,", { mode: "json" });
      expect(r.error).toMatch(/Right side/);
    });
  });

  describe("normalizeJson", () => {
    it("sorts keys deeply but keeps array order", () => {
      expect(normalizeJson('{"b":[2,1],"a":1}')).toBe(
        '{\n  "a": 1,\n  "b": [\n    2,\n    1\n  ]\n}',
      );
      expect(sortKeysDeep([{ z: 1, a: 2 }])).toEqual([{ a: 2, z: 1 }]);
    });
  });

  describe("buildRows", () => {
    it("pairs removed and added lines", () => {
      const r = computeDiff("a\nb\nc\n", "a\nx\nc\n", { mode: "line" });
      const rows = buildRows(r.parts);
      expect(rows).toHaveLength(3);
      expect(rows[1]!.left).toEqual({ no: 2, text: "b", type: "del" });
      expect(rows[1]!.right).toEqual({ no: 2, text: "x", type: "add" });
    });

    it("pads when only additions exist", () => {
      const rows = buildRows(computeDiff("a\n", "a\nb\n", { mode: "line" }).parts);
      expect(rows[1]!.left).toBeNull();
      expect(rows[1]!.right?.text).toBe("b");
    });
  });

  describe("splitPanes", () => {
    it("separates left and right content", () => {
      const r = computeDiff("a b", "a c", { mode: "word" });
      const { left, right } = splitPanes(r.parts);
      expect(left.map((p) => p.text).join("")).toBe("a b");
      expect(right.map((p) => p.text).join("")).toBe("a c");
    });
  });
});
