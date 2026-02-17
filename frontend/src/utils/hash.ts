import type { CHash } from '@noble/hashes/utils.js';
import { WebHash } from '@noble/hashes/webcrypto.js';

const cryptoSubtleSupported = typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined';

// Hash type definitions
export type HashType =
  | 'md5'
  | 'sha1'
  | 'ripemd160'
  | 'sha224'
  | 'sha256'
  | 'sha384'
  | 'sha512'
  | 'sha3_224'
  | 'sha3_256'
  | 'sha3_384'
  | 'sha3_512'
  | 'keccak_256';

// Cache for loaded hash functions
const hashCache = new Map<HashType, CHash | WebHash>();

/**
 * Get a hash function by its type name.
 * Uses lazy loading to only import the hash functions that are actually used.
 * @param hashType - The type of hash function to retrieve
 * @returns The hash function (CHash type from noble/hashes)
 */
export async function getHashFunction(hashType: HashType): Promise<CHash | WebHash> {
  // Check cache first
  const cached = hashCache.get(hashType);
  if (cached) {
    return cached;
  }

  let hashFn: CHash | WebHash;

  switch (hashType) {
    case 'md5': {
      const { md5 } = await import('@noble/hashes/legacy.js');
      hashFn = md5;
      break;
    }
    case 'sha1': {
      const { sha1 } = await import('@noble/hashes/legacy.js');
      hashFn = sha1;
      break;
    }
    case 'ripemd160': {
      const { ripemd160 } = await import('@noble/hashes/legacy.js');
      hashFn = ripemd160;
      break;
    }
    case 'sha224': {
      const { sha224 } = await import('@noble/hashes/sha2.js');
      hashFn = sha224;
      break;
    }
    case 'sha256': {
      if (cryptoSubtleSupported) {
        const { sha256 } = await import('@noble/hashes/webcrypto.js');
        hashFn = sha256;
        break;
      }
      const { sha256 } = await import('@noble/hashes/sha2.js');
      hashFn = sha256;
      break;
    }
    case 'sha384': {
      if (cryptoSubtleSupported) {
        const { sha384 } = await import('@noble/hashes/webcrypto.js');
        hashFn = sha384;
        break;
      }
      const { sha384 } = await import('@noble/hashes/sha2.js');
      hashFn = sha384;
      break;
    }
    case 'sha512': {
      if (cryptoSubtleSupported) {
        const { sha512 } = await import('@noble/hashes/webcrypto.js');
        hashFn = sha512;
        break;
      }
      const { sha512 } = await import('@noble/hashes/sha2.js');
      hashFn = sha512;
      break;
    }
    case 'sha3_224': {
      const { sha3_224 } = await import('@noble/hashes/sha3.js');
      hashFn = sha3_224;
      break;
    }
    case 'sha3_256': {
      const { sha3_256 } = await import('@noble/hashes/sha3.js');
      hashFn = sha3_256;
      break;
    }
    case 'sha3_384': {
      const { sha3_384 } = await import('@noble/hashes/sha3.js');
      hashFn = sha3_384;
      break;
    }
    case 'sha3_512': {
      const { sha3_512 } = await import('@noble/hashes/sha3.js');
      hashFn = sha3_512;
      break;
    }
    case 'keccak_256': {
      const { keccak_256 } = await import('@noble/hashes/sha3.js');
      hashFn = keccak_256;
      break;
    }
    default:
      throw new Error(`Unknown hash type: ${hashType}`);
  }

  // Cache the result
  hashCache.set(hashType, hashFn);
  return hashFn;
}

/**
 * Hash text using the specified hash algorithm.
 * @param hashType - The type of hash function to use
 * @param text - The text to hash
 * @returns The hash as a Uint8Array
 */
export async function hashText(hashType: HashType, text: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const inputBytes = encoder.encode(text);
  return hashBytes(hashType, inputBytes);
}

/**
 * Hash bytes using the specified hash algorithm.
 * @param hashType - The type of hash function to use
 * @param bytes - The bytes to hash
 * @returns The hash as a Uint8Array
 */
export async function hashBytes(hashType: HashType, bytes: Uint8Array): Promise<Uint8Array> {
  const hashFn = await getHashFunction(hashType);
  return hashFn(bytes);
}

export async function hmacText(hashType: HashType, key: string, message: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const messageBytes = encoder.encode(message);
  const keyBytes = encoder.encode(key);
  const f = await getHashFunction(hashType);
  if (cryptoSubtleSupported && 'webCryptoName' in f) {
    const { hmac } = await import('@noble/hashes/webcrypto.js');
    return hmac(f as WebHash, keyBytes, messageBytes);
  }
  const { hmac } = await import('@noble/hashes/hmac.js');
  return hmac(f as CHash, keyBytes, messageBytes);
}
