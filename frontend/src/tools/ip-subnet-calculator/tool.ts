import type { Tool } from "../tools";

export const ipSubnetCalculator: Tool = {
  path: "ip-subnet-calculator",
  name: "IP Subnet Calculator",
  category: "Network",
  description:
    "IPv4/IPv6 subnet calculator: split networks, check containment, range to CIDR, aggregate CIDRs",
  icon: "mdi:ip-network",
  component: () => import("./ip-subnet-calculator.vue"),
};
