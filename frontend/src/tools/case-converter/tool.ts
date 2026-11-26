import type { Tool } from "../tools";
export const caseConverter: Tool = {
  path: "case-converter",
  name: "Case Converter",
  category: "Converter",
  description:
    "Convert text between camelCase, PascalCase, snake_case, kebab-case, CONSTANT_CASE, Title Case and more",
  icon: "solar:text-field-bold",
  component: () => import("./case-converter.vue"),
};
