import type { Tool } from "../tools";

export const cronParser: Tool = {
  path: "cron-parser",
  name: "Cron Parser",
  category: "Time",
  description: "Explain a cron expression in plain English and list its next run times",
  icon: "mdi:calendar-clock",
  component: () => import("./cron-parser.vue"),
};
