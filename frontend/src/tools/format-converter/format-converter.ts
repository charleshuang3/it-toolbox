import yaml from 'yaml';
import toml from 'toml';
import json5 from 'json5';
import { XMLBuilder, XMLParser } from 'fast-xml-parser';

/**
 * Supported data formats for conversion
 */
export type DataFormat = 'json' | 'json5' | 'xml' | 'yaml' | 'toml';

/**
 * Result of parsing/formatting operations
 */
export interface FormatResult {
  data: unknown;
  error: string | null;
}

/**
 * Result of conversion operations
 */
export interface ConversionResult {
  result: string;
  error: string | null;
}

/**
 * Sample data for each format
 */
export const sampleData: Record<DataFormat, string> = {
  json: `{
  "name": "John Doe",
  "age": 30,
  "email": "john@example.com",
  "isActive": true,
  "roles": ["admin", "user"]
}`,
  json5: `{
  name: 'John Doe',
  age: 30,
  email: 'john@example.com',
  isActive: true,
  roles: ['admin', 'user'],
  // JSON5 supports comments
}`,
  yaml: `name: John Doe
age: 30
email: john@example.com
isActive: true
roles:
  - admin
  - user`,
  toml: `name = "John Doe"
age = 30
email = "john@example.com"
isActive = true
roles = ["admin", "user"]`,
  xml: `<?xml version="1.0" encoding="UTF-8"?>
<root>
  <name>John Doe</name>
  <age>30</age>
  <email>john@example.com</email>
  <isActive>true</isActive>
  <roles>admin</roles>
  <roles>user</roles>
</root>`,
};

/**
 * Get sample data for a specific format
 */
export function getSampleData(format: DataFormat): string {
  return sampleData[format];
}

/**
 * Parse input string based on format
 */
export function parseInput(input: string, format: DataFormat): FormatResult {
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
      case 'xml':
        data = parseXml(input);
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
 * Parse XML string to JavaScript object
 */
function parseXml(input: string): unknown {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    parseAttributeValue: false,
    parseTagValue: true,
    trimValues: true,
  });

  // Check if XML is valid by looking for basic structure
  const trimmedInput = input.trim();
  if (!trimmedInput.startsWith('<') || (!trimmedInput.endsWith('>') && !trimmedInput.match(/\.\.\/>$/))) {
    throw new Error('Invalid XML: Must start with < and end with >');
  }

  // Check for balanced tags (basic validation)
  const openTagMatches = trimmedInput.match(/<[\w-]+[^>]*[^/]>/g) || [];
  const closeTagMatches = trimmedInput.match(/<\/[\w-]+>/g) || [];

  // Simple check - if there are open tags without corresponding close tags (and not self-closing)
  // This is a basic heuristic, not a full XML validator
  const openTags = openTagMatches.map((tag) => tag.match(/<([\w-]+)/)?.[1]).filter(Boolean);
  const closeTags = closeTagMatches.map((tag) => tag.match(/<\/([\w-]+)>/)?.[1]).filter(Boolean);

  for (const tag of openTags) {
    const openCount = openTags.filter((t) => t === tag).length;
    const closeCount = closeTags.filter((t) => t === tag).length;
    if (openCount > closeCount) {
      throw new Error(`Invalid XML: Unclosed tag <${tag}>`);
    }
  }

  const result = parser.parse(input);

  // If the result has a single root key, extract it for cleaner conversion
  if (typeof result === 'object' && result !== null) {
    const keys = Object.keys(result);
    if (keys.length === 1 && keys[0] !== '?xml') {
      return result[keys[0]];
    }
  }
  return result;
}

/**
 * Format data to a specific output format
 */
export function formatOutput(data: unknown, format: DataFormat): ConversionResult {
  try {
    let result: string;
    switch (format) {
      case 'json':
        result = JSON.stringify(data, null, 2);
        break;
      case 'json5':
        result = toJson5String(data);
        break;
      case 'yaml':
        result = yaml.stringify(data);
        break;
      case 'toml':
        result = toTomlString(data);
        break;
      case 'xml':
        result = toXmlString(data);
        break;
      default:
        return { result: '', error: `Unsupported format: ${format}` };
    }
    return { result, error: null };
  } catch (e) {
    const error = e as Error;
    return { result: '', error: error.message };
  }
}

/**
 * Convert data to JSON5-like string
 */
function toJson5String(data: unknown, indent: number = 0): string {
  const spaces = '  '.repeat(indent);

  if (data === null) return 'null';
  if (data === undefined) return 'undefined';
  if (typeof data === 'string') return `'${data.replace(/'/g, "\\'")}'`;
  if (typeof data === 'number') return String(data);
  if (typeof data === 'boolean') return String(data);

  if (Array.isArray(data)) {
    if (data.length === 0) return '[]';
    const items = data.map((item) => toJson5String(item, indent + 1)).join(',\n  ' + spaces);
    return `[\n  ${spaces}${items},\n${spaces}]`;
  }

  if (typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (keys.length === 0) return '{}';
    const items = keys
      .map((key) => {
        const value = toJson5String(obj[key], indent + 1);
        return `${key}: ${value}`;
      })
      .join(',\n  ' + spaces);
    return `{\n  ${spaces}${items},\n${spaces}}`;
  }

  return String(data);
}

/**
 * Convert data to TOML string
 */
function toTomlString(data: unknown, prefix = ''): string {
  if (data === null || data === undefined) return '';

  if (typeof data !== 'object') {
    return formatTomlValue(data);
  }

  if (Array.isArray(data)) {
    if (data.length === 0) return '[]';
    if (prefix) {
      // Array of tables
      return data
        .map((item) => {
          if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
            return `[[${prefix}]]\n${toTomlString(item)}`;
          }
          return '';
        })
        .filter(Boolean)
        .join('\n');
    }
    // Simple array
    const values = data.map((item) => formatTomlValue(item)).join(', ');
    return `[${values}]`;
  }

  const obj = data as Record<string, unknown>;
  const simplePairs: string[] = [];
  const complexKeys: string[] = [];

  // Separate simple and complex values
  for (const [key, value] of Object.entries(obj)) {
    if (
      value === null ||
      typeof value !== 'object' ||
      (Array.isArray(value) && value.every((v) => typeof v !== 'object'))
    ) {
      simplePairs.push(`${key} = ${formatTomlValue(value)}`);
    } else {
      complexKeys.push(key);
    }
  }

  let result = simplePairs.join('\n');

  // Handle nested objects and arrays of objects
  for (const key of complexKeys) {
    const value = obj[key];
    const newPrefix = prefix ? `${prefix}.${key}` : key;

    if (Array.isArray(value)) {
      if (value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
        // Array of tables
        for (const item of value) {
          if (result) result += '\n\n';
          result += `[[${newPrefix}]]\n${toTomlString(item)}`;
        }
      } else {
        // Simple array as inline
        if (result) result += '\n';
        result += `${newPrefix} = ${formatTomlValue(value)}`;
      }
    } else if (typeof value === 'object' && value !== null) {
      // Inline table for simple nested objects, otherwise use [table]
      const nestedStr = toTomlString(value);
      if (!nestedStr.includes('\n') && !nestedStr.startsWith('[')) {
        if (result) result += '\n';
        result += `${newPrefix} = { ${nestedStr.replace(/\n/g, ', ')} }`;
      } else {
        if (result) result += '\n\n';
        result += `[${newPrefix}]\n${nestedStr}`;
      }
    }
  }

  return result;
}

/**
 * Format a value for TOML output
 */
function formatTomlValue(value: unknown): string {
  if (value === null) return '""';
  if (value === undefined) return '""';
  if (typeof value === 'string') return `"${value.replace(/"/g, '\\"')}"`;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return String(value);

  if (Array.isArray(value)) {
    const items = value.map((item) => formatTomlValue(item)).join(', ');
    return `[${items}]`;
  }

  if (typeof value === 'object') {
    // Inline table
    const obj = value as Record<string, unknown>;
    const pairs = Object.entries(obj)
      .map(([k, v]) => `${k} = ${formatTomlValue(v)}`)
      .join(', ');
    return `{ ${pairs} }`;
  }

  return `"${String(value)}"`;
}

/**
 * Convert data to XML string
 */
function toXmlString(data: unknown, rootName = 'root'): string {
  const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    format: true,
    indentBy: '  ',
    suppressEmptyNode: true,
  });

  // Wrap in root element
  const wrapped = { [rootName]: data };
  const xmlContent = builder.build(wrapped) as string;

  // Add XML declaration
  return `<?xml version="1.0" encoding="UTF-8"?>\n${xmlContent}`;
}

/**
 * Convert data from one format to another
 */
export function convert(input: string, fromFormat: DataFormat, toFormat: DataFormat): ConversionResult {
  // Parse input
  const parseResult = parseInput(input, fromFormat);
  if (parseResult.error) {
    return { result: '', error: `Parse error: ${parseResult.error}` };
  }

  // Format output
  return formatOutput(parseResult.data, toFormat);
}

/**
 * Check if a format is supported
 */
export function isValidFormat(format: string): format is DataFormat {
  return ['json', 'json5', 'xml', 'yaml', 'toml'].includes(format);
}

/**
 * Format labels for display
 */
export const formatLabels: Record<DataFormat, string> = {
  json: 'JSON',
  json5: 'JSON5',
  xml: 'XML',
  yaml: 'YAML',
  toml: 'TOML',
};
