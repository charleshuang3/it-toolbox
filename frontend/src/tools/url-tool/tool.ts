import type { Tool } from "../tools";
export const urlTool: Tool = {
  path: "url-tool",
  name: "URL Encode/Decode & Parser",
  category: "Converter",
  description: "Encode and decode URLs, and parse a URL into parts with editable query parameters",
  icon: "solar:link-bold",
  component: () => import("./url-tool.vue"),
};
