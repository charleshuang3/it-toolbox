import Ajv, { ErrorObject, AnySchema } from 'ajv';
import addFormat from 'ajv-formats';
import yaml from 'yaml';
import toml from 'toml';
import json5 from 'json5';

export interface ValidationError {
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: (ErrorObject | ValidationError)[];
}

/**
 * Creates a new AJV instance with format validation enabled
 */
export function createAjvValidator() {
  const ajv = new Ajv({ allErrors: true, verbose: true });
  addFormat(ajv);
  return ajv;
}

// Default validator instance
const defaultAjv = createAjvValidator();

/**
 * Sample JSON for demonstration
 */
export const sampleJson = `{
  "name": "John Doe",
  "age": 30,
  "email": "john@example.com"
}`;

/**
 * Sample JSON5 for demonstration
 */
export const sampleJson5 = `{
  name: 'John Doe',
  age: 30,
  email: 'john@example.com',
  // JSON5 supports comments
}`;

/**
 * Sample YAML for demonstration
 */
export const sampleYaml = `name: John Doe
age: 30
email: john@example.com`;

/**
 * Sample TOML for demonstration
 */
export const sampleToml = `name = "John Doe"
age = 30
email = "john@example.com"`;

/**
 * Get sample data based on input format
 */
export function getSampleData(format: InputFormat): string {
  switch (format) {
    case 'json5':
      return sampleJson5;
    case 'yaml':
      return sampleYaml;
    case 'toml':
      return sampleToml;
    default:
      return sampleJson;
  }
}

/**
 * Sample JSON Schema for demonstration
 */
export const sampleSchema = `{
  "type": "object",
  "properties": {
    "name": { "type": "string" },
    "age": { "type": "integer", "minimum": 0 },
    "email": { "type": "string", "format": "email" }
  },
  "required": ["name", "age", "email"]
}`;

/**
 * Parses a JSON string with error handling
 *
 * @param input - The JSON string to parse
 * @returns An object containing the parsed data or null, and an error message if parsing failed
 */
export function parseJson(input: string): { data: unknown; error: string | null } {
  if (!input.trim()) {
    return { data: null, error: 'Input is empty' };
  }
  try {
    const data = JSON.parse(input);
    return { data, error: null };
  } catch (e) {
    const error = e as Error;
    return { data: null, error: error.message };
  }
}

/**
 * Formats an error object for display
 *
 * @param error - The error object to format
 * @returns A formatted string representation of the error
 */
export function formatError(error: ErrorObject | { message: string }): string {
  if ('message' in error) {
    return error.message || '';
  }
  return JSON.stringify(error);
}

/**
 * Validates JSON data against a JSON Schema
 *
 * @param jsonData - The JSON data to validate
 * @param schema - The JSON Schema to validate against
 * @param ajvInstance - Optional AJV instance to use (defaults to a new instance)
 * @returns The validation result with valid status and any errors
 */
export function validateJsonAgainstSchema(
  jsonData: unknown,
  schema: unknown,
  ajvInstance: Ajv = defaultAjv,
): ValidationResult {
  try {
    // Compile and validate
    const validateFn = ajvInstance.compile(schema as AnySchema);
    const valid = validateFn(jsonData);

    if (valid) {
      return {
        valid: true,
        errors: [],
      };
    } else {
      return {
        valid: false,
        errors: validateFn.errors || [],
      };
    }
  } catch (e) {
    const error = e as Error;
    return {
      valid: false,
      errors: [{ message: `Schema compilation error: ${error.message}` }],
    };
  }
}

/**
 * Supported input formats for parsing
 */
export type InputFormat = 'json' | 'json5' | 'yaml' | 'toml';

/**
 * Full validation function that handles parsing both JSON and Schema
 *
 * @param jsonInput - The JSON string to validate
 * @param schemaInput - The JSON Schema string
 * @param ajvInstance - Optional AJV instance to use
 * @param inputFormat - The format of the input (defaults to 'json')
 * @returns The validation result
 */
export function validate(
  jsonInput: string,
  schemaInput: string,
  ajvInstance: Ajv = defaultAjv,
  inputFormat: InputFormat = 'json',
): ValidationResult {
  // Parse JSON input based on selected format
  const jsonResult = parseInput(jsonInput, inputFormat);
  if (jsonResult.error) {
    return {
      valid: false,
      errors: [{ message: `Invalid ${inputFormat.toUpperCase()}: ${jsonResult.error}` }],
    };
  }

  // Parse schema input
  const schemaResult = parseJson(schemaInput);
  if (schemaResult.error) {
    return {
      valid: false,
      errors: [{ message: `Invalid JSON Schema: ${schemaResult.error}` }],
    };
  }

  // Validate JSON against schema
  return validateJsonAgainstSchema(jsonResult.data, schemaResult.data, ajvInstance);
}

/**
 * Parses input based on the specified format
 *
 * @param input - The input string to parse
 * @param format - The format to parse as
 * @returns An object containing the parsed data or null, and an error message if parsing failed
 */
export function parseInput(input: string, format: InputFormat): { data: unknown; error: string | null } {
  if (!input.trim()) {
    return { data: null, error: 'Input is empty' };
  }

  try {
    let data: unknown;
    switch (format) {
      case 'json':
        data = JSON.parse(input);
        break;
      case 'json5':
        data = json5.parse(input);
        break;
      case 'yaml':
        data = yaml.parse(input);
        break;
      case 'toml':
        data = toml.parse(input);
        break;
      default:
        return { data: null, error: `Unsupported format: ${format}` };
    }
    return { data, error: null };
  } catch (e) {
    const error = e as Error;
    return { data: null, error: error.message };
  }
}

/**
 * Converts parsed data to JSON string
 *
 * @param data - The data to convert
 * @returns JSON string representation
 */
export function toJsonString(data: unknown): string {
  return JSON.stringify(data, null, 2);
}
