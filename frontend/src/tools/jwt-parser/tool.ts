import type { Tool, BrowserSupportCheck } from '../tools';

function checkBrowserSupport(): BrowserSupportCheck {
  try {
    const isSupported = typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined';
    return {
      isSupported,
      warningMessage: isSupported
        ? ''
        : "Your browser doesn't support the Web Crypto API (crypto.subtle). JWT signature verification will not be available.",
    };
  } catch {
    return {
      isSupported: false,
      warningMessage:
        "Your browser doesn't support the Web Crypto API (crypto.subtle). JWT signature verification will not be available.",
    };
  }
}

export const jwtParser: Tool = {
  path: 'jwt-parser',
  name: 'JWT Parser',
  category: 'Crypto',
  description:
    'Decode and verify JSON Web Tokens (RFC 7519), which are a standard method for representing claims securely between two parties',
  icon: 'tabler:key',
  component: () => import('./jwt-parser.vue'),
  checkBrowserSupport,
};
