import { describe, expect, it } from "vitest";
import { allTools } from "./index";

describe("tool registry", () => {
  it("discovers every tool, with unique paths", () => {
    expect(allTools.length).toBeGreaterThanOrEqual(16);
    const paths = allTools.map((t) => t.path);
    expect(new Set(paths).size).toBe(paths.length);
  });
});
