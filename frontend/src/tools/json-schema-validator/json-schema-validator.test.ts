import { describe, it, expect } from 'vitest';
import { ErrorObject } from 'ajv';
import {
  parseJson,
  parseInput,
  formatError,
  validateJsonAgainstSchema,
  validate,
  createAjvValidator,
  sampleJson,
  sampleJson5,
  sampleYaml,
  sampleToml,
  sampleSchema,
  getSampleData,
  type ValidationError,
  type InputFormat,
} from './json-schema-validator';

describe('json-schema-validator', () => {
  describe('sample data', () => {
    it('should have valid sample JSON', () => {
      const result = parseJson(sampleJson);
      expect(result.error).toBeNull();
      expect(result.data).toEqual({
        name: 'John Doe',
        age: 30,
        email: 'john@example.com',
      });
    });

    it('should have valid sample JSON5', () => {
      const result = parseInput(sampleJson5, 'json5');
      expect(result.error).toBeNull();
      expect(result.data).toEqual({
        name: 'John Doe',
        age: 30,
        email: 'john@example.com',
      });
    });

    it('should have valid sample YAML', () => {
      const result = parseInput(sampleYaml, 'yaml');
      expect(result.error).toBeNull();
      expect(result.data).toEqual({
        name: 'John Doe',
        age: 30,
        email: 'john@example.com',
      });
    });

    it('should have valid sample TOML', () => {
      const result = parseInput(sampleToml, 'toml');
      expect(result.error).toBeNull();
      expect(result.data).toEqual({
        name: 'John Doe',
        age: 30,
        email: 'john@example.com',
      });
    });

    it('should have valid sample schema', () => {
      const result = parseJson(sampleSchema);
      expect(result.error).toBeNull();
      expect(result.data).toEqual({
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'integer', minimum: 0 },
          email: { type: 'string', format: 'email' },
        },
        required: ['name', 'age', 'email'],
      });
    });
  });

  describe('parseJson', () => {
    it('should parse valid JSON', () => {
      const result = parseJson('{"key": "value"}');
      expect(result.error).toBeNull();
      expect(result.data).toEqual({ key: 'value' });
    });

    it('should parse JSON with nested objects', () => {
      const result = parseJson('{"user": {"name": "John", "age": 30}}');
      expect(result.error).toBeNull();
      expect(result.data).toEqual({ user: { name: 'John', age: 30 } });
    });

    it('should parse JSON arrays', () => {
      const result = parseJson('[1, 2, 3]');
      expect(result.error).toBeNull();
      expect(result.data).toEqual([1, 2, 3]);
    });

    it('should parse JSON primitives', () => {
      expect(parseJson('"hello"').data).toBe('hello');
      expect(parseJson('42').data).toBe(42);
      expect(parseJson('true').data).toBe(true);
      expect(parseJson('null').data).toBeNull();
    });

    it('should return error for invalid JSON', () => {
      const result = parseJson('{invalid}');
      expect(result.error).not.toBeNull();
      expect(result.data).toBeNull();
    });

    it('should return error for empty input', () => {
      const result = parseJson('');
      expect(result.error).toBe('Input is empty');
      expect(result.data).toBeNull();
    });

    it('should return error for whitespace-only input', () => {
      const result = parseJson('   ');
      expect(result.error).toBe('Input is empty');
      expect(result.data).toBeNull();
    });

    it('should handle JSON with whitespace', () => {
      const result = parseJson('  {"key": "value"}  ');
      expect(result.error).toBeNull();
      expect(result.data).toEqual({ key: 'value' });
    });
  });

  describe('parseInput', () => {
    it('should parse valid JSON using parseInput', () => {
      const result = parseInput('{"key": "value"}', 'json');
      expect(result.error).toBeNull();
      expect(result.data).toEqual({ key: 'value' });
    });

    it('should parse JSON5 with comments', () => {
      const json5Input = `{
        name: 'John Doe',
        age: 30,
        // This is a comment
      }`;
      const result = parseInput(json5Input, 'json5');
      expect(result.error).toBeNull();
      expect(result.data).toEqual({ name: 'John Doe', age: 30 });
    });

    it('should parse JSON5 without quotes on keys', () => {
      const json5Input = `{ name: 'John', age: 25 }`;
      const result = parseInput(json5Input, 'json5');
      expect(result.error).toBeNull();
      expect(result.data).toEqual({ name: 'John', age: 25 });
    });

    it('should return error for invalid JSON5', () => {
      const result = parseInput('{invalid}', 'json5');
      expect(result.error).not.toBeNull();
      expect(result.data).toBeNull();
    });

    it('should parse YAML with nested objects', () => {
      const yamlInput = `user:
  name: John
  age: 30`;
      const result = parseInput(yamlInput, 'yaml');
      expect(result.error).toBeNull();
      expect(result.data).toEqual({ user: { name: 'John', age: 30 } });
    });

    it('should parse YAML arrays', () => {
      const yamlInput = `items:
  - first
  - second
  - third`;
      const result = parseInput(yamlInput, 'yaml');
      expect(result.error).toBeNull();
      expect(result.data).toEqual({ items: ['first', 'second', 'third'] });
    });

    it('should return error for invalid YAML', () => {
      const result = parseInput('[invalid: yaml', 'yaml');
      expect(result.error).not.toBeNull();
      expect(result.data).toBeNull();
    });

    it('should parse TOML with tables', () => {
      const tomlInput = `[server]
host = "localhost"
port = 8080`;
      const result = parseInput(tomlInput, 'toml');
      expect(result.error).toBeNull();
      expect(result.data).toEqual({ server: { host: 'localhost', port: 8080 } });
    });

    it('should parse TOML arrays', () => {
      const tomlInput = `tags = ["a", "b", "c"]`;
      const result = parseInput(tomlInput, 'toml');
      expect(result.error).toBeNull();
      expect(result.data).toEqual({ tags: ['a', 'b', 'c'] });
    });

    it('should return error for invalid TOML', () => {
      const result = parseInput('{invalid = toml', 'toml');
      expect(result.error).not.toBeNull();
      expect(result.data).toBeNull();
    });

    it('should return error for empty input in parseInput', () => {
      const result = parseInput('', 'json');
      expect(result.error).toBe('Input is empty');
      expect(result.data).toBeNull();
    });

    it('should return error for unsupported format', () => {
      const result = parseInput('test', 'unknown' as InputFormat);
      expect(result.error).toBe('Unsupported format: unknown');
      expect(result.data).toBeNull();
    });
  });

  describe('getSampleData', () => {
    it('should return JSON sample for json format', () => {
      const result = getSampleData('json');
      expect(result).toBe(sampleJson);
    });

    it('should return JSON5 sample for json5 format', () => {
      const result = getSampleData('json5');
      expect(result).toBe(sampleJson5);
    });

    it('should return YAML sample for yaml format', () => {
      const result = getSampleData('yaml');
      expect(result).toBe(sampleYaml);
    });

    it('should return TOML sample for toml format', () => {
      const result = getSampleData('toml');
      expect(result).toBe(sampleToml);
    });
  });

  describe('formatError', () => {
    it('should format error with message property', () => {
      const error = { message: 'This is an error' } as ErrorObject | ValidationError;
      expect(formatError(error)).toBe('This is an error');
    });

    it('should stringify error without message property', () => {
      const error = { keyword: 'required', params: { missingProperty: 'name' } } as unknown as
        | ErrorObject
        | ValidationError;
      expect(formatError(error)).toBe(JSON.stringify(error));
    });

    it('should handle empty message', () => {
      const error = { message: '' } as ErrorObject | ValidationError;
      expect(formatError(error)).toBe('');
    });

    it('should handle AJV error object', () => {
      const error = {
        instancePath: '/name',
        schemaPath: '#/properties/name/type',
        keyword: 'type',
        params: { type: 'string' },
        message: 'should be string',
      } as unknown as ErrorObject;
      expect(formatError(error)).toBe('should be string');
    });
  });

  describe('createAjvValidator', () => {
    it('should create an AJV instance with format validation', () => {
      const ajv = createAjvValidator();
      expect(ajv).toBeDefined();
    });
  });

  describe('validateJsonAgainstSchema', () => {
    const validSchema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'integer', minimum: 0 },
      },
      required: ['name', 'age'],
    };

    it('should return valid for correct JSON', () => {
      const jsonData = { name: 'John', age: 30 };
      const result = validateJsonAgainstSchema(jsonData, validSchema);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return errors for missing required fields', () => {
      const jsonData = { name: 'John' };
      const result = validateJsonAgainstSchema(jsonData, validSchema);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should return errors for wrong type', () => {
      const jsonData = { name: 'John', age: 'thirty' };
      const result = validateJsonAgainstSchema(jsonData, validSchema);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should return errors for invalid minimum value', () => {
      const jsonData = { name: 'John', age: -5 };
      const result = validateJsonAgainstSchema(jsonData, validSchema);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should validate email format', () => {
      const schemaWithEmail = {
        type: 'object',
        properties: {
          email: { type: 'string', format: 'email' },
        },
        required: ['email'],
      };

      const validEmail = { email: 'test@example.com' };
      const resultValid = validateJsonAgainstSchema(validEmail, schemaWithEmail);
      expect(resultValid.valid).toBe(true);

      const invalidEmail = { email: 'not-an-email' };
      const resultInvalid = validateJsonAgainstSchema(invalidEmail, schemaWithEmail);
      expect(resultInvalid.valid).toBe(false);
    });

    it('should handle schema compilation errors', () => {
      const invalidSchema = {
        type: 'invalid-type',
      };
      const jsonData = { test: 'value' };
      const result = validateJsonAgainstSchema(jsonData, invalidSchema);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toHaveProperty('message');
      expect((result.errors[0] as ValidationError).message).toContain('Schema compilation error');
    });

    it('should accept custom AJV instance', () => {
      const customAjv = createAjvValidator();
      const jsonData = { name: 'John', age: 30 };
      const result = validateJsonAgainstSchema(jsonData, validSchema, customAjv);
      expect(result.valid).toBe(true);
    });
  });

  describe('validate (full validation)', () => {
    const validJson = '{"name": "John", "age": 30}';
    const validSchema =
      '{"type": "object", "properties": {"name": {"type": "string"}, "age": {"type": "integer"}}, "required": ["name", "age"]}';

    it('should return valid for correct JSON and schema', () => {
      const result = validate(validJson, validSchema);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return error for invalid JSON string', () => {
      const result = validate('{invalid}', validSchema);
      expect(result.valid).toBe(false);
      expect((result.errors[0] as ValidationError).message).toContain('Invalid JSON:');
    });

    it('should return error for invalid schema string', () => {
      const result = validate(validJson, '{invalid}');
      expect(result.valid).toBe(false);
      expect((result.errors[0] as ValidationError).message).toContain('Invalid JSON Schema:');
    });

    it('should return error for empty JSON input', () => {
      const result = validate('', validSchema);
      expect(result.valid).toBe(false);
      expect((result.errors[0] as ValidationError).message).toContain('Invalid JSON:');
    });

    it('should return error for empty schema input', () => {
      const result = validate(validJson, '');
      expect(result.valid).toBe(false);
      expect((result.errors[0] as ValidationError).message).toContain('Invalid JSON Schema:');
    });

    it('should return validation errors when JSON does not match schema', () => {
      const jsonWithWrongType = '{"name": "John", "age": "thirty"}';
      const result = validate(jsonWithWrongType, validSchema);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should validate against schema with format (email)', () => {
      const schemaWithEmail =
        '{"type": "object", "properties": {"email": {"type": "string", "format": "email"}}, "required": ["email"]}';
      const validEmailJson = '{"email": "test@example.com"}';
      const resultValid = validate(validEmailJson, schemaWithEmail);
      expect(resultValid.valid).toBe(true);

      const invalidEmailJson = '{"email": "not-an-email"}';
      const resultInvalid = validate(invalidEmailJson, schemaWithEmail);
      expect(resultInvalid.valid).toBe(false);
    });

    it('should validate against schema with minimum constraint', () => {
      const schemaWithMin =
        '{"type": "object", "properties": {"age": {"type": "integer", "minimum": 0}}, "required": ["age"]}';

      const validAgeJson = '{"age": 25}';
      const resultValid = validate(validAgeJson, schemaWithMin);
      expect(resultValid.valid).toBe(true);

      const invalidAgeJson = '{"age": -1}';
      const resultInvalid = validate(invalidAgeJson, schemaWithMin);
      expect(resultInvalid.valid).toBe(false);
    });

    it('should handle nested objects', () => {
      const schemaWithNested =
        '{"type": "object", "properties": {"user": {"type": "object", "properties": {"name": {"type": "string"}}}},"required": ["user"]}';
      const validNestedJson = '{"user": {"name": "John"}}';
      const result = validate(validNestedJson, schemaWithNested);
      expect(result.valid).toBe(true);
    });

    it('should handle arrays in schema', () => {
      const schemaWithArray =
        '{"type": "object", "properties": {"tags": {"type": "array", "items": {"type": "string"}}}}';
      const validArrayJson = '{"tags": ["a", "b", "c"]}';
      const result = validate(validArrayJson, schemaWithArray);
      expect(result.valid).toBe(true);
    });

    it('should handle complex schema with allOf', () => {
      const schemaWithAllOf =
        '{"allOf": [{"type": "object", "properties": {"name": {"type": "string"}}}, {"type": "object", "properties": {"age": {"type": "integer"}}}], "required": ["name", "age"]}';
      const validJson = '{"name": "John", "age": 30}';
      const result = validate(validJson, schemaWithAllOf);
      expect(result.valid).toBe(true);
    });

    it('should handle schema with enum', () => {
      const schemaWithEnum =
        '{"type": "object", "properties": {"status": {"type": "string", "enum": ["active", "inactive"]}}, "required": ["status"]}';

      const validEnumJson = '{"status": "active"}';
      const resultValid = validate(validEnumJson, schemaWithEnum);
      expect(resultValid.valid).toBe(true);

      const invalidEnumJson = '{"status": "unknown"}';
      const resultInvalid = validate(invalidEnumJson, schemaWithEnum);
      expect(resultInvalid.valid).toBe(false);
    });

    it('should validate JSON5 input with json5 format', () => {
      const json5Input = `{name: 'John', age: 30}`;
      const schema =
        '{"type": "object", "properties": {"name": {"type": "string"}, "age": {"type": "integer"}}, "required": ["name", "age"]}';
      const result = validate(json5Input, schema, undefined, 'json5');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return error for invalid JSON5 with json5 format', () => {
      const json5Input = `{name: 'John', age:}`;
      const schema =
        '{"type": "object", "properties": {"name": {"type": "string"}, "age": {"type": "integer"}}, "required": ["name", "age"]}';
      const result = validate(json5Input, schema, undefined, 'json5');
      expect(result.valid).toBe(false);
      expect((result.errors[0] as ValidationError).message).toContain('Invalid JSON5:');
    });

    it('should validate YAML input with yaml format', () => {
      const yamlInput = `name: John
age: 30`;
      const schema =
        '{"type": "object", "properties": {"name": {"type": "string"}, "age": {"type": "integer"}}, "required": ["name", "age"]}';
      const result = validate(yamlInput, schema, undefined, 'yaml');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return error for invalid YAML with yaml format', () => {
      const yamlInput = `name: John
  age: [invalid`;
      const schema =
        '{"type": "object", "properties": {"name": {"type": "string"}, "age": {"type": "integer"}}, "required": ["name", "age"]}';
      const result = validate(yamlInput, schema, undefined, 'yaml');
      expect(result.valid).toBe(false);
      expect((result.errors[0] as ValidationError).message).toContain('Invalid YAML:');
    });

    it('should validate TOML input with toml format', () => {
      const tomlInput = `name = "John"
age = 30`;
      const schema =
        '{"type": "object", "properties": {"name": {"type": "string"}, "age": {"type": "integer"}}, "required": ["name", "age"]}';
      const result = validate(tomlInput, schema, undefined, 'toml');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return error for invalid TOML with toml format', () => {
      const tomlInput = `name = "John"
age = `;
      const schema =
        '{"type": "object", "properties": {"name": {"type": "string"}, "age": {"type": "integer"}}, "required": ["name", "age"]}';
      const result = validate(tomlInput, schema, undefined, 'toml');
      expect(result.valid).toBe(false);
      expect((result.errors[0] as ValidationError).message).toContain('Invalid TOML:');
    });

    it('should validate JSON5 against schema with email format', () => {
      const json5Input = `{email: 'test@example.com'}`;
      const schema =
        '{"type": "object", "properties": {"email": {"type": "string", "format": "email"}}, "required": ["email"]}';
      const result = validate(json5Input, schema, undefined, 'json5');
      expect(result.valid).toBe(true);
    });

    it('should validate YAML against schema with minimum constraint', () => {
      const yamlInput = `age: 25`;
      const schema =
        '{"type": "object", "properties": {"age": {"type": "integer", "minimum": 0}}, "required": ["age"]}';
      const result = validate(yamlInput, schema, undefined, 'yaml');
      expect(result.valid).toBe(true);

      const invalidYamlInput = `age: -1`;
      const resultInvalid = validate(invalidYamlInput, schema, undefined, 'yaml');
      expect(resultInvalid.valid).toBe(false);
    });
  });
});
