import { describe, it, expect } from 'vitest';
import { bytesToBase64, bytesToBase64url, bytesToBinary, formatBytes } from './bytes-formatter';

describe('bytes-formatter', () => {
  describe('bytesToBase64', () => {
    it('should convert empty bytes to empty base64', () => {
      const result = bytesToBase64(new Uint8Array([]));
      expect(result).toBe('');
    });

    it('should convert single byte to base64', () => {
      // 0x00 = '\x00' = ''
      const result = bytesToBase64(new Uint8Array([0]));
      expect(result).toBe('AA==');
    });

    it('should convert "Hello" to base64', () => {
      const encoder = new TextEncoder();
      const bytes = encoder.encode('Hello');
      const result = bytesToBase64(bytes);
      expect(result).toBe('SGVsbG8=');
    });

    it('should convert "Hello World" to base64', () => {
      const encoder = new TextEncoder();
      const bytes = encoder.encode('Hello World');
      const result = bytesToBase64(bytes);
      expect(result).toBe('SGVsbG8gV29ybGQ=');
    });

    it('should convert bytes with special characters', () => {
      const bytes = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x20, 0xe2, 0x9c, 0x93]); // "Hello ✓"
      const result = bytesToBase64(bytes);
      expect(result).toBe('SGVsbG8g4pyT');
    });
  });

  describe('bytesToBase64url', () => {
    it('should convert empty bytes to empty base64url', () => {
      const result = bytesToBase64url(new Uint8Array([]));
      expect(result).toBe('');
    });

    it('should convert "Hello" to base64url', () => {
      const encoder = new TextEncoder();
      const bytes = encoder.encode('Hello');
      const result = bytesToBase64url(bytes);
      expect(result).toBe('SGVsbG8');
    });

    it('should replace + with -', () => {
      // Create bytes that would produce + in base64
      // This is tricky to test directly, but we can test the character replacement
      const bytes = new Uint8Array([0xfb, 0xef, 0xbe]); // Produces ++ in standard base64
      const result = bytesToBase64url(bytes);
      expect(result).not.toContain('+');
      expect(result).toContain('-');
    });

    it('should replace / with _', () => {
      // Create bytes that would produce / in base64
      const bytes = new Uint8Array([0xff, 0xff, 0xff]); // Produces // in standard base64
      const result = bytesToBase64url(bytes);
      expect(result).not.toContain('/');
      expect(result).toContain('_');
    });

    it('should remove padding', () => {
      const encoder = new TextEncoder();
      const bytes = encoder.encode('Hello');
      const result = bytesToBase64url(bytes);
      expect(result).not.toContain('=');
    });
  });

  describe('bytesToBinary', () => {
    it('should convert empty bytes to empty binary', () => {
      const result = bytesToBinary(new Uint8Array([]));
      expect(result).toBe('');
    });

    it('should convert 0x00 to 8 zeros', () => {
      const result = bytesToBinary(new Uint8Array([0]));
      expect(result).toBe('00000000');
    });

    it('should convert 0xff to 8 ones', () => {
      const result = bytesToBinary(new Uint8Array([255]));
      expect(result).toBe('11111111');
    });

    it('should convert "Hi" to binary', () => {
      const encoder = new TextEncoder();
      const bytes = encoder.encode('Hi');
      // H = 0x48 = 01001000
      // i = 0x69 = 01101001
      const result = bytesToBinary(bytes);
      expect(result).toBe('0100100001101001');
    });

    it('should pad each byte to 8 bits', () => {
      const result = bytesToBinary(new Uint8Array([1]));
      expect(result).toBe('00000001');
    });
  });

  describe('formatBytes', () => {
    const testBytes = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]); // "Hello"

    it('should format as hex', () => {
      const result = formatBytes(testBytes, 'hex');
      expect(result).toBe('48656c6c6f');
    });

    it('should format as base64', () => {
      const result = formatBytes(testBytes, 'base64');
      expect(result).toBe('SGVsbG8=');
    });

    it('should format as base64url', () => {
      const result = formatBytes(testBytes, 'base64url');
      expect(result).toBe('SGVsbG8');
    });

    it('should format as binary', () => {
      const result = formatBytes(testBytes, 'binary');
      // H = 01001000, e = 01100101, l = 01101100, l = 01101100, o = 01101111
      expect(result).toBe('0100100001100101011011000110110001101111');
    });

    it('should default to base64 for unknown encoding', () => {
      const result = formatBytes(testBytes, 'unknown' as 'base64');
      expect(result).toBe('SGVsbG8=');
    });

    it('should handle empty bytes', () => {
      const emptyBytes = new Uint8Array([]);
      expect(formatBytes(emptyBytes, 'hex')).toBe('');
      expect(formatBytes(emptyBytes, 'base64')).toBe('');
      expect(formatBytes(emptyBytes, 'base64url')).toBe('');
      expect(formatBytes(emptyBytes, 'binary')).toBe('');
    });
  });
});
