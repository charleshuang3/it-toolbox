import type { Tool } from "../tools";
export const base64: Tool = {
  path: "base64",
  name: "Base64",
  category: "Converter",
  description:
    "Encode and decode Base64 text (UTF-8, URL-safe) and convert files to and from Base64",
  icon: "solar:code-square-bold",
  component: () => import("./base64.vue"),
};
