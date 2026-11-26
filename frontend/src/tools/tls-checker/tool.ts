import type { Tool } from "../tools";
export const tlsCheckerTool: Tool = {
  path: "tls-checker",
  name: "TLS Certificate Checker",
  category: "Network",
  description: "Inspect a server's TLS certificate chain, protocol versions and validity",
  icon: "mdi:certificate",
  component: () => import("./tls-checker.vue"),
};
