import type { Tool } from "../tools";

export const diffTool: Tool = {
  path: "diff",
  name: "Text Diff",
  category: "Text",
  description: "Compare two texts by line or word, side-by-side or inline, with a JSON-aware mode",
  icon: "mdi:file-compare",
  component: () => import("./diff.vue"),
};
