import type { Tool, BrowserSupportCheck } from '../tools';

function checkBrowserSupport(): BrowserSupportCheck {
  try {
    const isSupported = typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function';
    return {
      isSupported,
      warningMessage: isSupported
        ? ''
        : "Your browser doesn't support secure random generation (crypto.getRandomValues). Strings will fall back to Math.random() which may not be cryptographically secure.",
    };
  } catch {
    return {
      isSupported: false,
      warningMessage:
        "Your browser doesn't support secure random generation (crypto.getRandomValues). Strings will fall back to Math.random() which may not be cryptographically secure.",
    };
  }
}

export const randomStringGenerator: Tool = {
  path: 'random-string-generator',
  name: 'Random String Generator',
  category: 'Crypto',
  description: 'Generate random strings with customizable character sets, length, and quantity',
  icon: 'solar:text-bold',
  component: () => import('./random-string-generator.vue'),
  checkBrowserSupport,
};
