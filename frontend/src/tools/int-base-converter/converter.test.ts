import { describe, it, expect } from 'vitest';
import { convertBase, validInt } from './converter';

describe('convertBase', () => {
  describe('decimal conversions', () => {
    it('should convert decimal to binary', () => {
      expect(convertBase({ value: '10', fromBase: 10, toBase: 2 })).toBe('1010');
    });

    it('should convert decimal to hex', () => {
      expect(convertBase({ value: '255', fromBase: 10, toBase: 16 })).toBe('ff');
    });

    it('should convert decimal to octal', () => {
      expect(convertBase({ value: '8', fromBase: 10, toBase: 8 })).toBe('10');
    });
  });

  describe('binary conversions', () => {
    it('should convert binary to decimal', () => {
      expect(convertBase({ value: '1010', fromBase: 2, toBase: 10 })).toBe('10');
    });

    it('should convert binary to hex', () => {
      expect(convertBase({ value: '11111111', fromBase: 2, toBase: 16 })).toBe('ff');
    });
  });

  describe('hex conversions', () => {
    it('should convert hex to decimal', () => {
      expect(convertBase({ value: 'ff', fromBase: 16, toBase: 10 })).toBe('255');
    });

    it('should convert hex to binary', () => {
      expect(convertBase({ value: 'ff', fromBase: 16, toBase: 2 })).toBe('11111111');
    });
  });

  describe('edge cases', () => {
    it('should handle zero', () => {
      expect(convertBase({ value: '0', fromBase: 10, toBase: 2 })).toBe('0');
    });

    it('should handle base 36', () => {
      expect(convertBase({ value: 'z', fromBase: 36, toBase: 10 })).toBe('35');
    });

    it('should handle large numbers', () => {
      expect(convertBase({ value: 'ffffffff', fromBase: 16, toBase: 10 })).toBe('4294967295');
    });
  });

  describe('error cases', () => {
    it('should throw error for invalid digit', () => {
      expect(() => convertBase({ value: '2', fromBase: 2, toBase: 10 })).toThrow('Invalid digit "2" for base 2');
    });
  });
});

describe('validInt', () => {
  describe('valid inputs', () => {
    it('should return empty string for valid decimal', () => {
      expect(validInt('42', 10)).toBe('');
    });

    it('should return empty string for valid binary', () => {
      expect(validInt('1010', 2)).toBe('');
    });

    it('should return empty string for valid hex', () => {
      expect(validInt('ff', 16)).toBe('');
    });

    it('should return empty string for valid base 36', () => {
      expect(validInt('z', 36)).toBe('');
    });

    it('should return empty string for valid base 64', () => {
      expect(validInt('abc+/', 64)).toBe('');
    });

    it('should return empty string for zero', () => {
      expect(validInt('0', 10)).toBe('');
    });

    it('should return empty string for lowercase hex', () => {
      expect(validInt('abc', 16)).toBe('');
    });
  });

  describe('invalid base', () => {
    it('should return error for base below 2', () => {
      expect(validInt('10', 1)).toBe('Base must be between 2 and 64');
    });

    it('should return error for base above 64', () => {
      expect(validInt('10', 65)).toBe('Base must be between 2 and 64');
    });
  });

  describe('empty input', () => {
    it('should return error for empty string', () => {
      expect(validInt('', 10)).toBe('Input value cannot be empty');
    });

    it('should return error for whitespace only', () => {
      expect(validInt('   ', 10)).toBe('Input value cannot be empty');
    });
  });

  describe('invalid digits', () => {
    it('should return error for digit 2 in binary', () => {
      expect(validInt('2', 2)).toBe('Invalid digit "2" for base 2');
    });

    it('should return error for digit g in hex', () => {
      expect(validInt('g', 16)).toBe('Invalid digit "g" for base 16');
    });

    it('should return error for digit z in base 35', () => {
      expect(validInt('z', 35)).toBe('Invalid digit "z" for base 35');
    });

    it('should return error for invalid character', () => {
      expect(validInt('abc!', 16)).toBe('Invalid digit "!" for base 16');
    });
  });
});
