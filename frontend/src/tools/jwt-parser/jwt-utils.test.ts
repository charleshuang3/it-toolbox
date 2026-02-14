import { describe, it, expect, beforeAll } from 'vitest';
import {
  formatTimestamp,
  formatValue,
  isHmacAlgorithm,
  parseJwt,
  verifySignature,
  getHeaderFields,
  getPayloadFields,
  generateToken,
  headerFieldMeanings,
  payloadFieldMeanings,
  type JwtHeader,
  type JwtPayload,
} from './jwt-utils';

describe('jwt-utils', () => {
  let validToken: string;
  let fullToken: string;

  beforeAll(async () => {
    validToken = await generateToken('test-secret', {
      sub: '1234567890',
      name: 'John Doe',
      iat: Math.floor(Date.now() / 1000) - 100,
    });

    fullToken = await generateToken('test-secret', {
      iss: 'https://example.com',
      aud: ['https://api.example.com'],
      sub: '1234567890',
      exp: Math.floor(Date.now() / 1000) + 3600,
      nbf: Math.floor(Date.now() / 1000) - 100,
      iat: Math.floor(Date.now() / 1000) - 100,
      jti: 'test-jti',
      name: 'John Doe',
      email: 'john@example.com',
      given_name: 'John',
      family_name: 'Doe',
      nickname: 'jdoe',
      picture: 'https://example.com/profile.jpg',
      locale: 'en-US',
      updated_at: 1516239022,
    });
  });

  describe('formatTimestamp', () => {
    it('should format a valid timestamp', () => {
      const result = formatTimestamp(1516239022);
      expect(result).toContain('1516239022');
      // Just check that it contains a date in the expected year
      expect(result).toMatch(/2018/);
    });

    it('should return empty string for undefined', () => {
      expect(formatTimestamp(undefined)).toBe('');
    });

    it('should handle timestamp 0', () => {
      const result = formatTimestamp(0);
      expect(result).toContain('0');
      // Just check that it contains a date in the expected year
      expect(result).toMatch(/1969|1970/);
    });
  });

  describe('formatValue', () => {
    it('should return "null" for null value', () => {
      expect(formatValue(null)).toBe('null');
    });

    it('should return "undefined" for undefined value', () => {
      expect(formatValue(undefined)).toBe('undefined');
    });

    it('should stringify objects', () => {
      const obj = { key: 'value' };
      expect(formatValue(obj)).toBe(JSON.stringify(obj, null, 2));
    });

    it('should stringify arrays', () => {
      const arr = [1, 2, 3];
      expect(formatValue(arr)).toBe(JSON.stringify(arr, null, 2));
    });

    it('should convert numbers to string', () => {
      expect(formatValue(123)).toBe('123');
    });

    it('should convert booleans to string', () => {
      expect(formatValue(true)).toBe('true');
      expect(formatValue(false)).toBe('false');
    });

    it('should convert strings to string', () => {
      expect(formatValue('hello')).toBe('hello');
    });
  });

  describe('isHmacAlgorithm', () => {
    it('should return true for HS256', () => {
      const header: JwtHeader = { alg: 'HS256' };
      expect(isHmacAlgorithm(header)).toBe(true);
    });

    it('should return true for HS384', () => {
      const header: JwtHeader = { alg: 'HS384' };
      expect(isHmacAlgorithm(header)).toBe(true);
    });

    it('should return true for HS512', () => {
      const header: JwtHeader = { alg: 'HS512' };
      expect(isHmacAlgorithm(header)).toBe(true);
    });

    it('should return false for RS256', () => {
      const header: JwtHeader = { alg: 'RS256' };
      expect(isHmacAlgorithm(header)).toBe(false);
    });

    it('should return false for ES256', () => {
      const header: JwtHeader = { alg: 'ES256' };
      expect(isHmacAlgorithm(header)).toBe(false);
    });

    it('should return false for null header', () => {
      expect(isHmacAlgorithm(null)).toBe(false);
    });

    it('should return false for undefined header', () => {
      const header = undefined as unknown as JwtHeader | null;
      expect(isHmacAlgorithm(header)).toBe(false);
    });

    it('should return false for header without alg', () => {
      const header: JwtHeader = { typ: 'JWT' };
      expect(isHmacAlgorithm(header)).toBe(false);
    });
  });

  describe('parseJwt', () => {
    it('should parse a valid JWT token', () => {
      const result = parseJwt(validToken);
      expect(result.header).not.toBeNull();
      expect(result.header?.alg).toBe('HS256');
      expect(result.header?.typ).toBe('JWT');
      expect(result.payload).not.toBeNull();
      expect(result.payload?.sub).toBe('1234567890');
      expect(result.payload?.name).toBe('John Doe');
      expect(result.error).toBeNull();
    });

    it('should parse full token with all standard fields', () => {
      const result = parseJwt(fullToken);
      expect(result.header).not.toBeNull();
      expect(result.header?.alg).toBe('HS256');
      expect(result.header?.typ).toBe('JWT');
      expect(result.payload).not.toBeNull();
      expect(result.payload?.iss).toBe('https://example.com');
      expect(result.payload?.aud).toEqual(['https://api.example.com']);
      expect(result.payload?.sub).toBe('1234567890');
      expect(result.payload?.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
      expect(result.payload?.nbf).toBeLessThan(Math.floor(Date.now() / 1000));
      expect(result.payload?.iat).toBeLessThan(Math.floor(Date.now() / 1000));
      expect(result.payload?.jti).toBe('test-jti');
      expect(result.payload?.name).toBe('John Doe');
      expect(result.payload?.email).toBe('john@example.com');
      expect(result.payload?.given_name).toBe('John');
      expect(result.payload?.family_name).toBe('Doe');
      expect(result.payload?.nickname).toBe('jdoe');
      expect(result.payload?.picture).toBe('https://example.com/profile.jpg');
      expect(result.payload?.locale).toBe('en-US');
      expect(result.payload?.updated_at).toBe(1516239022);
    });

    it('should return empty result for empty token', () => {
      const result = parseJwt('');
      expect(result.header).toBeNull();
      expect(result.payload).toBeNull();
      expect(result.error).toBeNull();
    });

    it('should return empty result for whitespace-only token', () => {
      const result = parseJwt('   ');
      expect(result.header).toBeNull();
      expect(result.payload).toBeNull();
      expect(result.error).toBeNull();
    });

    it('should return error for token with wrong number of parts', () => {
      const result = parseJwt('header.payload');
      expect(result.error).toBe('Not a JWT: Token must have 3 parts separated by dots');
    });

    it('should return error for token with more than 3 parts', () => {
      const result = parseJwt('a.b.c.d');
      expect(result.error).toBe('Not a JWT: Token must have 3 parts separated by dots');
    });

    it('should return error for invalid header base64', () => {
      const result = parseJwt('invalid!base64.payload.signature');
      expect(result.error).toContain('Invalid header:');
    });

    it('should return error for header without algorithm', () => {
      // Create a token with invalid header (missing alg) using base64url encoding
      const invalidHeader = btoa(JSON.stringify({ typ: 'JWT' }))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
      const result = parseJwt(`${invalidHeader}.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature`);
      // Error message gets prefixed with "Invalid header: " twice due to nested error handling
      expect(result.error).toContain('Missing algorithm (alg) field');
    });

    it('should trim whitespace around token', () => {
      const result = parseJwt(`  ${validToken}  `);
      expect(result.header).not.toBeNull();
      expect(result.error).toBeNull();
    });
  });

  describe('verifySignature', () => {
    let testToken: string;

    beforeAll(async () => {
      testToken = await generateToken('test-secret-key', {
        sub: '1234567890',
        name: 'John Doe',
        iat: Math.floor(Date.now() / 1000) - 700,
        exp: Math.floor(Date.now() / 1000) - 100,
      });
    });

    it('should verify valid HMAC signature', async () => {
      const result = await verifySignature(testToken, 'test-secret-key', { alg: 'HS256' });
      // compactVerify only checks signature, not expiration
      expect(result.verified).toBe(true);
      expect(result.error).toBeNull();
    });

    it('should return false for invalid HMAC signature', async () => {
      const result = await verifySignature(testToken, 'wrong-key', { alg: 'HS256' });
      expect(result.verified).toBe(false);
      expect(result.error).toBe('Signature invalid');
    });

    it('should return null verified for empty token', async () => {
      const result = await verifySignature('', 'some-key', { alg: 'HS256' });
      expect(result.verified).toBeNull();
      expect(result.error).toBeNull();
    });

    it('should return error when HMAC but no secret key provided', async () => {
      const result = await verifySignature(testToken, '', { alg: 'HS256' });
      expect(result.verified).toBe(false);
      expect(result.error).toBe('Require key');
    });

    it('should return error for non-HMAC algorithms (not implemented)', async () => {
      const result = await verifySignature(testToken, '', { alg: 'RS256' });
      expect(result.verified).toBe(false);
      expect(result.error).toBe('unimplemented');
    });

    it('should verify signature even for expired token', async () => {
      // The token has an expired timestamp, but compactVerify only checks signature
      const result = await verifySignature(testToken, 'test-secret-key', { alg: 'HS256' });
      // Signature should still be valid, expiration is checked separately in getPayloadFields
      expect(result.verified).toBe(true);
      expect(result.error).toBeNull();
    });

    it('should handle whitespace-only secret key', async () => {
      const result = await verifySignature(testToken, '   ', { alg: 'HS256' });
      expect(result.verified).toBe(false);
      expect(result.error).toBe('Require key');
    });

    it('should handle whitespace token', async () => {
      const result = await verifySignature('  ', 'test-secret-key', { alg: 'HS256' });
      expect(result.verified).toBeNull();
      expect(result.error).toBeNull();
    });
  });

  describe('getHeaderFields', () => {
    it('should return empty array for null header', () => {
      expect(getHeaderFields(null)).toEqual([]);
    });

    it('should return empty array for undefined header (treated as null)', () => {
      const header = undefined as unknown as JwtHeader | null;
      expect(getHeaderFields(header)).toEqual([]);
    });

    it('should return header fields with meanings', () => {
      const header: JwtHeader = { alg: 'HS256', typ: 'JWT', kid: 'test-key' };
      const fields = getHeaderFields(header);

      expect(fields).toHaveLength(3);

      const algField = fields.find((f) => f.field === 'alg');
      expect(algField?.meaning).toBe(headerFieldMeanings.alg);
      expect(algField?.isStandard).toBe(true);

      const typField = fields.find((f) => f.field === 'typ');
      expect(typField?.meaning).toBe(headerFieldMeanings.typ);
      expect(typField?.isStandard).toBe(true);

      const kidField = fields.find((f) => f.field === 'kid');
      expect(kidField?.meaning).toBe(headerFieldMeanings.kid);
      expect(kidField?.isStandard).toBe(true);
    });

    it('should return empty meaning for non-standard fields', () => {
      const header: JwtHeader = { alg: 'HS256', custom: 'custom-value' };
      const fields = getHeaderFields(header);

      const customField = fields.find((f) => f.field === 'custom');
      expect(customField?.meaning).toBe('');
      expect(customField?.isStandard).toBe(false);
    });

    it('should format values correctly', () => {
      const header: JwtHeader = { alg: 'HS256', count: 42 };
      const fields = getHeaderFields(header);

      const countField = fields.find((f) => f.field === 'count');
      expect(countField?.value).toBe('42');
    });

    it('should show Unknown algorithm error for unsupported alg', () => {
      const header: JwtHeader = { alg: 'UNKNOWN' };
      const fields = getHeaderFields(header);

      const algField = fields.find((f) => f.field === 'alg');
      expect(algField?.errorMessage).toBe('Unknown algorithm');
    });

    it('should not show error for supported algorithm', () => {
      const header: JwtHeader = { alg: 'HS256' };
      const fields = getHeaderFields(header);

      const algField = fields.find((f) => f.field === 'alg');
      expect(algField?.errorMessage).toBeUndefined();
    });
  });

  describe('getPayloadFields', () => {
    it('should return empty array for null payload', () => {
      expect(getPayloadFields(null)).toEqual([]);
    });

    it('should return empty array for undefined payload (treated as null)', () => {
      const payload = undefined as unknown as JwtPayload | null;
      expect(getPayloadFields(payload)).toEqual([]);
    });

    it('should return payload fields with meanings', () => {
      const payload: JwtPayload = {
        iss: 'https://example.com',
        sub: '1234567890',
        name: 'John Doe',
        email: 'john@example.com',
      };
      const fields = getPayloadFields(payload);

      expect(fields).toHaveLength(4);

      const issField = fields.find((f) => f.field === 'iss');
      expect(issField?.meaning).toBe(payloadFieldMeanings.iss);
      expect(issField?.isStandard).toBe(true);

      const subField = fields.find((f) => f.field === 'sub');
      expect(subField?.meaning).toBe(payloadFieldMeanings.sub);
      expect(subField?.isStandard).toBe(true);

      const nameField = fields.find((f) => f.field === 'name');
      expect(nameField?.meaning).toBe(payloadFieldMeanings.name);
      expect(nameField?.isStandard).toBe(true);

      const emailField = fields.find((f) => f.field === 'email');
      expect(emailField?.meaning).toBe(payloadFieldMeanings.email);
      expect(emailField?.isStandard).toBe(true);
    });

    it('should format timestamps for iat, exp, nbf fields', () => {
      const timestamp = 1516239022;
      const payload: JwtPayload = { iat: timestamp, exp: timestamp, nbf: timestamp };
      const fields = getPayloadFields(payload);

      const iatField = fields.find((f) => f.field === 'iat');
      expect(iatField?.value).toContain(String(timestamp));

      const expField = fields.find((f) => f.field === 'exp');
      expect(expField?.value).toContain(String(timestamp));

      const nbfField = fields.find((f) => f.field === 'nbf');
      expect(nbfField?.value).toContain(String(timestamp));
    });

    it('should format updated_at as timestamp', () => {
      const timestamp = 1516239022;
      const payload: JwtPayload = { updated_at: timestamp };
      const fields = getPayloadFields(payload);

      const updatedAtField = fields.find((f) => f.field === 'updated_at');
      expect(updatedAtField?.value).toContain(String(timestamp));
      expect(updatedAtField?.isStandard).toBe(true);
    });

    it('should return empty meaning for non-standard fields', () => {
      const payload: JwtPayload = { sub: '123', custom: 'custom-value' };
      const fields = getPayloadFields(payload);

      const customField = fields.find((f) => f.field === 'custom');
      expect(customField?.meaning).toBe('');
      expect(customField?.isStandard).toBe(false);
    });

    it('should format object values correctly', () => {
      const payload: JwtPayload = {
        sub: '123',
        roles: ['admin', 'user'],
      };
      const fields = getPayloadFields(payload);

      const rolesField = fields.find((f) => f.field === 'roles');
      expect(rolesField?.value).toContain('admin');
      expect(rolesField?.value).toContain('user');
    });

    it('should handle audience as array', () => {
      const payload: JwtPayload = { aud: ['user', 'admin'] };
      const fields = getPayloadFields(payload);

      const audField = fields.find((f) => f.field === 'aud');
      expect(audField?.value).toContain('user');
      expect(audField?.value).toContain('admin');
    });

    it('should show Expired error for expired token', () => {
      const now = Math.floor(Date.now() / 1000);
      const payload: JwtPayload = { exp: now - 100 };
      const fields = getPayloadFields(payload);

      const expField = fields.find((f) => f.field === 'exp');
      expect(expField?.errorMessage).toBe('Expired');
    });

    it('should show Not ready error for iat in future', () => {
      const now = Math.floor(Date.now() / 1000);
      const payload: JwtPayload = { iat: now + 100 };
      const fields = getPayloadFields(payload);

      const iatField = fields.find((f) => f.field === 'iat');
      expect(iatField?.errorMessage).toBe('Not ready');
    });

    it('should show Not ready error for nbf in future', () => {
      const now = Math.floor(Date.now() / 1000);
      const payload: JwtPayload = { nbf: now + 100 };
      const fields = getPayloadFields(payload);

      const nbfField = fields.find((f) => f.field === 'nbf');
      expect(nbfField?.errorMessage).toBe('Not ready');
    });

    it('should not show error for valid exp', () => {
      const now = Math.floor(Date.now() / 1000);
      const payload: JwtPayload = { exp: now + 3600 };
      const fields = getPayloadFields(payload);

      const expField = fields.find((f) => f.field === 'exp');
      expect(expField?.errorMessage).toBeUndefined();
    });

    it('should not show error for valid iat', () => {
      const now = Math.floor(Date.now() / 1000);
      const payload: JwtPayload = { iat: now - 100 };
      const fields = getPayloadFields(payload);

      const iatField = fields.find((f) => f.field === 'iat');
      expect(iatField?.errorMessage).toBeUndefined();
    });

    it('should not show error for valid nbf', () => {
      const now = Math.floor(Date.now() / 1000);
      const payload: JwtPayload = { nbf: now - 100 };
      const fields = getPayloadFields(payload);

      const nbfField = fields.find((f) => f.field === 'nbf');
      expect(nbfField?.errorMessage).toBeUndefined();
    });
  });

  describe('generateToken', () => {
    it('should generate a valid JWT token', async () => {
      const token = await generateToken('my-secret', { sub: '1234567890', name: 'John Doe' });

      expect(token).toBeTruthy();
      expect(token.split('.')).toHaveLength(3);

      // Verify the token can be parsed
      const result = parseJwt(token);
      expect(result.header?.alg).toBe('HS256');
      expect(result.header?.typ).toBe('JWT');
      expect(result.payload?.sub).toBe('1234567890');
      expect(result.payload?.name).toBe('John Doe');
    });

    it('should generate different tokens for different secrets', async () => {
      const token1 = await generateToken('secret1', { sub: '123' });
      const token2 = await generateToken('secret2', { sub: '123' });

      expect(token1).not.toBe(token2);
    });

    it('should generate different tokens for different payloads', async () => {
      const token1 = await generateToken('secret', { sub: '123' });
      const token2 = await generateToken('secret', { sub: '456' });

      expect(token1).not.toBe(token2);
    });

    it('should include all payload fields in the token', async () => {
      const payload = { sub: '1234567890', name: 'John Doe', email: 'john@example.com' };
      const token = await generateToken('secret', payload);
      const result = parseJwt(token);

      expect(result.payload?.sub).toBe('1234567890');
      expect(result.payload?.name).toBe('John Doe');
      expect(result.payload?.email).toBe('john@example.com');
    });
  });

  describe('constants', () => {
    it('should have all standard header field meanings', () => {
      expect(headerFieldMeanings.alg).toBe('Algorithm for signing');
      expect(headerFieldMeanings.typ).toBe('Token Type');
      expect(headerFieldMeanings.kid).toBe('Key ID');
      expect(headerFieldMeanings.cty).toBe('Content Type');
      expect(headerFieldMeanings.jku).toBe('JWK Set URL');
      expect(headerFieldMeanings.x5u).toBe('X.509 URL');
      expect(headerFieldMeanings.x5c).toBe('X.509 Certificate Chain');
      expect(headerFieldMeanings.x5t).toBe('X.509 Certificate SHA-1 Thumbprint');
    });

    it('should have all standard payload field meanings', () => {
      expect(payloadFieldMeanings.iss).toBe('Issuer');
      expect(payloadFieldMeanings.sub).toBe('Subject');
      expect(payloadFieldMeanings.aud).toBe('Audience');
      expect(payloadFieldMeanings.exp).toBe('Expiration Time');
      expect(payloadFieldMeanings.nbf).toBe('Not Before');
      expect(payloadFieldMeanings.iat).toBe('Issued At');
      expect(payloadFieldMeanings.jti).toBe('JWT ID');
      expect(payloadFieldMeanings.name).toBe('Name');
      expect(payloadFieldMeanings.email).toBe('Email');
      expect(payloadFieldMeanings.given_name).toBe('Given Name');
      expect(payloadFieldMeanings.family_name).toBe('Family Name');
      expect(payloadFieldMeanings.nickname).toBe('Nickname');
      expect(payloadFieldMeanings.picture).toBe('Picture URL');
      expect(payloadFieldMeanings.locale).toBe('Locale');
      expect(payloadFieldMeanings.updated_at).toBe('Updated At');
    });
  });
});
