import type { BrowserSupportCheck, Tool } from '../tools';

function checkBrowserSupport(): BrowserSupportCheck {
  try {
    const isSupported = typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined';
    return {
      isSupported,
      warningMessage: isSupported
        ? ''
        : "Your browser doesn't support the Web Crypto API (crypto.subtle). Encryption will fall back to JavaScript implementation.",
    };
  } catch {
    return {
      isSupported: false,
      warningMessage:
        "Your browser doesn't support the Web Crypto API (crypto.subtle). Encryption will fall back to JavaScript implementation.",
    };
  }
}

export const encryption: Tool = {
  path: 'encryption',
  name: 'Encryption',
  category: 'Crypto',
  description:
    'Encrypt and decrypt text using modern symmetric encryption algorithms. AES-GCM and ChaCha20-Poly1305 are recommended for most use cases',
  icon: 'solar:lock-keyhole-bold',
  component: () => import('./encryption-tool.vue'),
  checkBrowserSupport,
};
