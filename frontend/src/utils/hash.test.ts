import { describe, it, expect } from 'vitest';
import { hashText, hashBytes, getHashFunction, hmacText } from './hash';
import { bytesToHex } from '@noble/ciphers/utils.js';

describe('hash', () => {
  describe('hashText', () => {
    it('should hash "hello" with sha256', async () => {
      const result = await hashText('sha256', 'hello');
      expect(bytesToHex(result)).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
    });

    it('should hash empty string with sha256', async () => {
      const result = await hashText('sha256', '');
      expect(bytesToHex(result)).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });

    it('should hash "hello" with md5', async () => {
      const result = await hashText('md5', 'hello');
      expect(bytesToHex(result)).toBe('5d41402abc4b2a76b9719d911017c592');
    });

    it('should hash "hello" with sha1', async () => {
      const result = await hashText('sha1', 'hello');
      expect(bytesToHex(result)).toBe('aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d');
    });
  });

  describe('hashBytes', () => {
    it('should hash bytes with sha256', async () => {
      const bytes = new TextEncoder().encode('hello');
      const result = await hashBytes('sha256', bytes);
      expect(bytesToHex(result)).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
    });

    it('should hash empty bytes', async () => {
      const result = await hashBytes('sha256', new Uint8Array([]));
      expect(result.length).toBe(32);
    });
  });

  describe('getHashFunction', () => {
    it('should return a function for sha256', async () => {
      const fn = await getHashFunction('sha256');
      expect(typeof fn).toBe('function');
    });

    it('should cache hash functions', async () => {
      const fn1 = await getHashFunction('sha256');
      const fn2 = await getHashFunction('sha256');
      expect(fn1).toBe(fn2);
    });
  });

  describe('hmacText', () => {
    it('should compute HMAC-SHA256', async () => {
      const result = await hmacText('sha256', 'key', 'message');
      expect(bytesToHex(result)).toBe('6e9ef29b75fffc5b7abae527d58fdadb2fe42e7219011976917343065f58ed4a');
    });
  });
});
