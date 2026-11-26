import type { Tool } from "../tools";
export const httpInspector: Tool = {
  path: "http-inspector",
  name: "HTTP Request Inspector",
  category: "Network",
  description:
    "Send an HTTP request and inspect redirects, headers, timings, TLS and security headers",
  icon: "mdi:web",
  component: () => import("./http-inspector.vue"),
};
