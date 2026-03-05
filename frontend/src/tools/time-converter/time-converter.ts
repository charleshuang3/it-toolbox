import { DateTime } from 'luxon';

/**
 * Input type for time parsing
 */
export type InputType = 'auto' | 'iso' | 'unix' | 'relative';

/**
 * Result of parsing a time input
 */
export interface ParseResult {
  dateTime: DateTime | null;
  error: string;
}

/**
 * Parse a time input string into a DateTime object
 *
 * @param input - The input string to parse (ISO 8601, Unix timestamp, RFC 2822, SQL, HTTP format)
 * @param inputType - The type of input ('auto' for automatic detection, or specific type)
 * @param timezone - The timezone to use for parsing (default: local)
 * @returns ParseResult containing either the parsed DateTime or an error message
 */
export function parseTimeInput(input: string, inputType: InputType = 'auto', timezone?: string): ParseResult {
  const selectedTimezone = timezone || 'local';

  if (!input.trim()) {
    return { dateTime: null, error: '' };
  }

  try {
    let dt: DateTime | null = null;

    if (inputType === 'unix' || /^\d{10,13}$/.test(input.trim())) {
      // Unix timestamp
      const timestamp = parseInt(input.trim());
      if (input.trim().length <= 10) {
        // Seconds
        dt = DateTime.fromSeconds(timestamp, { zone: selectedTimezone });
      } else {
        // Milliseconds
        dt = DateTime.fromMillis(timestamp, { zone: selectedTimezone });
      }
    } else if (inputType === 'iso' || input.includes('T') || input.includes('-')) {
      // ISO string
      dt = DateTime.fromISO(input.trim(), { zone: selectedTimezone });
    } else {
      // Try auto parsing
      dt = DateTime.fromISO(input.trim(), { zone: selectedTimezone });
      if (!dt.isValid) {
        dt = DateTime.fromRFC2822(input.trim(), { zone: selectedTimezone });
      }
      if (!dt.isValid) {
        dt = DateTime.fromSQL(input.trim(), { zone: selectedTimezone });
      }
      if (!dt.isValid) {
        // Try HTTP format
        dt = DateTime.fromHTTP(input.trim(), { zone: selectedTimezone });
      }
    }

    if (dt && dt.isValid) {
      return { dateTime: dt, error: '' };
    } else {
      return { dateTime: null, error: 'Invalid date/time format' };
    }
  } catch {
    return { dateTime: null, error: 'Could not parse input' };
  }
}

/**
 * Check if a string looks like a Unix timestamp
 */
export function isUnixTimestamp(input: string): boolean {
  return /^\d{10,13}$/.test(input.trim());
}

/**
 * Check if a string looks like an ISO date string
 */
export function isIsoDateString(input: string): boolean {
  return input.includes('T') || input.includes('-');
}

/**
 * Get common timezones for conversion
 */
export const commonTimezones = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Hong_Kong',
  'Asia/Singapore',
  'Australia/Sydney',
];

/**
 * Get the local timezone
 */
export function getLocalTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
