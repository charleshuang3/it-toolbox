import { bytesToHex } from '@noble/ciphers/utils.js';

export type OutputEncoding = 'hex' | 'base64' | 'base64url' | 'binary';

/**
 * Converts Uint8Array to Base64 string
 */
export function bytesToBase64(bytes: Uint8Array): string {
  // @ts-expect-error: toBase64 is supported on browsers.
  if (bytes.toBase64) {
    // @ts-expect-error: toBase64 is supported on browsers.
    return bytes.toBase64();
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Converts Uint8Array to Base64URL string (URL-safe variant)
 */
export function bytesToBase64url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Converts Uint8Array to binary string (base 2)
 */
export function bytesToBinary(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(2).padStart(8, '0'))
    .join('');
}

/**
 * Formats bytes according to the specified encoding
 */
export function formatBytes(bytes: Uint8Array, encoding: OutputEncoding): string {
  switch (encoding) {
    case 'hex':
      return bytesToHex(bytes);
    case 'binary':
      return bytesToBinary(bytes);
    case 'base64url':
      return bytesToBase64url(bytes);
    case 'base64':
    default:
      return bytesToBase64(bytes);
  }
}
