/**
 * Minimal, dependency-free X.509 / PKCS#10 parser built on a small DER reader.
 * Signature verification and hashing use WebCrypto.
 */

// ---------------------------------------------------------------------------
// DER reader
// ---------------------------------------------------------------------------

export interface Asn1 {
  cls: number; // 0 universal, 1 application, 2 context, 3 private
  tag: number;
  constructed: boolean;
  start: number;
  contentStart: number;
  end: number;
  buf: Uint8Array;
}

const T = {
  BOOLEAN: 1,
  INTEGER: 2,
  BITSTRING: 3,
  OCTETSTRING: 4,
  NULL: 5,
  OID: 6,
  UTF8: 12,
  SEQUENCE: 16,
  SET: 17,
  PRINTABLE: 19,
  T61: 20,
  IA5: 22,
  UTCTIME: 23,
  GENTIME: 24,
  UNIVERSAL: 28,
  BMP: 30,
} as const;

export function readTlv(buf: Uint8Array, pos: number, limit = buf.length): Asn1 {
  if (pos + 2 > limit) throw new Error("Unexpected end of data while reading ASN.1 element");
  const b0 = buf[pos];
  const cls = b0 >> 6;
  const constructed = (b0 & 0x20) !== 0;
  let tag = b0 & 0x1f;
  let p = pos + 1;
  if (tag === 0x1f) {
    tag = 0;
    let b: number;
    do {
      if (p >= limit) throw new Error("Truncated ASN.1 tag");
      b = buf[p++];
      tag = tag * 128 + (b & 0x7f);
    } while (b & 0x80);
  }
  if (p >= limit) throw new Error("Truncated ASN.1 length");
  let len = buf[p++];
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n === 0) throw new Error("Indefinite-length (BER) encoding is not supported");
    if (n > 4) throw new Error("ASN.1 length too large");
    if (p + n > limit) throw new Error("Truncated ASN.1 length");
    len = 0;
    for (let i = 0; i < n; i++) len = len * 256 + buf[p++];
  }
  const end = p + len;
  if (end > limit) throw new Error("ASN.1 element extends past end of data");
  return { cls, tag, constructed, start: pos, contentStart: p, end, buf };
}

export function children(n: Asn1): Asn1[] {
  const out: Asn1[] = [];
  let p = n.contentStart;
  while (p < n.end) {
    const c = readTlv(n.buf, p, n.end);
    out.push(c);
    p = c.end;
  }
  return out;
}

const content = (n: Asn1) => n.buf.subarray(n.contentStart, n.end);
const raw = (n: Asn1) => n.buf.subarray(n.start, n.end);
const isUni = (n: Asn1 | undefined, tag: number): n is Asn1 => !!n && n.cls === 0 && n.tag === tag;
const isCtx = (n: Asn1 | undefined, tag: number): n is Asn1 => !!n && n.cls === 2 && n.tag === tag;

function expectSeq(n: Asn1 | undefined, what: string): Asn1 {
  if (!isUni(n, T.SEQUENCE)) throw new Error(`Malformed ${what}: expected SEQUENCE`);
  return n;
}

export function bytesToHex(b: Uint8Array, sep = ""): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join(sep);
}

const colonHex = (b: Uint8Array) => bytesToHex(b, ":").toUpperCase();

function decodeOid(b: Uint8Array): string {
  if (b.length === 0) throw new Error("Empty OBJECT IDENTIFIER");
  const parts: string[] = [];
  let val = 0n;
  let first = true;
  for (const byte of b) {
    val = (val << 7n) | BigInt(byte & 0x7f);
    if (!(byte & 0x80)) {
      if (first) {
        const v = Number(val);
        const a = v < 80 ? Math.floor(v / 40) : 2;
        parts.push(String(a), String(val - BigInt(a * 40)));
        first = false;
      } else {
        parts.push(val.toString());
      }
      val = 0n;
    }
  }
  return parts.join(".");
}

function readOid(n: Asn1 | undefined): string {
  if (!isUni(n, T.OID)) throw new Error("Malformed data: expected OBJECT IDENTIFIER");
  return decodeOid(content(n));
}

function intToBigInt(b: Uint8Array): bigint {
  if (b.length === 0) return 0n;
  let v = BigInt("0x" + bytesToHex(b));
  if (b[0] & 0x80) v -= 1n << BigInt(b.length * 8);
  return v;
}

/** Strip the leading zero byte that exists only for sign. */
function unsignedBytes(b: Uint8Array): Uint8Array {
  let i = 0;
  while (i < b.length - 1 && b[i] === 0) i++;
  return b.subarray(i);
}

function decodeString(n: Asn1): string {
  const c = content(n);
  switch (n.tag) {
    case T.BMP: {
      let s = "";
      for (let i = 0; i + 1 < c.length; i += 2) s += String.fromCharCode((c[i] << 8) | c[i + 1]);
      return s;
    }
    case T.UNIVERSAL: {
      let s = "";
      for (let i = 0; i + 3 < c.length; i += 4)
        s += String.fromCodePoint(
          ((c[i] << 24) | (c[i + 1] << 16) | (c[i + 2] << 8) | c[i + 3]) >>> 0,
        );
      return s;
    }
    case T.UTF8:
      return new TextDecoder("utf-8").decode(c);
    default:
      // PrintableString, IA5String, T61/Teletex (treated as latin1), others
      return Array.from(c, (x) => String.fromCharCode(x)).join("");
  }
}

function decodeTime(n: Asn1): Date {
  const s = decodeString(n);
  let m: RegExpMatchArray | null;
  if (n.tag === T.UTCTIME) {
    m = s.match(/^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?Z$/);
    if (!m) throw new Error(`Invalid UTCTime "${s}"`);
    const yy = Number(m[1]);
    const year = yy >= 50 ? 1900 + yy : 2000 + yy;
    return new Date(
      Date.UTC(year, Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0)),
    );
  }
  m = s.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\.\d+)?Z$/);
  if (!m) throw new Error(`Invalid GeneralizedTime "${s}"`);
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
}

// ---------------------------------------------------------------------------
// OID tables
// ---------------------------------------------------------------------------

const NAME_ATTRS: Record<string, [string, string]> = {
  "2.5.4.3": ["CN", "Common Name"],
  "2.5.4.4": ["SN", "Surname"],
  "2.5.4.5": ["serialNumber", "Serial Number"],
  "2.5.4.6": ["C", "Country"],
  "2.5.4.7": ["L", "Locality"],
  "2.5.4.8": ["ST", "State / Province"],
  "2.5.4.9": ["street", "Street Address"],
  "2.5.4.10": ["O", "Organization"],
  "2.5.4.11": ["OU", "Organizational Unit"],
  "2.5.4.12": ["title", "Title"],
  "2.5.4.15": ["businessCategory", "Business Category"],
  "2.5.4.17": ["postalCode", "Postal Code"],
  "2.5.4.42": ["GN", "Given Name"],
  "2.5.4.46": ["dnQualifier", "DN Qualifier"],
  "2.5.4.97": ["organizationIdentifier", "Organization Identifier"],
  "0.9.2342.19200300.100.1.1": ["UID", "User ID"],
  "0.9.2342.19200300.100.1.25": ["DC", "Domain Component"],
  "1.2.840.113549.1.9.1": ["emailAddress", "Email Address"],
  "1.3.6.1.4.1.311.60.2.1.1": ["jurisdictionL", "Jurisdiction Locality"],
  "1.3.6.1.4.1.311.60.2.1.2": ["jurisdictionST", "Jurisdiction State"],
  "1.3.6.1.4.1.311.60.2.1.3": ["jurisdictionC", "Jurisdiction Country"],
};

const EXT_NAMES: Record<string, string> = {
  "2.5.29.9": "Subject Directory Attributes",
  "2.5.29.14": "Subject Key Identifier",
  "2.5.29.15": "Key Usage",
  "2.5.29.16": "Private Key Usage Period",
  "2.5.29.17": "Subject Alternative Name",
  "2.5.29.18": "Issuer Alternative Name",
  "2.5.29.19": "Basic Constraints",
  "2.5.29.30": "Name Constraints",
  "2.5.29.31": "CRL Distribution Points",
  "2.5.29.32": "Certificate Policies",
  "2.5.29.33": "Policy Mappings",
  "2.5.29.35": "Authority Key Identifier",
  "2.5.29.36": "Policy Constraints",
  "2.5.29.37": "Extended Key Usage",
  "2.5.29.46": "Freshest CRL",
  "2.5.29.54": "Inhibit Any Policy",
  "1.3.6.1.5.5.7.1.1": "Authority Information Access",
  "1.3.6.1.5.5.7.1.11": "Subject Information Access",
  "1.3.6.1.5.5.7.1.24": "TLS Feature (OCSP Must-Staple)",
  "1.3.6.1.4.1.11129.2.4.2": "Signed Certificate Timestamps (SCT)",
  "1.3.6.1.4.1.11129.2.4.3": "CT Precertificate Poison",
  "2.16.840.1.113730.1.1": "Netscape Cert Type",
  "2.16.840.1.113730.1.13": "Netscape Comment",
  "1.3.6.1.4.1.311.20.2": "Microsoft Certificate Template Name",
  "1.3.6.1.4.1.311.21.7": "Microsoft Certificate Template",
  "1.3.6.1.4.1.311.21.10": "Microsoft Application Policies",
  "1.2.840.113549.1.9.14": "Extension Request",
};

const EKU_NAMES: Record<string, string> = {
  "2.5.29.37.0": "Any Extended Key Usage",
  "1.3.6.1.5.5.7.3.1": "TLS Web Server Authentication",
  "1.3.6.1.5.5.7.3.2": "TLS Web Client Authentication",
  "1.3.6.1.5.5.7.3.3": "Code Signing",
  "1.3.6.1.5.5.7.3.4": "Email Protection (S/MIME)",
  "1.3.6.1.5.5.7.3.8": "Time Stamping",
  "1.3.6.1.5.5.7.3.9": "OCSP Signing",
  "1.3.6.1.4.1.311.10.3.4": "Microsoft Encrypting File System",
  "1.3.6.1.4.1.311.20.2.2": "Microsoft Smart Card Logon",
  "1.3.6.1.5.5.7.3.17": "IPsec IKE",
  "1.3.6.1.5.2.3.4": "Kerberos PKINIT Client Auth",
  "1.3.6.1.5.2.3.5": "Kerberos PKINIT KDC",
};

const POLICY_NAMES: Record<string, string> = {
  "2.5.29.32.0": "Any Policy",
  "2.23.140.1.1": "CA/B Forum Extended Validation",
  "2.23.140.1.2.1": "CA/B Forum Domain Validated",
  "2.23.140.1.2.2": "CA/B Forum Organization Validated",
  "2.23.140.1.2.3": "CA/B Forum Individual Validated",
};

const AIA_METHODS: Record<string, string> = {
  "1.3.6.1.5.5.7.48.1": "OCSP",
  "1.3.6.1.5.5.7.48.2": "CA Issuers",
  "1.3.6.1.5.5.7.48.3": "Time Stamping",
  "1.3.6.1.5.5.7.48.5": "CA Repository",
};

const CURVES: Record<string, { name: string; bits: number; webcrypto?: string }> = {
  "1.2.840.10045.3.1.7": { name: "P-256 (secp256r1)", bits: 256, webcrypto: "P-256" },
  "1.3.132.0.34": { name: "P-384 (secp384r1)", bits: 384, webcrypto: "P-384" },
  "1.3.132.0.35": { name: "P-521 (secp521r1)", bits: 521, webcrypto: "P-521" },
  "1.3.132.0.10": { name: "secp256k1", bits: 256 },
  "1.2.840.10045.3.1.1": { name: "P-192 (secp192r1)", bits: 192 },
  "1.3.132.0.33": { name: "P-224 (secp224r1)", bits: 224 },
  "1.3.36.3.3.2.8.1.1.7": { name: "brainpoolP256r1", bits: 256 },
  "1.3.36.3.3.2.8.1.1.11": { name: "brainpoolP384r1", bits: 384 },
  "1.3.36.3.3.2.8.1.1.13": { name: "brainpoolP512r1", bits: 512 },
};

type HashName = "SHA-1" | "SHA-256" | "SHA-384" | "SHA-512";

interface SigAlgDef {
  name: string;
  kind: "rsa" | "ecdsa" | "ed25519" | "ed448" | "pss" | "unknown";
  hash?: HashName | "SHA-224";
}

const SIG_ALGS: Record<string, SigAlgDef> = {
  "1.2.840.113549.1.1.4": { name: "md5WithRSAEncryption", kind: "rsa" },
  "1.2.840.113549.1.1.5": { name: "sha1WithRSAEncryption", kind: "rsa", hash: "SHA-1" },
  "1.2.840.113549.1.1.11": { name: "sha256WithRSAEncryption", kind: "rsa", hash: "SHA-256" },
  "1.2.840.113549.1.1.12": { name: "sha384WithRSAEncryption", kind: "rsa", hash: "SHA-384" },
  "1.2.840.113549.1.1.13": { name: "sha512WithRSAEncryption", kind: "rsa", hash: "SHA-512" },
  "1.2.840.113549.1.1.14": { name: "sha224WithRSAEncryption", kind: "rsa", hash: "SHA-224" },
  "1.2.840.113549.1.1.10": { name: "RSASSA-PSS", kind: "pss" },
  "1.2.840.10045.4.1": { name: "ecdsa-with-SHA1", kind: "ecdsa", hash: "SHA-1" },
  "1.2.840.10045.4.3.1": { name: "ecdsa-with-SHA224", kind: "ecdsa", hash: "SHA-224" },
  "1.2.840.10045.4.3.2": { name: "ecdsa-with-SHA256", kind: "ecdsa", hash: "SHA-256" },
  "1.2.840.10045.4.3.3": { name: "ecdsa-with-SHA384", kind: "ecdsa", hash: "SHA-384" },
  "1.2.840.10045.4.3.4": { name: "ecdsa-with-SHA512", kind: "ecdsa", hash: "SHA-512" },
  "1.3.101.112": { name: "Ed25519", kind: "ed25519" },
  "1.3.101.113": { name: "Ed448", kind: "ed448" },
};

const HASH_OIDS: Record<string, HashName> = {
  "1.3.14.3.2.26": "SHA-1",
  "2.16.840.1.101.3.4.2.1": "SHA-256",
  "2.16.840.1.101.3.4.2.2": "SHA-384",
  "2.16.840.1.101.3.4.2.3": "SHA-512",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NameAttribute {
  oid: string;
  short: string;
  label: string;
  value: string;
}

export interface GeneralNameInfo {
  type: "DNS" | "IP" | "email" | "URI" | "DirName" | "Other" | "RegisteredID";
  value: string;
}

export interface KeyInfo {
  algorithm: string; // RSA, EC, Ed25519 ...
  oid: string;
  size?: number; // bits
  curve?: string;
  summary: string;
  spki: Uint8Array;
}

export interface ExtensionInfo {
  oid: string;
  name: string;
  critical: boolean;
  recognised: boolean;
  /** hex of the extension value (shown for unrecognised extensions) */
  hex: string;
}

export interface BasicConstraints {
  ca: boolean;
  pathLen?: number;
}

export interface PolicyInfo {
  oid: string;
  name?: string;
  cps: string[];
}

export interface AccessDescription {
  method: string;
  location: GeneralNameInfo;
}

export interface DecodedExtensions {
  list: ExtensionInfo[];
  san: GeneralNameInfo[];
  issuerAltNames: GeneralNameInfo[];
  basicConstraints?: BasicConstraints;
  keyUsage: string[];
  extendedKeyUsage: { oid: string; name: string }[];
  subjectKeyId?: string;
  authorityKeyId?: { keyId?: string; issuer?: string; serial?: string };
  authorityInfoAccess: AccessDescription[];
  crlDistributionPoints: GeneralNameInfo[];
  policies: PolicyInfo[];
  sctCount?: number;
  precertPoison: boolean;
  mustStaple: boolean;
}

export type SigStatus = "valid" | "invalid" | "unsupported";

export interface SigCheck {
  status: SigStatus;
  message: string;
}

export interface Fingerprints {
  sha1: string;
  sha256: string;
}

export type ValidityStatus = "valid" | "expired" | "not-yet-valid";

export interface Validity {
  notBefore: Date;
  notAfter: Date;
  status: ValidityStatus;
  /** Whole days until expiry (negative when already expired). */
  daysRemaining: number;
  /** Total lifetime in days. */
  lifetimeDays: number;
}

interface BaseItem {
  der: Uint8Array;
  pem: string;
  fingerprints: Fingerprints;
}

export interface CertificateInfo extends BaseItem {
  kind: "certificate";
  version: number;
  serial: string;
  subject: NameAttribute[];
  issuer: NameAttribute[];
  subjectString: string;
  issuerString: string;
  validity: Validity;
  publicKey: KeyInfo;
  signatureAlgorithm: string;
  signatureOid: string;
  extensions: DecodedExtensions;
  selfSigned: boolean;
  /** Signature check using the certificate's own key (only meaningful when selfSigned). */
  selfSignature?: SigCheck;
  /** @internal */
  _tbs: Uint8Array;
  _sigAlg: Asn1;
  _sig: Uint8Array;
  _subjectDer: Uint8Array;
  _issuerDer: Uint8Array;
}

export interface CsrInfo extends BaseItem {
  kind: "csr";
  version: number;
  subject: NameAttribute[];
  subjectString: string;
  publicKey: KeyInfo;
  signatureAlgorithm: string;
  signatureOid: string;
  extensions: DecodedExtensions;
  attributes: { oid: string; name: string }[];
  signature: SigCheck;
}

export interface PublicKeyInfo extends BaseItem {
  kind: "publickey";
  publicKey: KeyInfo;
}

export interface ErrorInfo {
  kind: "error";
  message: string;
  label?: string;
}

export interface WarningInfo {
  kind: "warning";
  message: string;
}

export type ParsedItem = CertificateInfo | CsrInfo | PublicKeyInfo | ErrorInfo | WarningInfo;

// ---------------------------------------------------------------------------
// PEM / base64 helpers
// ---------------------------------------------------------------------------

export function base64ToBytes(b64: string): Uint8Array {
  let s = b64.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s)) throw new Error("Invalid base64 data");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToBase64(b: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < b.length; i += 0x8000)
    bin += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function toPem(der: Uint8Array, label: string): string {
  const b64 = bytesToBase64(der);
  const lines = b64.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`;
}

const CERT_LABELS = ["CERTIFICATE", "TRUSTED CERTIFICATE", "X509 CERTIFICATE"];
const CSR_LABELS = ["CERTIFICATE REQUEST", "NEW CERTIFICATE REQUEST", "X509 CRL REQUEST"];

interface RawBlock {
  label: string;
  der: Uint8Array;
}

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

function parseName(n: Asn1): NameAttribute[] {
  expectSeq(n, "Name");
  const out: NameAttribute[] = [];
  for (const rdn of children(n)) {
    if (!isUni(rdn, T.SET)) throw new Error("Malformed Name: expected SET");
    for (const atv of children(rdn)) {
      const kv = children(expectSeq(atv, "AttributeTypeAndValue"));
      const oid = readOid(kv[0]);
      const known = NAME_ATTRS[oid];
      out.push({
        oid,
        short: known?.[0] ?? oid,
        label: known?.[1] ?? oid,
        value: kv[1] ? decodeString(kv[1]) : "",
      });
    }
  }
  return out;
}

export function nameToString(attrs: NameAttribute[]): string {
  // Conventional display order is the reverse of DER order, e.g. "CN=x, O=y, C=z"
  return attrs
    .slice()
    .reverse()
    .map((a) => `${a.short}=${a.value}`)
    .join(", ");
}

// ---------------------------------------------------------------------------
// GeneralNames
// ---------------------------------------------------------------------------

export function formatIp(b: Uint8Array): string {
  if (b.length === 4) return Array.from(b).join(".");
  if (b.length === 16) {
    const g: number[] = [];
    for (let i = 0; i < 16; i += 2) g.push((b[i] << 8) | b[i + 1]);
    let bestStart = -1;
    let bestLen = 0;
    for (let i = 0; i < 8;) {
      if (g[i] === 0) {
        let j = i;
        while (j < 8 && g[j] === 0) j++;
        if (j - i > bestLen) {
          bestStart = i;
          bestLen = j - i;
        }
        i = j;
      } else i++;
    }
    if (bestLen < 2) return g.map((x) => x.toString(16)).join(":");
    const left = g.slice(0, bestStart).map((x) => x.toString(16));
    const right = g.slice(bestStart + bestLen).map((x) => x.toString(16));
    return `${left.join(":")}::${right.join(":")}`;
  }
  if (b.length === 8 || b.length === 32) {
    const half = b.length / 2;
    return `${formatIp(b.subarray(0, half))}/${formatIp(b.subarray(half))}`;
  }
  return colonHex(b);
}

function parseGeneralName(n: Asn1): GeneralNameInfo {
  const ascii = () => Array.from(content(n), (x) => String.fromCharCode(x)).join("");
  if (n.cls !== 2) throw new Error("Malformed GeneralName");
  switch (n.tag) {
    case 1:
      return { type: "email", value: ascii() };
    case 2:
      return { type: "DNS", value: ascii() };
    case 4: {
      const inner = children(n)[0];
      return { type: "DirName", value: nameToString(parseName(inner)) };
    }
    case 6:
      return { type: "URI", value: ascii() };
    case 7:
      return { type: "IP", value: formatIp(content(n)) };
    case 8:
      return { type: "RegisteredID", value: decodeOid(content(n)) };
    default:
      return { type: "Other", value: `[${n.tag}] ${bytesToHex(content(n))}` };
  }
}

function parseGeneralNames(n: Asn1): GeneralNameInfo[] {
  return children(expectSeq(n, "GeneralNames")).map(parseGeneralName);
}

// ---------------------------------------------------------------------------
// Extensions
// ---------------------------------------------------------------------------

const KEY_USAGE_BITS = [
  "Digital Signature",
  "Non Repudiation",
  "Key Encipherment",
  "Data Encipherment",
  "Key Agreement",
  "Certificate Sign",
  "CRL Sign",
  "Encipher Only",
  "Decipher Only",
];

function bitStringBits(n: Asn1): boolean[] {
  const c = content(n);
  if (c.length === 0) return [];
  const unused = c[0];
  const bits: boolean[] = [];
  for (let i = 1; i < c.length; i++) {
    for (let b = 7; b >= 0; b--) bits.push(((c[i] >> b) & 1) === 1);
  }
  return bits.slice(0, Math.max(0, bits.length - unused));
}

function emptyDecoded(): DecodedExtensions {
  return {
    list: [],
    san: [],
    issuerAltNames: [],
    keyUsage: [],
    extendedKeyUsage: [],
    authorityInfoAccess: [],
    crlDistributionPoints: [],
    policies: [],
    precertPoison: false,
    mustStaple: false,
  };
}

function countScts(octets: Uint8Array): number {
  // value is an OCTET STRING wrapping a TLS-encoded SignedCertificateTimestampList
  const inner = readTlv(octets, 0);
  const c = content(inner);
  if (c.length < 2) return 0;
  const total = (c[0] << 8) | c[1];
  let p = 2;
  let count = 0;
  while (p + 2 <= c.length && p < 2 + total) {
    const l = (c[p] << 8) | c[p + 1];
    p += 2 + l;
    count++;
  }
  return count;
}

function decodeExtensions(extSeq: Asn1 | undefined): DecodedExtensions {
  const out = emptyDecoded();
  if (!extSeq) return out;
  for (const ext of children(expectSeq(extSeq, "Extensions"))) {
    const parts = children(expectSeq(ext, "Extension"));
    const oid = readOid(parts[0]);
    let idx = 1;
    let critical = false;
    if (isUni(parts[idx], T.BOOLEAN)) {
      critical = content(parts[idx])[0] !== 0;
      idx++;
    }
    const valueNode = parts[idx];
    if (!isUni(valueNode, T.OCTETSTRING)) throw new Error(`Malformed extension ${oid}`);
    const valueBytes = content(valueNode);
    let recognised = true;
    try {
      const v = () => readTlv(valueBytes, 0);
      switch (oid) {
        case "2.5.29.19": {
          const kids = children(expectSeq(v(), "BasicConstraints"));
          const bc: BasicConstraints = { ca: false };
          for (const k of kids) {
            if (isUni(k, T.BOOLEAN)) bc.ca = content(k)[0] !== 0;
            else if (isUni(k, T.INTEGER)) bc.pathLen = Number(intToBigInt(content(k)));
          }
          out.basicConstraints = bc;
          break;
        }
        case "2.5.29.15": {
          const bits = bitStringBits(v());
          out.keyUsage = KEY_USAGE_BITS.filter((_, i) => bits[i]);
          break;
        }
        case "2.5.29.37":
          out.extendedKeyUsage = children(expectSeq(v(), "ExtKeyUsage")).map((k) => {
            const o = readOid(k);
            return { oid: o, name: EKU_NAMES[o] ?? o };
          });
          break;
        case "2.5.29.17":
          out.san = parseGeneralNames(v());
          break;
        case "2.5.29.18":
          out.issuerAltNames = parseGeneralNames(v());
          break;
        case "2.5.29.14": {
          const o = v();
          if (!isUni(o, T.OCTETSTRING)) throw new Error("bad SKI");
          out.subjectKeyId = colonHex(content(o));
          break;
        }
        case "2.5.29.35": {
          const aki: NonNullable<DecodedExtensions["authorityKeyId"]> = {};
          for (const k of children(expectSeq(v(), "AuthorityKeyIdentifier"))) {
            if (isCtx(k, 0)) aki.keyId = colonHex(content(k));
            else if (isCtx(k, 1)) {
              aki.issuer = children(k)
                .map((g) => parseGeneralName(g).value)
                .join(", ");
            } else if (isCtx(k, 2)) aki.serial = formatSerial(content(k));
          }
          out.authorityKeyId = aki;
          break;
        }
        case "1.3.6.1.5.5.7.1.1":
          out.authorityInfoAccess = children(expectSeq(v(), "AIA")).map((d) => {
            const k = children(expectSeq(d, "AccessDescription"));
            const m = readOid(k[0]);
            return { method: AIA_METHODS[m] ?? m, location: parseGeneralName(k[1]) };
          });
          break;
        case "2.5.29.31":
          for (const dp of children(expectSeq(v(), "CRLDistributionPoints"))) {
            for (const f of children(expectSeq(dp, "DistributionPoint"))) {
              if (isCtx(f, 0)) {
                for (const name of children(f)) {
                  if (isCtx(name, 0))
                    out.crlDistributionPoints.push(...children(name).map(parseGeneralName));
                }
              }
            }
          }
          break;
        case "2.5.29.32":
          out.policies = children(expectSeq(v(), "CertificatePolicies")).map((p) => {
            const k = children(expectSeq(p, "PolicyInformation"));
            const o = readOid(k[0]);
            const cps: string[] = [];
            if (k[1]) {
              for (const q of children(expectSeq(k[1], "PolicyQualifiers"))) {
                const qk = children(q);
                if (readOid(qk[0]) === "1.3.6.1.5.5.7.2.1" && qk[1]) cps.push(decodeString(qk[1]));
              }
            }
            return { oid: o, name: POLICY_NAMES[o], cps };
          });
          break;
        case "1.3.6.1.4.1.11129.2.4.2":
          out.sctCount = countScts(valueBytes);
          break;
        case "1.3.6.1.4.1.11129.2.4.3":
          out.precertPoison = true;
          break;
        case "1.3.6.1.5.5.7.1.24":
          out.mustStaple = children(expectSeq(v(), "TLSFeature")).some(
            (k) => Number(intToBigInt(content(k))) === 5,
          );
          break;
        default:
          recognised = false;
      }
    } catch {
      // A malformed known extension is shown in the raw list instead of failing the whole parse
      recognised = false;
    }
    out.list.push({
      oid,
      name: EXT_NAMES[oid] ?? "",
      critical,
      recognised,
      hex: bytesToHex(valueBytes),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------

function formatSerial(b: Uint8Array): string {
  return colonHex(unsignedBytes(b));
}

function parseSpki(n: Asn1): KeyInfo {
  const spki = raw(n);
  const kids = children(expectSeq(n, "SubjectPublicKeyInfo"));
  const algId = children(expectSeq(kids[0], "AlgorithmIdentifier"));
  const oid = readOid(algId[0]);
  const bitStr = kids[1];
  if (!isUni(bitStr, T.BITSTRING)) throw new Error("Malformed SubjectPublicKeyInfo");
  const keyBytes = content(bitStr).subarray(1);
  switch (oid) {
    case "1.2.840.113549.1.1.1":
    case "1.2.840.113549.1.1.10": {
      let size: number | undefined;
      try {
        const rsa = children(expectSeq(readTlv(keyBytes, 0), "RSAPublicKey"));
        const modulus = unsignedBytes(content(rsa[0]));
        size = modulus.length * 8 - Math.clz32(modulus[0]) + 24;
      } catch {
        /* leave size undefined */
      }
      return {
        algorithm: oid === "1.2.840.113549.1.1.1" ? "RSA" : "RSA-PSS",
        oid,
        size,
        summary: size ? `RSA ${size} bit` : "RSA",
        spki,
      };
    }
    case "1.2.840.10045.2.1": {
      const curveOid = algId[1] && isUni(algId[1], T.OID) ? decodeOid(content(algId[1])) : "";
      const curve = CURVES[curveOid];
      const curveName = curve?.name ?? (curveOid || "unknown curve");
      return {
        algorithm: "EC",
        oid,
        size: curve?.bits,
        curve: curveName,
        summary: `EC ${curveName}` + (curve ? ` (${curve.bits} bit)` : ""),
        spki,
      };
    }
    case "1.3.101.112":
      return { algorithm: "Ed25519", oid, size: 256, summary: "Ed25519 (256 bit)", spki };
    case "1.3.101.113":
      return { algorithm: "Ed448", oid, size: 456, summary: "Ed448 (456 bit)", spki };
    case "1.3.101.110":
      return { algorithm: "X25519", oid, size: 256, summary: "X25519 (256 bit)", spki };
    case "1.3.101.111":
      return { algorithm: "X448", oid, size: 448, summary: "X448 (448 bit)", spki };
    case "1.2.840.10040.4.1":
      return { algorithm: "DSA", oid, summary: "DSA", spki };
    default:
      return { algorithm: oid, oid, summary: `Unknown public key algorithm (${oid})`, spki };
  }
}

// ---------------------------------------------------------------------------
// Hashing and signature verification
// ---------------------------------------------------------------------------

const ab = (b: Uint8Array): ArrayBuffer => b.slice().buffer;

export async function hashHex(algo: "SHA-1" | "SHA-256", data: Uint8Array): Promise<string> {
  return colonHex(new Uint8Array(await crypto.subtle.digest(algo, ab(data))));
}

async function fingerprints(der: Uint8Array): Promise<Fingerprints> {
  const [sha1, sha256] = await Promise.all([hashHex("SHA-1", der), hashHex("SHA-256", der)]);
  return { sha1, sha256 };
}

function sigAlgName(alg: Asn1): { oid: string; name: string; def: SigAlgDef } {
  const kids = children(expectSeq(alg, "AlgorithmIdentifier"));
  const oid = readOid(kids[0]);
  const def = SIG_ALGS[oid] ?? { name: oid, kind: "unknown" as const };
  let name = def.name;
  if (def.kind === "pss") {
    const p = parsePssParams(kids[1]);
    name = `RSASSA-PSS (${p.hash ?? "unknown hash"}, salt ${p.saltLength})`;
  }
  return { oid, name, def };
}

function parsePssParams(n: Asn1 | undefined): { hash?: HashName; saltLength: number } {
  let hash: HashName | undefined = "SHA-1";
  let saltLength = 20;
  if (n && isUni(n, T.SEQUENCE)) {
    for (const k of children(n)) {
      const inner = children(k)[0];
      if (isCtx(k, 0)) hash = HASH_OIDS[readOid(children(inner)[0])];
      else if (isCtx(k, 2)) saltLength = Number(intToBigInt(content(inner)));
    }
  }
  return { hash, saltLength };
}

/** Convert a DER ECDSA-Sig-Value to the fixed-width r||s form WebCrypto expects. */
function ecdsaDerToRaw(sig: Uint8Array, size: number): Uint8Array {
  const kids = children(expectSeq(readTlv(sig, 0), "ECDSA signature"));
  const out = new Uint8Array(size * 2);
  [kids[0], kids[1]].forEach((k, i) => {
    const v = unsignedBytes(content(k));
    if (v.length > size) throw new Error("ECDSA signature component too large");
    out.set(v, i * size + (size - v.length));
  });
  return out;
}

/** Verify `data` was signed by the key in `issuerSpki` using the given AlgorithmIdentifier. */
export async function verifySignature(
  data: Uint8Array,
  sigAlgNode: Asn1,
  signature: Uint8Array,
  issuerSpki: Uint8Array,
): Promise<SigCheck> {
  try {
    if (typeof crypto === "undefined" || !crypto.subtle) {
      return { status: "unsupported", message: "Web Crypto API is not available" };
    }
    const alg = sigAlgName(sigAlgNode);
    const { def } = alg;
    const spki = children(readTlv(issuerSpki, 0));
    const keyOid = readOid(children(spki[0])[0]);
    if (def.kind === "unknown" || (def.kind === "rsa" && !def.hash)) {
      return { status: "unsupported", message: `Signature algorithm ${alg.name} is not supported` };
    }
    if (def.hash === "SHA-224") {
      return {
        status: "unsupported",
        message: "SHA-224 signatures are not supported by Web Crypto",
      };
    }
    const run = async (
      importAlg: AlgorithmIdentifier | RsaHashedImportParams | EcKeyImportParams,
      verifyAlg: AlgorithmIdentifier | RsaPssParams | EcdsaParams,
      sig: Uint8Array,
    ): Promise<SigCheck> => {
      let key: CryptoKey;
      try {
        key = await crypto.subtle.importKey("spki", ab(issuerSpki), importAlg, false, ["verify"]);
      } catch {
        return {
          status: "unsupported",
          message: "This browser cannot import the issuer public key for verification",
        };
      }
      const ok = await crypto.subtle.verify(verifyAlg, key, ab(sig), ab(data));
      return ok
        ? { status: "valid", message: `Signature verified (${alg.name})` }
        : { status: "invalid", message: "Signature does not match the issuer public key" };
    };

    switch (def.kind) {
      case "rsa":
        if (keyOid !== "1.2.840.113549.1.1.1") break;
        return await run(
          { name: "RSASSA-PKCS1-v1_5", hash: def.hash! },
          { name: "RSASSA-PKCS1-v1_5" },
          signature,
        );
      case "pss": {
        if (keyOid !== "1.2.840.113549.1.1.1" && keyOid !== "1.2.840.113549.1.1.10") break;
        const kids = children(sigAlgNode);
        const p = parsePssParams(kids[1]);
        if (!p.hash) return { status: "unsupported", message: "Unsupported RSASSA-PSS hash" };
        return await run(
          { name: "RSA-PSS", hash: p.hash },
          { name: "RSA-PSS", saltLength: p.saltLength },
          signature,
        );
      }
      case "ecdsa": {
        if (keyOid !== "1.2.840.10045.2.1") break;
        const curveOid = decodeOid(content(children(spki[0])[1]));
        const curve = CURVES[curveOid];
        if (!curve?.webcrypto) {
          return {
            status: "unsupported",
            message: `Curve ${curve?.name ?? curveOid} is not supported by Web Crypto`,
          };
        }
        const size = Math.ceil(curve.bits / 8);
        return await run(
          { name: "ECDSA", namedCurve: curve.webcrypto },
          { name: "ECDSA", hash: def.hash! },
          ecdsaDerToRaw(signature, size),
        );
      }
      case "ed25519":
        if (keyOid !== "1.3.101.112") break;
        return await run({ name: "Ed25519" }, { name: "Ed25519" }, signature);
      case "ed448":
        return { status: "unsupported", message: "Ed448 is not supported by Web Crypto" };
    }
    return {
      status: "invalid",
      message: `Signature algorithm ${alg.name} does not match the issuer key type`,
    };
  } catch (e) {
    return {
      status: "unsupported",
      message: `Could not verify signature: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

// ---------------------------------------------------------------------------
// Certificate / CSR / public key parsing
// ---------------------------------------------------------------------------

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function computeValidity(notBefore: Date, notAfter: Date, now = new Date()): Validity {
  const DAY = 86400000;
  const status: ValidityStatus =
    now < notBefore ? "not-yet-valid" : now > notAfter ? "expired" : "valid";
  return {
    notBefore,
    notAfter,
    status,
    daysRemaining: Math.floor((notAfter.getTime() - now.getTime()) / DAY),
    lifetimeDays: Math.round((notAfter.getTime() - notBefore.getTime()) / DAY),
  };
}

async function parseCertificate(der: Uint8Array, now: Date): Promise<CertificateInfo> {
  const cert = readTlv(der, 0);
  const top = children(expectSeq(cert, "Certificate"));
  if (top.length !== 3) throw new Error("Malformed Certificate: expected 3 elements");
  const tbs = expectSeq(top[0], "TBSCertificate");
  const kids = children(tbs);
  let i = 0;
  let version = 1;
  if (isCtx(kids[0], 0)) {
    version = Number(intToBigInt(content(children(kids[0])[0]))) + 1;
    i++;
  }
  const serialNode = kids[i++];
  if (!isUni(serialNode, T.INTEGER))
    throw new Error("Malformed Certificate: missing serial number");
  i++; // TBS signature algorithm (duplicate of the outer one)
  const issuerNode = kids[i++];
  const validityNode = children(expectSeq(kids[i++], "Validity"));
  const subjectNode = kids[i++];
  const spkiNode = kids[i++];
  if (!spkiNode || !subjectNode) throw new Error("Malformed Certificate: truncated TBSCertificate");
  let extNode: Asn1 | undefined;
  for (; i < kids.length; i++) {
    if (isCtx(kids[i], 3)) extNode = children(kids[i])[0];
  }

  const sigAlg = sigAlgName(top[1]);
  if (!isUni(top[2], T.BITSTRING)) throw new Error("Malformed Certificate: bad signature");

  const subject = parseName(subjectNode);
  const issuer = parseName(issuerNode);
  const publicKey = parseSpki(spkiNode);
  const extensions = decodeExtensions(extNode);
  const subjectDer = raw(subjectNode);
  const issuerDer = raw(issuerNode);
  const namesEqual = bytesEqual(subjectDer, issuerDer);
  const aki = extensions.authorityKeyId?.keyId;
  const selfSigned =
    namesEqual && (!aki || !extensions.subjectKeyId || aki === extensions.subjectKeyId);
  const sig = content(top[2]).subarray(1);

  const info: CertificateInfo = {
    kind: "certificate",
    der,
    pem: toPem(der, "CERTIFICATE"),
    fingerprints: await fingerprints(der),
    version,
    serial: formatSerial(content(serialNode)),
    subject,
    issuer,
    subjectString: nameToString(subject),
    issuerString: nameToString(issuer),
    validity: computeValidity(decodeTime(validityNode[0]), decodeTime(validityNode[1]), now),
    publicKey,
    signatureAlgorithm: sigAlg.name,
    signatureOid: sigAlg.oid,
    extensions,
    selfSigned,
    _tbs: raw(tbs),
    _sigAlg: top[1],
    _sig: sig,
    _subjectDer: subjectDer,
    _issuerDer: issuerDer,
  };
  if (selfSigned) {
    info.selfSignature = await verifySignature(info._tbs, info._sigAlg, info._sig, publicKey.spki);
  }
  return info;
}

async function parseCsr(der: Uint8Array): Promise<CsrInfo> {
  const csr = readTlv(der, 0);
  const top = children(expectSeq(csr, "CertificationRequest"));
  if (top.length !== 3) throw new Error("Malformed CSR: expected 3 elements");
  const cri = expectSeq(top[0], "CertificationRequestInfo");
  const kids = children(cri);
  if (kids.length < 3) throw new Error("Malformed CSR: truncated request info");
  const version = Number(intToBigInt(content(kids[0]))) + 1;
  const subject = parseName(kids[1]);
  const publicKey = parseSpki(kids[2]);
  let extensions = emptyDecoded();
  const attributes: { oid: string; name: string }[] = [];
  const attrs = kids.find((k) => isCtx(k, 0));
  if (attrs) {
    for (const a of children(attrs)) {
      const ak = children(expectSeq(a, "Attribute"));
      const oid = readOid(ak[0]);
      attributes.push({ oid, name: EXT_NAMES[oid] ?? ATTR_NAMES[oid] ?? "" });
      if (oid === "1.2.840.113549.1.9.14") {
        const extSeq = children(ak[1])[0];
        extensions = decodeExtensions(extSeq);
      }
    }
  }
  const sigAlg = sigAlgName(top[1]);
  if (!isUni(top[2], T.BITSTRING)) throw new Error("Malformed CSR: bad signature");
  return {
    kind: "csr",
    der,
    pem: toPem(der, "CERTIFICATE REQUEST"),
    fingerprints: await fingerprints(der),
    version,
    subject,
    subjectString: nameToString(subject),
    publicKey,
    signatureAlgorithm: sigAlg.name,
    signatureOid: sigAlg.oid,
    extensions,
    attributes,
    signature: await verifySignature(raw(cri), top[1], content(top[2]).subarray(1), publicKey.spki),
  };
}

const ATTR_NAMES: Record<string, string> = {
  "1.2.840.113549.1.9.7": "Challenge Password",
  "1.2.840.113549.1.9.2": "Unstructured Name",
  "1.2.840.113549.1.9.8": "Unstructured Address",
};

async function parsePublicKey(der: Uint8Array): Promise<PublicKeyInfo> {
  return {
    kind: "publickey",
    der,
    pem: toPem(der, "PUBLIC KEY"),
    fingerprints: await fingerprints(der),
    publicKey: parseSpki(readTlv(der, 0)),
  };
}

/** Guess what a DER blob is: certificate, CSR or SubjectPublicKeyInfo. */
function detectDerType(der: Uint8Array): "certificate" | "csr" | "publickey" {
  const top = children(expectSeq(readTlv(der, 0), "DER data"));
  if (top.length === 2 && isUni(top[0], T.SEQUENCE) && isUni(top[1], T.BITSTRING))
    return "publickey";
  if (top.length === 3 && isUni(top[0], T.SEQUENCE)) {
    const tbs = children(top[0]);
    if (isCtx(tbs[0], 0) || tbs.length >= 6) return "certificate";
    if (isUni(tbs[0], T.INTEGER) && tbs.length <= 4) return "csr";
    return "certificate";
  }
  throw new Error("Data is not a recognised certificate, CSR or public key structure");
}

/**
 * Extract DER blocks from user input. Accepts PEM text (possibly many blocks and
 * surrounding text), headerless base64, or raw DER bytes.
 */
export function extractBlocks(input: string | Uint8Array): {
  blocks: RawBlock[];
  items: ParsedItem[];
} {
  const items: ParsedItem[] = [];
  const blocks: RawBlock[] = [];
  let text: string | undefined;
  if (typeof input === "string") text = input;
  else if (input.length >= 11 && String.fromCharCode(...input.subarray(0, 11)) === "-----BEGIN ") {
    text = new TextDecoder().decode(input);
  }
  if (text === undefined) {
    if (input.length === 0) throw new Error("No data provided");
    blocks.push({ label: "", der: input });
    return { blocks, items };
  }

  const re = /-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/g;
  let m: RegExpExecArray | null;
  let found = false;
  while ((m = re.exec(text))) {
    found = true;
    const label = m[1];
    if (/PRIVATE KEY/.test(label)) {
      items.push({
        kind: "warning",
        message: `A ${label} block was found and ignored. Never paste private keys into online tools.`,
      });
      continue;
    }
    // drop RFC 1421 headers such as "Proc-Type: ..."
    const body = m[2]
      .split(/\r?\n/)
      .filter((l) => !/^[A-Za-z-]+:/.test(l.trim()))
      .join("");
    try {
      blocks.push({ label, der: base64ToBytes(body) });
    } catch {
      items.push({
        kind: "error",
        label,
        message: `The ${label} block does not contain valid base64 data`,
      });
    }
  }
  if (!found) {
    if (/-----BEGIN /.test(text)) {
      throw new Error(
        "Found a PEM header but no matching END line. Check that the PEM block is complete.",
      );
    }
    const trimmed = text.trim();
    if (!trimmed) throw new Error("No data provided");
    try {
      blocks.push({ label: "", der: base64ToBytes(trimmed) });
    } catch {
      throw new Error(
        "Input is not valid PEM, DER or base64. Paste a PEM block starting with -----BEGIN CERTIFICATE-----.",
      );
    }
  }
  return { blocks, items };
}

/** Parse everything found in the input. Individual failures become `error` items. */
export async function parseInput(
  input: string | Uint8Array,
  now = new Date(),
): Promise<ParsedItem[]> {
  const { blocks, items } = extractBlocks(input);
  const results: ParsedItem[] = [];
  for (const b of blocks) {
    try {
      let type: "certificate" | "csr" | "publickey";
      if (CERT_LABELS.includes(b.label)) type = "certificate";
      else if (CSR_LABELS.includes(b.label)) type = "csr";
      else if (b.label === "PUBLIC KEY") type = "publickey";
      else if (b.label === "") type = detectDerType(b.der);
      else {
        results.push({
          kind: "warning",
          message: `Unsupported PEM block "${b.label}" was ignored.`,
        });
        continue;
      }
      if (type === "certificate") results.push(await parseCertificate(b.der, now));
      else if (type === "csr") results.push(await parseCsr(b.der));
      else results.push(await parsePublicKey(b.der));
    } catch (e) {
      results.push({
        kind: "error",
        label: b.label || undefined,
        message: `Failed to parse ${b.label || "DER data"}: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }
  return [...results, ...items];
}

// ---------------------------------------------------------------------------
// Chain analysis
// ---------------------------------------------------------------------------

export interface ChainLink {
  /** index of the certificate (in the list of certificates) */
  index: number;
  /** index of the next certificate it was compared with */
  issuerIndex: number;
  nameMatch: boolean;
  signature: SigCheck;
  ok: boolean;
}

export interface ChainAnalysis {
  status: "ok" | "broken" | "misordered" | "incomplete";
  links: ChainLink[];
  messages: string[];
}

async function issuedBy(child: CertificateInfo, parent: CertificateInfo) {
  const nameMatch = bytesEqual(child._issuerDer, parent._subjectDer);
  const signature = await verifySignature(
    child._tbs,
    child._sigAlg,
    child._sig,
    parent.publicKey.spki,
  );
  const aki = child.extensions.authorityKeyId?.keyId;
  const ski = parent.extensions.subjectKeyId;
  const keyIdMismatch = !!aki && !!ski && aki !== ski;
  return { nameMatch: nameMatch && !keyIdMismatch, signature };
}

/** Check that each certificate is issued by the next one in the list. */
export async function analyzeChain(certs: CertificateInfo[]): Promise<ChainAnalysis> {
  const links: ChainLink[] = [];
  const messages: string[] = [];
  let misordered = false;
  let broken = false;
  for (let i = 0; i < certs.length - 1; i++) {
    const r = await issuedBy(certs[i], certs[i + 1]);
    const ok = r.nameMatch && r.signature.status !== "invalid";
    links.push({
      index: i,
      issuerIndex: i + 1,
      nameMatch: r.nameMatch,
      signature: r.signature,
      ok,
    });
    if (ok) continue;
    // look for the real issuer elsewhere in the bundle
    let found = -1;
    for (let j = 0; j < certs.length; j++) {
      if (j === i || j === i + 1) continue;
      const alt = await issuedBy(certs[i], certs[j]);
      if (alt.nameMatch && alt.signature.status !== "invalid") {
        found = j;
        break;
      }
    }
    if (found >= 0) {
      misordered = true;
      messages.push(
        `Certificate #${i + 1} is issued by certificate #${found + 1}, not by the next certificate (#${i + 2}). The chain is misordered.`,
      );
    } else {
      broken = true;
      messages.push(
        !r.nameMatch
          ? `Certificate #${i + 1} was not issued by certificate #${i + 2}: the issuer name${
              certs[i].extensions.authorityKeyId?.keyId && certs[i + 1].extensions.subjectKeyId
                ? " or key identifier"
                : ""
            } does not match.`
          : `Certificate #${i + 1} claims to be issued by certificate #${i + 2}, but the signature does not verify.`,
      );
    }
    if (r.nameMatch && r.signature.status === "invalid") {
      // already covered above
    }
  }
  const last = certs[certs.length - 1];
  let status: ChainAnalysis["status"] = broken ? "broken" : misordered ? "misordered" : "ok";
  if (status === "ok" && last && !last.selfSigned) {
    status = "incomplete";
    messages.push(
      "The last certificate is not self-signed, so the chain does not include its root (that is normal for server bundles).",
    );
  }
  if (links.some((l) => l.signature.status === "unsupported")) {
    messages.push(
      "Some signatures could not be verified because the algorithm is not supported by this browser.",
    );
  }
  return { status, links, messages };
}
