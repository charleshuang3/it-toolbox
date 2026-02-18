/**
 * Converts a number from one base to another.
 * Supports bases from 2 to 64 (using digits 0-9, a-z, A-Z, +, /).
 *
 * @param options - The conversion options
 * @param options.value - The numeric value as a string (to handle large numbers)
 * @param options.fromBase - The base to convert from (2-64)
 * @param options.toBase - The base to convert to (2-64)
 * @returns The converted value as a string
 * @throws Error if the input contains invalid digits for the source base
 */
export function convertBase({ value, fromBase, toBase }: { value: string; fromBase: number; toBase: number }) {
  // Validate base range
  if (fromBase < 2 || fromBase > 64 || toBase < 2 || toBase > 64) {
    throw new Error('Base must be between 2 and 64');
  }

  // Handle empty input
  if (!value || value.trim() === '') {
    throw new Error('Input value cannot be empty');
  }

  // Character range for bases 2-64: 0-9, a-z, A-Z, +, /
  const range = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ+/'.split('');
  // Get valid characters for the source and target bases
  const fromRange = range.slice(0, fromBase);
  const toRange = range.slice(0, toBase);

  // Create lookup map for O(1) digit-to-value conversion
  const fromDigits = new Map(fromRange.map((d, i) => [d, i]));

  // Step 1: Convert input from source base to decimal (bigint for large numbers)
  let decValue = value
    .split('')
    .reverse()
    .reduce((carry: bigint, digit: string, index: number) => {
      // Validate that each digit is valid for the source base
      const digitValue = fromDigits.get(digit);
      if (digitValue === undefined) {
        throw new Error(`Invalid digit "${digit}" for base ${fromBase}.`);
      }
      // Convert digit to its numeric value and multiply by base^position
      return (carry += BigInt(digitValue) * BigInt(fromBase) ** BigInt(index));
    }, 0n);

  // Step 2: Convert from decimal to target base
  let newValue = '';
  while (decValue > 0) {
    // Get the remainder (least significant digit in new base)
    newValue = toRange[Number(decValue % BigInt(toBase))] + newValue;
    // Divide to move to next digit
    decValue = decValue / BigInt(toBase);
  }

  // Return '0' for empty result (handles input of '0')
  return newValue || '0';
}

/**
 * Validates if a string represents a valid integer in the given base.
 *
 * @param number - The numeric string to validate
 * @param base - The base to validate against (2-64)
 * @returns An error message if invalid, or empty string if valid
 */
export function validInt(number: string, base: number): string {
  // Validate base range
  if (base < 2 || base > 64) {
    return 'Base must be between 2 and 64';
  }

  // Handle empty input
  if (!number || number.trim() === '') {
    return 'Input value cannot be empty';
  }

  // Character range for bases 2-64: 0-9, a-z, A-Z, +, /
  const range = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ+/'.split('');
  const validChars = new Set(range.slice(0, base));

  // Check each character
  for (const char of number) {
    if (!validChars.has(char)) {
      return `Invalid digit "${char}" for base ${base}`;
    }
  }

  return '';
}
