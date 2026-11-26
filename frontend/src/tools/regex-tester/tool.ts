import type { Tool } from "../tools";

export const regexTester: Tool = {
  path: "regex-tester",
  name: "Regex Tester",
  category: "Text",
  description: "Test regular expressions with live match highlighting, capture groups and replace",
  icon: "mdi:regex",
  component: () => import("./regex-tester.vue"),
};
