import type { Tool } from "../tools";

export const colorConverterTool: Tool = {
  path: "color-converter",
  name: "Color Converter",
  category: "Converter",
  description:
    "Convert colors between HEX, RGB, HSL, HWB and OKLCH, and check WCAG contrast between two colors.",
  icon: "solar:palette-bold",
  component: () => import("./color-converter.vue"),
};
