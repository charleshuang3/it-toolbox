import type { Tool, BrowserSupportCheck } from '../tools';

function checkBrowserSupport(): BrowserSupportCheck {
  try {
    const isSupported = typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function';
    return {
      isSupported,
      warningMessage: isSupported
        ? ''
        : "Your browser doesn't support secure random generation (crypto.getRandomValues). ULIDs will fall back to Math.random() which may not be cryptographically secure.",
    };
  } catch {
    return {
      isSupported: false,
      warningMessage:
        "Your browser doesn't support secure random generation (crypto.getRandomValues). ULIDs will fall back to Math.random() which may not be cryptographically secure.",
    };
  }
}

export const ulidGenerator: Tool = {
  path: 'ulid-generator',
  name: 'ULID Generator',
  category: 'Crypto',
  description: 'ULID is a 128-bit lexicographically sortable identifier, alternative to UUID with better sortability',
  icon: 'fluent-emoji-high-contrast:id-button',
  component: () => import('./ulid-generator.vue'),
  checkBrowserSupport,
};
