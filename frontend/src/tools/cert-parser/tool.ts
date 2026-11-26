import type { BrowserSupportCheck, Tool } from "../tools";

const WARNING =
  "Your browser doesn't support the Web Crypto API (crypto.subtle). Fingerprints and signature verification will not be available.";

function checkBrowserSupport(): BrowserSupportCheck {
  try {
    const isSupported = typeof crypto !== "undefined" && typeof crypto.subtle !== "undefined";
    return { isSupported, warningMessage: isSupported ? "" : WARNING };
  } catch {
    return { isSupported: false, warningMessage: WARNING };
  }
}

export const certParser: Tool = {
  path: "cert-parser",
  name: "Certificate Parser",
  category: "Crypto",
  description:
    "Decode X.509 certificates, chains, CSRs and public keys (PEM or DER) in your browser. Inspect subject, SANs, validity, extensions, fingerprints and verify chain signatures.",
  icon: "mdi:certificate-outline",
  component: () => import("./cert-parser.vue"),
  checkBrowserSupport,
};
