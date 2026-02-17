import type { BrowserSupportCheck, Tool } from '../tools';

function checkBrowserSupport(): BrowserSupportCheck {
  try {
    const isSupported = typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined';
    return {
      isSupported,
      warningMessage: isSupported
        ? ''
        : "Your browser doesn't support the Web Crypto API (crypto.subtle). HMAC will fall back to JavaScript implementation.",
    };
  } catch {
    return {
      isSupported: false,
      warningMessage:
        "Your browser doesn't support the Web Crypto API (crypto.subtle). HMAC will fall back to JavaScript implementation.",
    };
  }
}

export const hmacTool: Tool = {
  path: 'hmac',
  name: 'HMAC',
  category: 'Crypto',
  description:
    'Generate HMAC (Hash-based Message Authentication Code) using various hash functions. HMAC provides message integrity and authentication using a secret key.',
  icon: 'solar:key-bold',
  component: () => import('./hmac-generator.vue'),
  checkBrowserSupport,
};
