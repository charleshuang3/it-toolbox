import type { Tool } from "../tools";

export const qrCodeTool: Tool = {
  path: "qr-code",
  name: "QR Code",
  category: "Converter",
  description: "Generate QR codes from text and decode QR codes from images, all in your browser.",
  icon: "solar:qr-code-bold",
  component: () => import("./qr-code.vue"),
};
