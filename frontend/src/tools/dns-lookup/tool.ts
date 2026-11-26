import type { Tool } from "../tools";

export const dnsLookup: Tool = {
  path: "dns-lookup",
  name: "DNS Lookup",
  category: "Network",
  description: "Query DNS records through several resolvers and compare their answers",
  icon: "mdi:dns",
  component: () => import("./dns-lookup.vue"),
};
