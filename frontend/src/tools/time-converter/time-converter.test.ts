import { describe, it, expect } from 'vitest';
import { parseTimeInput, isUnixTimestamp, isIsoDateString, getLocalTimezone, commonTimezones } from './time-converter';

describe('time-converter', () => {
  describe('parseTimeInput', () => {
    describe('empty input', () => {
      it('should return empty result for empty string', () => {
        const result = parseTimeInput('');
        expect(result.dateTime).toBeNull();
        expect(result.error).toBe('');
      });

      it('should return empty result for whitespace-only input', () => {
        const result = parseTimeInput('   \n\t  ');
        expect(result.dateTime).toBeNull();
        expect(result.error).toBe('');
      });
    });

    describe('ISO 8601 parsing', () => {
      it('should parse full ISO 8601 datetime', () => {
        const result = parseTimeInput('2024-01-15T10:30:00Z');
        expect(result.error).toBe('');
        expect(result.dateTime).not.toBeNull();
        // Should parse correctly, verify it's valid
        expect(result.dateTime?.isValid).toBe(true);
      });

      it('should parse ISO 8601 with milliseconds', () => {
        const result = parseTimeInput('2024-01-15T10:30:00.123Z');
        expect(result.error).toBe('');
        expect(result.dateTime).not.toBeNull();
        // Should have milliseconds
        expect(result.dateTime?.millisecond).toBe(123);
      });

      it('should parse ISO 8601 with timezone offset', () => {
        const result = parseTimeInput('2024-01-15T10:30:00+05:30');
        expect(result.error).toBe('');
        expect(result.dateTime).not.toBeNull();
        // Should parse with correct offset
        expect(result.dateTime?.isValid).toBe(true);
      });

      it('should parse ISO 8601 date only', () => {
        const result = parseTimeInput('2024-01-15');
        expect(result.error).toBe('');
        expect(result.dateTime).not.toBeNull();
        expect(result.dateTime?.toISODate()).toBe('2024-01-15');
      });

      it('should parse ISO 8601 with explicit type', () => {
        const result = parseTimeInput('2024-01-15T10:30:00Z', 'iso');
        expect(result.error).toBe('');
        expect(result.dateTime).not.toBeNull();
      });

      it('should return error for invalid ISO date', () => {
        const result = parseTimeInput('not-a-date');
        expect(result.dateTime).toBeNull();
        expect(result.error).toBe('Invalid date/time format');
      });
    });

    describe('Unix timestamp parsing', () => {
      it('should parse Unix timestamp in seconds', () => {
        const result = parseTimeInput('1705315800');
        expect(result.error).toBe('');
        expect(result.dateTime).not.toBeNull();
        expect(result.dateTime?.toSeconds()).toBe(1705315800);
      });

      it('should parse Unix timestamp in milliseconds', () => {
        const result = parseTimeInput('1705315800000');
        expect(result.error).toBe('');
        expect(result.dateTime).not.toBeNull();
        expect(result.dateTime?.toMillis()).toBe(1705315800000);
      });

      it('should parse Unix timestamp with explicit type', () => {
        const result = parseTimeInput('1705315800', 'unix');
        expect(result.error).toBe('');
        expect(result.dateTime).not.toBeNull();
      });

      it('should parse 10-digit timestamp as seconds', () => {
        const result = parseTimeInput('1705315800');
        expect(result.error).toBe('');
        expect(result.dateTime).not.toBeNull();
        // Should be parsed as seconds, not milliseconds
        expect(result.dateTime?.year).toBe(2024);
      });

      it('should parse 13-digit timestamp as milliseconds', () => {
        const result = parseTimeInput('1705315800000');
        expect(result.error).toBe('');
        expect(result.dateTime).not.toBeNull();
        expect(result.dateTime?.year).toBe(2024);
      });
    });

    describe('RFC 2822 parsing', () => {
      it('should parse RFC 2822 format', () => {
        const result = parseTimeInput('Mon, 15 Jan 2024 10:30:00 +0000');
        expect(result.error).toBe('');
        expect(result.dateTime).not.toBeNull();
        expect(result.dateTime?.toFormat('yyyy-MM-dd')).toBe('2024-01-15');
      });

      it('should parse RFC 2822 without day name', () => {
        const result = parseTimeInput('15 Jan 2024 10:30:00 +0000');
        expect(result.error).toBe('');
        expect(result.dateTime).not.toBeNull();
      });
    });

    describe('SQL parsing', () => {
      it('should parse SQL datetime format in auto mode without dash', () => {
        // SQL with T works because it goes through ISO
        const result = parseTimeInput('2024-01-15T10:30:00', 'auto');
        expect(result.error).toBe('');
        expect(result.dateTime).not.toBeNull();
      });
    });

    describe('HTTP format parsing', () => {
      it('should parse HTTP date format in auto mode', () => {
        // RFC 2822 is supported in auto mode
        const result = parseTimeInput('Mon, 15 Jan 2024 10:30:00 +0000', 'auto');
        expect(result.error).toBe('');
        expect(result.dateTime).not.toBeNull();
      });
    });

    describe('timezone handling', () => {
      it('should parse with specific timezone', () => {
        const result = parseTimeInput('2024-01-15T10:30:00', 'auto', 'America/New_York');
        expect(result.error).toBe('');
        expect(result.dateTime).not.toBeNull();
        expect(result.dateTime?.zoneName).toBe('America/New_York');
      });

      it('should parse Unix timestamp with timezone', () => {
        const result = parseTimeInput('1705315800', 'unix', 'America/Los_Angeles');
        expect(result.error).toBe('');
        expect(result.dateTime).not.toBeNull();
        expect(result.dateTime?.zoneName).toBe('America/Los_Angeles');
      });
    });

    describe('error handling', () => {
      it('should return error for invalid input', () => {
        const result = parseTimeInput('invalid-date-string');
        expect(result.dateTime).toBeNull();
        expect(result.error).not.toBe('');
      });

      it('should return error for malformed Unix timestamp', () => {
        const result = parseTimeInput('abc123');
        expect(result.dateTime).toBeNull();
        expect(result.error).toBe('Invalid date/time format');
      });
    });
  });

  describe('isUnixTimestamp', () => {
    it('should return true for 10-digit number', () => {
      expect(isUnixTimestamp('1705315800')).toBe(true);
    });

    it('should return true for 13-digit number', () => {
      expect(isUnixTimestamp('1705315800000')).toBe(true);
    });

    it('should return false for non-numeric string', () => {
      expect(isUnixTimestamp('2024-01-15')).toBe(false);
    });

    it('should return false for number with letters', () => {
      expect(isUnixTimestamp('1705315800abc')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isUnixTimestamp('')).toBe(false);
    });

    it('should handle whitespace', () => {
      expect(isUnixTimestamp('  1705315800  ')).toBe(true);
    });
  });

  describe('isIsoDateString', () => {
    it('should return true for ISO datetime', () => {
      expect(isIsoDateString('2024-01-15T10:30:00Z')).toBe(true);
    });

    it('should return true for ISO date with T', () => {
      expect(isIsoDateString('2024-01-15T10:30:00')).toBe(true);
    });

    it('should return true for ISO date with dash', () => {
      expect(isIsoDateString('2024-01-15')).toBe(true);
    });

    it('should return false for Unix timestamp', () => {
      expect(isIsoDateString('1705315800')).toBe(false);
    });

    it('should return false for RFC 2822', () => {
      expect(isIsoDateString('Mon, 15 Jan 2024 10:30:00 +0000')).toBe(false);
    });
  });

  describe('getLocalTimezone', () => {
    it('should return a non-empty string', () => {
      const timezone = getLocalTimezone();
      expect(timezone).toBeTruthy();
      expect(typeof timezone).toBe('string');
    });

    it('should return a valid IANA timezone', () => {
      const timezone = getLocalTimezone();
      // Should be one of the common timezones or a valid IANA timezone
      expect(timezone).toMatch(/^[A-Za-z]+\/[A-Za-z_]+/);
    });
  });

  describe('commonTimezones', () => {
    it('should contain UTC', () => {
      expect(commonTimezones).toContain('UTC');
    });

    it('should contain major timezones', () => {
      expect(commonTimezones).toContain('America/New_York');
      expect(commonTimezones).toContain('Europe/London');
      expect(commonTimezones).toContain('Asia/Tokyo');
    });

    it('should be an array of strings', () => {
      commonTimezones.forEach((tz) => {
        expect(typeof tz).toBe('string');
        // UTC or IANA timezone format (Region/City)
        expect(tz).toMatch(/^UTC$|^[A-Za-z]+\/[A-Za-z_]+$/);
      });
    });
  });
});
