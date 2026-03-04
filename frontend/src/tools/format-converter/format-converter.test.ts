import { describe, it, expect } from 'vitest';
import {
  parseInput,
  formatOutput,
  convert,
  getSampleData,
  formatLabels,
  isValidFormat,
  sampleData,
  type DataFormat,
} from './format-converter';

describe('format-converter', () => {
  describe('sample data', () => {
    it('should have sample JSON data', () => {
      const sample = getSampleData('json');
      expect(sample).toContain('John Doe');
      expect(sample).toContain('30');
      expect(sample).toContain('john@example.com');
    });

    it('should have sample JSON5 data', () => {
      const sample = getSampleData('json5');
      expect(sample).toContain('John Doe');
      expect(sample).toContain('// JSON5 supports comments');
    });

    it('should have sample YAML data', () => {
      const sample = getSampleData('yaml');
      expect(sample).toContain('name: John Doe');
      expect(sample).toContain('roles:');
    });

    it('should have sample TOML data', () => {
      const sample = getSampleData('toml');
      expect(sample).toContain('name = "John Doe"');
      expect(sample).toContain('roles = ["admin", "user"]');
    });

    it('should have sample XML data', () => {
      const sample = getSampleData('xml');
      expect(sample).toContain('<?xml');
      expect(sample).toContain('<name>John Doe</name>');
    });
  });

  describe('formatLabels', () => {
    it('should have labels for all formats', () => {
      expect(formatLabels.json).toBe('JSON');
      expect(formatLabels.json5).toBe('JSON5');
      expect(formatLabels.xml).toBe('XML');
      expect(formatLabels.yaml).toBe('YAML');
      expect(formatLabels.toml).toBe('TOML');
    });
  });

  describe('isValidFormat', () => {
    it('should return true for valid formats', () => {
      expect(isValidFormat('json')).toBe(true);
      expect(isValidFormat('json5')).toBe(true);
      expect(isValidFormat('xml')).toBe(true);
      expect(isValidFormat('yaml')).toBe(true);
      expect(isValidFormat('toml')).toBe(true);
    });

    it('should return false for invalid formats', () => {
      expect(isValidFormat('csv')).toBe(false);
      expect(isValidFormat('ini')).toBe(false);
      expect(isValidFormat('')).toBe(false);
    });
  });

  describe('parseInput', () => {
    describe('JSON parsing', () => {
      it('should parse valid JSON', () => {
        const result = parseInput('{"name": "test", "value": 123}', 'json');
        expect(result.error).toBeNull();
        expect(result.data).toEqual({ name: 'test', value: 123 });
      });

      it('should parse JSON arrays', () => {
        const result = parseInput('[1, 2, 3]', 'json');
        expect(result.error).toBeNull();
        expect(result.data).toEqual([1, 2, 3]);
      });

      it('should return error for invalid JSON', () => {
        const result = parseInput('{invalid json}', 'json');
        expect(result.error).not.toBeNull();
        expect(result.data).toBeNull();
      });
    });

    describe('JSON5 parsing', () => {
      it('should parse valid JSON5', () => {
        const result = parseInput("{name: 'test', value: 123}", 'json5');
        expect(result.error).toBeNull();
        expect(result.data).toEqual({ name: 'test', value: 123 });
      });

      it('should parse JSON5 with comments', () => {
        const result = parseInput(`{
          name: 'test',
          // This is a comment
          value: 123
        }`, 'json5');
        expect(result.error).toBeNull();
        expect(result.data).toEqual({ name: 'test', value: 123 });
      });

      it('should return error for invalid JSON5', () => {
        const result = parseInput("{name: 'test', value:}", 'json5');
        expect(result.error).not.toBeNull();
        expect(result.data).toBeNull();
      });
    });

    describe('YAML parsing', () => {
      it('should parse valid YAML', () => {
        const result = parseInput('name: test\nvalue: 123', 'yaml');
        expect(result.error).toBeNull();
        expect(result.data).toEqual({ name: 'test', value: 123 });
      });

      it('should parse YAML arrays', () => {
        const result = parseInput('items:\n  - first\n  - second', 'yaml');
        expect(result.error).toBeNull();
        expect(result.data).toEqual({ items: ['first', 'second'] });
      });

      it('should return error for invalid YAML', () => {
        const result = parseInput('name: [invalid', 'yaml');
        expect(result.error).not.toBeNull();
        expect(result.data).toBeNull();
      });
    });

    describe('TOML parsing', () => {
      it('should parse valid TOML', () => {
        const result = parseInput('name = "test"\nvalue = 123', 'toml');
        expect(result.error).toBeNull();
        expect(result.data).toEqual({ name: 'test', value: 123 });
      });

      it('should parse TOML tables', () => {
        const result = parseInput('[server]\nhost = "localhost"\nport = 8080', 'toml');
        expect(result.error).toBeNull();
        expect(result.data).toEqual({ server: { host: 'localhost', port: 8080 } });
      });

      it('should return error for invalid TOML', () => {
        const result = parseInput('name = ', 'toml');
        expect(result.error).not.toBeNull();
        expect(result.data).toBeNull();
      });
    });

    describe('XML parsing', () => {
      it('should parse valid XML', () => {
        const result = parseInput('<root><name>test</name><value>123</value></root>', 'xml');
        expect(result.error).toBeNull();
        expect(result.data).toEqual({ name: 'test', value: 123 });
      });

      it('should parse XML with attributes', () => {
        const result = parseInput('<root id="1"><name>test</name></root>', 'xml');
        expect(result.error).toBeNull();
        expect(result.data).toEqual({ '@_id': '1', name: 'test' });
      });

      it('should return error for invalid XML', () => {
        const result = parseInput('<root><unclosed>', 'xml');
        expect(result.error).not.toBeNull();
        expect(result.data).toBeNull();
      });
    });

    it('should return error for empty input', () => {
      const result = parseInput('', 'json');
      expect(result.error).toBe('Input is empty');
      expect(result.data).toBeNull();
    });

    it('should return error for whitespace-only input', () => {
      const result = parseInput('   \n\t  ', 'json');
      expect(result.error).toBe('Input is empty');
      expect(result.data).toBeNull();
    });
  });

  describe('formatOutput', () => {
    const testData = {
      name: 'test',
      value: 123,
      active: true,
    };

    describe('JSON formatting', () => {
      it('should format data to JSON', () => {
        const result = formatOutput(testData, 'json');
        expect(result.error).toBeNull();
        expect(result.result).toContain('"name": "test"');
        expect(result.result).toContain('"value": 123');
      });
    });

    describe('JSON5 formatting', () => {
      it('should format data to JSON5', () => {
        const result = formatOutput(testData, 'json5');
        expect(result.error).toBeNull();
        expect(result.result).toContain("name: 'test'");
        expect(result.result).toContain('value: 123');
      });
    });

    describe('YAML formatting', () => {
      it('should format data to YAML', () => {
        const result = formatOutput(testData, 'yaml');
        expect(result.error).toBeNull();
        expect(result.result).toContain('name: test');
        expect(result.result).toContain('value: 123');
      });
    });

    describe('TOML formatting', () => {
      it('should format data to TOML', () => {
        const result = formatOutput(testData, 'toml');
        expect(result.error).toBeNull();
        expect(result.result).toContain('name = "test"');
        expect(result.result).toContain('value = 123');
      });

      it('should format arrays in TOML', () => {
        const data = { items: ['a', 'b', 'c'] };
        const result = formatOutput(data, 'toml');
        expect(result.error).toBeNull();
        expect(result.result).toContain('items = ["a", "b", "c"]');
      });
    });

    describe('XML formatting', () => {
      it('should format data to XML', () => {
        const result = formatOutput(testData, 'xml');
        expect(result.error).toBeNull();
        expect(result.result).toContain('<?xml');
        expect(result.result).toContain('<name>test</name>');
      });

      it('should format arrays in XML', () => {
        const data = { items: ['a', 'b'] };
        const result = formatOutput(data, 'xml');
        expect(result.error).toBeNull();
        expect(result.result).toContain('<items>a</items>');
      });
    });
  });

  describe('convert', () => {
    it('should convert JSON to YAML', () => {
      const result = convert('{"name": "test"}', 'json', 'yaml');
      expect(result.error).toBeNull();
      expect(result.result).toContain('name: test');
    });

    it('should convert YAML to JSON', () => {
      const result = convert('name: test\nvalue: 123', 'yaml', 'json');
      expect(result.error).toBeNull();
      const parsed = JSON.parse(result.result);
      expect(parsed).toEqual({ name: 'test', value: 123 });
    });

    it('should convert JSON to TOML', () => {
      const result = convert('{"name": "test"}', 'json', 'toml');
      expect(result.error).toBeNull();
      expect(result.result).toContain('name = "test"');
    });

    it('should convert TOML to JSON', () => {
      const result = convert('name = "test"', 'toml', 'json');
      expect(result.error).toBeNull();
      const parsed = JSON.parse(result.result);
      expect(parsed).toEqual({ name: 'test' });
    });

    it('should convert JSON to JSON5', () => {
      const result = convert('{"name": "test"}', 'json', 'json5');
      expect(result.error).toBeNull();
      expect(result.result).toContain("name: 'test'");
    });

    it('should convert JSON5 to JSON', () => {
      const result = convert("{name: 'test'}", 'json5', 'json');
      expect(result.error).toBeNull();
      const parsed = JSON.parse(result.result);
      expect(parsed).toEqual({ name: 'test' });
    });

    it('should convert JSON to XML', () => {
      const result = convert('{"name": "test"}', 'json', 'xml');
      expect(result.error).toBeNull();
      expect(result.result).toContain('<?xml');
      expect(result.result).toContain('<name>test</name>');
    });

    it('should convert XML to JSON', () => {
      const result = convert('<root><name>test</name></root>', 'xml', 'json');
      expect(result.error).toBeNull();
      const parsed = JSON.parse(result.result);
      expect(parsed).toEqual({ name: 'test' });
    });

    it('should return error for invalid input', () => {
      const result = convert('{invalid}', 'json', 'yaml');
      expect(result.error).not.toBeNull();
      expect(result.error).toContain('Parse error');
    });

    it('should handle complex nested objects', () => {
      const yamlInput = `user:
  name: John
  address:
    city: New York
    country: USA`;
      const result = convert(yamlInput, 'yaml', 'json');
      expect(result.error).toBeNull();
      const parsed = JSON.parse(result.result);
      expect(parsed.user.name).toBe('John');
      expect(parsed.user.address.city).toBe('New York');
    });

    it('should handle arrays', () => {
      const jsonInput = '{"items": [1, 2, 3]}';
      const result = convert(jsonInput, 'json', 'yaml');
      expect(result.error).toBeNull();
      expect(result.result).toContain('items:');
    });

    it('should handle all format conversions', () => {
      const formats: DataFormat[] = ['json', 'json5', 'yaml', 'toml', 'xml'];

      for (const from of formats) {
        for (const to of formats) {
          if (from !== to) {
            const sample = sampleData[from];
            const result = convert(sample, from, to);
            expect(result.error).toBeNull();
            expect(result.result).toBeTruthy();
          }
        }
      }
    });
  });
});
