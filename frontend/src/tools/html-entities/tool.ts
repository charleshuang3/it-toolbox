import type { Tool } from "../tools";
export const htmlEntities: Tool = {
  path: "html-entities",
  name: "HTML Entities",
  category: "Converter",
  description: "Encode and decode HTML entities (named, decimal and hexadecimal)",
  icon: "solar:code-bold",
  component: () => import("./html-entities.vue"),
};
