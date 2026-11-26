import {
  bytesToHex,
  hexToBytes,
  bytesToUtf8,
  utf8ToBytes,
  randomBytes,
} from "@noble/ciphers/utils.js";
import type { Cipher, AsyncCipher } from "@noble/ciphers/utils.js";

export type AlgoType = "AES-GCM" | "AES-CBC" | "AES-CTR" | "ChaCha20-Poly1305";

// Algorithm configuration
export const algoConfig: Record<AlgoType, { nonceSize: number; keySize: number }> = {
  "AES-GCM": { nonceSize: 12, keySize: 32 }, // key size 32 bytes means 256 bits
  "AES-CBC": { nonceSize: 16, keySize: 32 },
  "AES-CTR": { nonceSize: 16, keySize: 32 },
  "ChaCha20-Poly1305": { nonceSize: 12, keySize: 32 },
};

// Fixed, public salt: the tool has no place to carry a per-message salt.
// Use a high-entropy secret; the salt only prevents precomputed tables.
export const PBKDF2_SALT = "it-toolbox-encryption-v1";
export const PBKDF2_ITERATIONS = 100_000;

// Dynamic import for AES-GCM cipher
async function getGcm(key: Uint8Array, nonce: Uint8Array): Promise<Cipher | AsyncCipher> {
  if (crypto.subtle) {
    const { gcm } = await import("@noble/ciphers/webcrypto.js");
    return gcm(key, nonce);
  }
  const { gcm } = await import("@noble/ciphers/aes.js");
  return gcm(key, nonce);
}

// Dynamic import for AES-CBC cipher
async function getCbc(key: Uint8Array, nonce: Uint8Array): Promise<Cipher | AsyncCipher> {
  if (crypto.subtle) {
    const { cbc } = await import("@noble/ciphers/webcrypto.js");
    return cbc(key, nonce);
  }
  const { cbc } = await import("@noble/ciphers/aes.js");
  return cbc(key, nonce);
}

// Dynamic import for AES-CTR cipher
async function getCtr(key: Uint8Array, nonce: Uint8Array): Promise<Cipher | AsyncCipher> {
  if (crypto.subtle) {
    const { ctr } = await import("@noble/ciphers/webcrypto.js");
    return ctr(key, nonce);
  }
  const { ctr } = await import("@noble/ciphers/aes.js");
  return ctr(key, nonce);
}

// Dynamic import for ChaCha20-Poly1305 (no webcrypto version, always use pure JS)
async function getChacha20poly1305(key: Uint8Array, nonce: Uint8Array): Promise<Cipher> {
  const { chacha20poly1305 } = await import("@noble/ciphers/chacha.js");
  return chacha20poly1305(key, nonce);
}

async function getCipher(
  algorithm: AlgoType,
  key: Uint8Array,
  nonce: Uint8Array,
): Promise<Cipher | AsyncCipher> {
  switch (algorithm) {
    case "AES-GCM":
      return getGcm(key, nonce);
    case "AES-CBC":
      return getCbc(key, nonce);
    case "AES-CTR":
      return getCtr(key, nonce);
    case "ChaCha20-Poly1305":
      return getChacha20poly1305(key, nonce);
  }
}

// Derive a key from the secret using PBKDF2-HMAC-SHA256 (WebCrypto)
export async function deriveKey(secret: string, keySize: number): Promise<Uint8Array> {
  const baseKey = await crypto.subtle.importKey("raw", utf8ToBytes(secret), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: utf8ToBytes(PBKDF2_SALT),
      iterations: PBKDF2_ITERATIONS,
    },
    baseKey,
    keySize * 8,
  );
  return new Uint8Array(bits);
}

function parseNonce(nonceHex: string, algorithm: AlgoType): Uint8Array {
  const hex = nonceHex.trim();
  const size = algoConfig[algorithm].nonceSize;
  if (!/^([0-9a-fA-F]{2})+$/.test(hex) || hex.length !== size * 2) {
    throw new Error(`Nonce must be ${size} bytes (${size * 2} hex characters) for ${algorithm}.`);
  }
  return hexToBytes(hex);
}

// Encrypt. A random nonce is generated unless one is supplied; the nonce used is returned.
export async function encrypt(
  plaintext: string,
  secret: string,
  algorithm: AlgoType,
  nonceHex?: string,
): Promise<{ ciphertext: string; nonce: string }> {
  const config = algoConfig[algorithm];
  const key = await deriveKey(secret, config.keySize);
  const nonce = nonceHex ? parseNonce(nonceHex, algorithm) : randomBytes(config.nonceSize);
  const cipher = await getCipher(algorithm, key, nonce);
  const ciphertext = await cipher.encrypt(utf8ToBytes(plaintext));
  return { ciphertext: bytesToHex(ciphertext), nonce: bytesToHex(nonce) };
}

// Decrypt
export async function decrypt(
  ciphertextHex: string,
  secret: string,
  algorithm: AlgoType,
  nonceHex: string,
): Promise<string> {
  const config = algoConfig[algorithm];
  const key = await deriveKey(secret, config.keySize);
  const nonce = parseNonce(nonceHex, algorithm);
  const cipher = await getCipher(algorithm, key, nonce);
  return bytesToUtf8(await cipher.decrypt(hexToBytes(ciphertextHex.trim())));
}
