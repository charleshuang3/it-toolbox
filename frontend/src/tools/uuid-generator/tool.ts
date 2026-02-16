import type { Tool, BrowserSupportCheck } from '../tools';

function checkBrowserSupport(): BrowserSupportCheck {
  try {
    const isSupported = typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function';
    return {
      isSupported,
      warningMessage: isSupported
        ? ''
        : "Your browser doesn't support secure random generation (crypto.getRandomValues). UUIDs will fall back to Math.random() which may not be cryptographically secure.",
    };
  } catch {
    return {
      isSupported: false,
      warningMessage:
        "Your browser doesn't support secure random generation (crypto.getRandomValues). UUIDs will fall back to Math.random() which may not be cryptographically secure.",
    };
  }
}

export const uuidGenerator: Tool = {
  path: 'uuid-generator',
  name: 'UUID Generator',
  category: 'Crypto',
  description: 'UUID is a 128-bit number used to identify information, this tool supports v4, v5, v7',
  icon: 'fluent-emoji-high-contrast:id-button',
  component: () => import('./uuid-generator.vue'),
  checkBrowserSupport,
};
