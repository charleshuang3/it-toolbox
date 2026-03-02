import { decodeJwt, compactVerify, SignJWT, createRemoteJWKSet } from 'jose';

export interface JwtHeader {
  alg?: string;
  typ?: string;
  kid?: string;
  [key: string]: unknown;
}

export interface JwtPayload {
  iss?: string;
  sub?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
  iat?: number;
  jti?: string;
  [key: string]: unknown;
}

export interface ParsedResult {
  header: JwtHeader | null;
  payload: JwtPayload | null;
  error: string | null;
}

export interface FieldDisplay {
  field: string;
  meaning: string;
  value: string;
  isStandard: boolean;
  errorMessage?: string;
}

export const headerFieldMeanings: Record<string, string> = {
  alg: 'Algorithm for signing',
  typ: 'Token Type',
  kid: 'Key ID',
  cty: 'Content Type',
  jku: 'JWK Set URL',
  x5u: 'X.509 URL',
  x5c: 'X.509 Certificate Chain',
  x5t: 'X.509 Certificate SHA-1 Thumbprint',
};

export const payloadFieldMeanings: Record<string, string> = {
  iss: 'Issuer',
  sub: 'Subject',
  aud: 'Audience',
  exp: 'Expiration Time',
  nbf: 'Not Before',
  iat: 'Issued At',
  jti: 'JWT ID',
  name: 'Name',
  email: 'Email',
  given_name: 'Given Name',
  family_name: 'Family Name',
  nickname: 'Nickname',
  picture: 'Picture URL',
  locale: 'Locale',
  updated_at: 'Updated At',
};

export const SUPPORTED_ALGORITHMS = [
  'HS256',
  'HS384',
  'HS512',
  'RS256',
  'RS384',
  'RS512',
  'ES256',
  'ES384',
  'ES512',
  'PS256',
  'PS384',
  'PS512',
  'EdDSA',
];

export async function generateToken(secretKey: string, payload: Record<string, unknown>): Promise<string> {
  const encoder = new TextEncoder();
  const key = encoder.encode(secretKey);

  const jwt = await new SignJWT(payload).setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).sign(key);

  return jwt;
}

export function formatTimestamp(timestamp: number | undefined): string {
  if (timestamp === undefined) return '';
  const date = new Date(timestamp * 1000);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  const localTimezone =
    new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' })
      .formatToParts(date)
      .find((part) => part.type === 'timeZoneName')?.value ?? '';
  return `${timestamp} (${year}-${month}-${day} ${hours}:${minutes}:${seconds} ${localTimezone})`;
}

export function formatValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

export function isHmacAlgorithm(header: JwtHeader | null): boolean {
  return header?.alg?.startsWith('HS') ?? false;
}

export function parseJwt(token: string): ParsedResult {
  const result: ParsedResult = {
    header: null,
    payload: null,
    error: null,
  };

  if (!token.trim()) {
    return result;
  }

  try {
    const parts = token.trim().split('.');
    if (parts.length !== 3) {
      throw new Error('Not a JWT: Token must have 3 parts separated by dots');
    }

    try {
      const headerJson = atob(parts[0].replace(/-/g, '+').replace(/_/g, '/'));
      result.header = JSON.parse(headerJson) as JwtHeader;

      if (!result.header?.alg) {
        throw new Error('Invalid header: Missing algorithm (alg) field');
      }
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Invalid header: ${error.message}`);
      }
      throw error;
    }

    const decoded = decodeJwt(token.trim());
    result.payload = decoded as JwtPayload;
  } catch (error) {
    result.error = error instanceof Error ? error.message : 'Failed to parse JWT';
  }

  return result;
}

interface OpenIdConfig {
  jwks_uri: string;
  issuer: string;
  [key: string]: unknown;
}

async function fetchOpenIdConfig(issuer: string): Promise<OpenIdConfig> {
  const configUrl = new URL('.well-known/openid-configuration', issuer.endsWith('/') ? issuer : issuer + '/');
  const response = await fetch(configUrl.toString());
  if (!response.ok) {
    throw new Error(`Failed to fetch OpenID configuration: ${response.statusText}`);
  }
  return response.json();
}

export async function verifySignature(
  token: string,
  secretKey: string,
  header: JwtHeader | null,
  payload: JwtPayload | null,
): Promise<{ verified: boolean | null; error: string | null }> {
  if (!token.trim()) {
    return { verified: null, error: null };
  }

  const isHmac = isHmacAlgorithm(header);

  if (isHmac && !secretKey.trim()) {
    return { verified: false, error: 'Require key' };
  }

  if (isHmac) {
    try {
      const alg = header?.alg || 'HS256';
      const secret = new TextEncoder().encode(secretKey);

      await compactVerify(token.trim(), secret, {
        algorithms: [alg],
      });

      return { verified: true, error: null };
    } catch {
      return { verified: false, error: 'Signature invalid' };
    }
  }

  if (!payload?.iss) {
    return { verified: false, error: 'Missing issuer (iss) claim' };
  }

  try {
    const openIdConfig = await fetchOpenIdConfig(payload.iss);
    const jwksUrl = new URL(openIdConfig.jwks_uri);
    const JWKS = createRemoteJWKSet(jwksUrl);

    const options: Record<string, unknown> = {};
    if (payload.iss) {
      options.issuer = payload.iss;
    }
    if (payload.aud) {
      options.audience = payload.aud;
    }

    await compactVerify(token.trim(), JWKS, options);

    return { verified: true, error: null };
  } catch (error) {
    if (error instanceof Error) {
      return { verified: false, error: error.message };
    }
    return { verified: false, error: 'Signature verification failed' };
  }
}

export function getHeaderFields(header: JwtHeader | null): FieldDisplay[] {
  if (!header) return [];
  return Object.entries(header).map(([key, value]) => {
    let errorMessage: string | undefined;

    if (key === 'alg') {
      const alg = String(value);
      if (!SUPPORTED_ALGORITHMS.includes(alg)) {
        errorMessage = 'Unknown algorithm';
      }
    }

    return {
      field: key,
      meaning: headerFieldMeanings[key] || '',
      value: formatValue(value),
      isStandard: key in headerFieldMeanings,
      errorMessage,
    };
  });
}

export function getPayloadFields(payload: JwtPayload | null): FieldDisplay[] {
  if (!payload) return [];
  const now = Math.floor(Date.now() / 1000);

  return Object.entries(payload).map(([key, value]) => {
    let displayValue = formatValue(value);
    let errorMessage: string | undefined;

    if (['iat', 'exp', 'nbf', 'updated_at'].includes(key) && typeof value === 'number') {
      displayValue = formatTimestamp(value);
    }

    // Validation for time-based claims
    if (key === 'exp' && typeof value === 'number') {
      if (value < now) {
        errorMessage = 'Expired';
      }
    } else if (key === 'iat' && typeof value === 'number') {
      if (value > now) {
        errorMessage = 'Not ready';
      }
    } else if (key === 'nbf' && typeof value === 'number') {
      if (value > now) {
        errorMessage = 'Not ready';
      }
    }

    return {
      field: key,
      meaning: payloadFieldMeanings[key] || '',
      value: displayValue,
      isStandard: key in payloadFieldMeanings,
      errorMessage,
    };
  });
}
