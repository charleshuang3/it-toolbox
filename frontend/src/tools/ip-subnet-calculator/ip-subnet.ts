/**
 * Pure IPv4 / IPv6 subnet helpers built on BigInt (no dependencies).
 * All parse functions throw IpError with a user-presentable message.
 */

export type IpVersion = 4 | 6;

export class IpError extends Error {}

export interface Cidr {
  version: IpVersion;
  /** Address value (host bits are preserved as given). */
  address: bigint;
  prefix: number;
}

export const MAX_SPLIT_ROWS = 1024;

export function bitsOf(version: IpVersion): number {
  return version === 4 ? 32 : 128;
}

function allOnes(bits: number): bigint {
  return (1n << BigInt(bits)) - 1n;
}

/** Netmask value for a prefix. */
export function prefixMask(version: IpVersion, prefix: number): bigint {
  const bits = bitsOf(version);
  return allOnes(prefix) << BigInt(bits - prefix);
}

export function hostMask(version: IpVersion, prefix: number): bigint {
  return allOnes(bitsOf(version) - prefix);
}

// ---------------------------------------------------------------- parsing

export function parseIPv4(input: string): bigint {
  const s = input.trim();
  const parts = s.split(".");
  if (parts.length !== 4) {
    throw new IpError(`Invalid IPv4 address "${s}": expected 4 dot-separated octets`);
  }
  let value = 0n;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) {
      throw new IpError(`Invalid IPv4 address "${s}": octet "${p}" is not a number`);
    }
    if (p.length > 1 && p.startsWith("0")) {
      throw new IpError(
        `Invalid IPv4 address "${s}": octet "${p}" has a leading zero (ambiguous, may be read as octal)`,
      );
    }
    const n = Number(p);
    if (n > 255) {
      throw new IpError(`Invalid IPv4 address "${s}": octet ${n} is out of range 0-255`);
    }
    value = (value << 8n) | BigInt(n);
  }
  return value;
}

export function parseIPv6(input: string): bigint {
  let s = input.trim();
  if (s.startsWith("[") && s.endsWith("]")) {
    s = s.slice(1, -1);
  }
  const zone = s.indexOf("%");
  if (zone >= 0) {
    s = s.slice(0, zone);
  }
  const fail = (why: string): never => {
    throw new IpError(`Invalid IPv6 address "${input.trim()}": ${why}`);
  };
  if (!s.includes(":")) {
    return fail("missing ':'");
  }
  // Embedded IPv4 tail
  if (s.includes(".")) {
    const idx = s.lastIndexOf(":");
    const v4 = parseIPv4(s.slice(idx + 1));
    const hi = ((v4 >> 16n) & 0xffffn).toString(16);
    const lo = (v4 & 0xffffn).toString(16);
    s = `${s.slice(0, idx + 1)}${hi}:${lo}`;
  }
  const halves = s.split("::");
  if (halves.length > 2) {
    return fail("'::' may appear only once");
  }
  const toGroups = (part: string): string[] => (part === "" ? [] : part.split(":"));
  const left = toGroups(halves[0]!);
  const right = halves.length === 2 ? toGroups(halves[1]!) : [];
  const total = left.length + right.length;
  if (halves.length === 1 ? total !== 8 : total > 7) {
    return fail(halves.length === 1 ? "expected 8 groups" : "too many groups");
  }
  const groups = [...left, ...Array<string>(8 - total).fill("0"), ...right];
  let value = 0n;
  for (const g of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(g)) {
      return fail(`invalid group "${g}"`);
    }
    value = (value << 16n) | BigInt(parseInt(g, 16));
  }
  return value;
}

/** Parse an address of either family (auto-detected). */
export function parseAddress(input: string): { version: IpVersion; value: bigint } {
  const s = input.trim();
  if (s === "") {
    throw new IpError("Empty address");
  }
  if (s.includes(":")) {
    return { version: 6, value: parseIPv6(s) };
  }
  return { version: 4, value: parseIPv4(s) };
}

export function formatIPv4(value: bigint): string {
  return [24n, 16n, 8n, 0n].map((sh) => Number((value >> sh) & 0xffn)).join(".");
}

function groups16(value: bigint): number[] {
  const out: number[] = [];
  for (let i = 7; i >= 0; i--) {
    out.push(Number((value >> BigInt(i * 16)) & 0xffffn));
  }
  return out;
}

/** RFC 5952 compressed form. */
export function formatIPv6(value: bigint): string {
  const g = groups16(value);
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
    } else {
      i++;
    }
  }
  const hex = g.map((n) => n.toString(16));
  if (bestLen < 2) {
    return hex.join(":");
  }
  const head = hex.slice(0, bestStart).join(":");
  const tail = hex.slice(bestStart + bestLen).join(":");
  return `${head}::${tail}`;
}

export function expandIPv6(value: bigint): string {
  return groups16(value)
    .map((n) => n.toString(16).padStart(4, "0"))
    .join(":");
}

export function formatAddress(version: IpVersion, value: bigint): string {
  return version === 4 ? formatIPv4(value) : formatIPv6(value);
}

function parsePrefixNumber(s: string, version: IpVersion): number {
  if (!/^\d{1,3}$/.test(s)) {
    throw new IpError(`Invalid prefix length "${s}"`);
  }
  const n = Number(s);
  if (n > bitsOf(version)) {
    throw new IpError(`Prefix length /${n} is out of range 0-${bitsOf(version)} for IPv${version}`);
  }
  return n;
}

/** Count of leading ones if value (of `bits` bits) is 1..10..0, else null. */
function leadingOnes(value: bigint, bits: number): number | null {
  let ones = 0;
  while (ones < bits && ((value >> BigInt(bits - 1 - ones)) & 1n) === 1n) {
    ones++;
  }
  return (value & allOnes(bits - ones)) === 0n ? ones : null;
}

/** Convert a dotted netmask or wildcard mask to a prefix length. */
export function maskToPrefix(mask: string): number {
  const value = parseIPv4(mask);
  const asNetmask = leadingOnes(value, 32);
  if (asNetmask !== null) {
    return asNetmask;
  }
  // wildcard: 0..01..1
  const asWildcard = leadingOnes(~value & allOnes(32), 32);
  if (asWildcard !== null) {
    return asWildcard;
  }
  throw new IpError(
    `"${mask.trim()}" is not a valid netmask or wildcard mask (non-contiguous bits)`,
  );
}

/**
 * Parse "addr", "addr/nn", "addr/netmask", "addr netmask", "addr wildcard".
 * A bare address gets a host prefix (/32 or /128).
 * Ambiguity: 0.0.0.0 and 255.255.255.255 are read as netmasks.
 */
export function parseCidrInput(input: string): Cidr {
  const s = input.trim();
  if (s === "") {
    throw new IpError("Enter an address, e.g. 192.168.1.10/24");
  }
  let addrPart: string;
  let maskPart: string | null = null;
  if (s.includes("/")) {
    const parts = s.split("/");
    if (parts.length !== 2) {
      throw new IpError(`Invalid CIDR "${s}": more than one '/'`);
    }
    addrPart = parts[0]!.trim();
    maskPart = parts[1]!.trim();
    if (maskPart === "") {
      throw new IpError(`Invalid CIDR "${s}": missing prefix length`);
    }
  } else {
    const parts = s.split(/\s+/);
    if (parts.length > 2) {
      throw new IpError(`Unrecognised input "${s}"`);
    }
    addrPart = parts[0]!;
    maskPart = parts.length === 2 ? parts[1]! : null;
  }
  const { version, value } = parseAddress(addrPart);
  let prefix: number;
  if (maskPart === null) {
    prefix = bitsOf(version);
  } else if (maskPart.includes(".")) {
    if (version !== 4) {
      throw new IpError("Dotted netmasks can only be used with IPv4 addresses");
    }
    prefix = maskToPrefix(maskPart);
  } else {
    prefix = parsePrefixNumber(maskPart, version);
  }
  return { version, address: value, prefix };
}

// ---------------------------------------------------------------- classification

interface RangeInfo {
  cidr: string;
  label: string;
}

const V4_RANGES: RangeInfo[] = [
  { cidr: "0.0.0.0/8", label: "This network (RFC 1122)" },
  { cidr: "10.0.0.0/8", label: "Private (RFC 1918)" },
  { cidr: "100.64.0.0/10", label: "Carrier-grade NAT shared space (RFC 6598)" },
  { cidr: "127.0.0.0/8", label: "Loopback (RFC 1122)" },
  { cidr: "169.254.0.0/16", label: "Link-local (RFC 3927)" },
  { cidr: "172.16.0.0/12", label: "Private (RFC 1918)" },
  { cidr: "192.0.0.0/24", label: "IETF protocol assignments (RFC 6890)" },
  { cidr: "192.0.2.0/24", label: "Documentation TEST-NET-1 (RFC 5737)" },
  { cidr: "192.88.99.0/24", label: "6to4 relay anycast (deprecated, RFC 7526)" },
  { cidr: "192.168.0.0/16", label: "Private (RFC 1918)" },
  { cidr: "198.18.0.0/15", label: "Benchmarking (RFC 2544)" },
  { cidr: "198.51.100.0/24", label: "Documentation TEST-NET-2 (RFC 5737)" },
  { cidr: "203.0.113.0/24", label: "Documentation TEST-NET-3 (RFC 5737)" },
  { cidr: "224.0.0.0/4", label: "Multicast (RFC 5771)" },
  { cidr: "240.0.0.0/4", label: "Reserved (class E)" },
  { cidr: "255.255.255.255/32", label: "Limited broadcast" },
];

const V6_RANGES: RangeInfo[] = [
  { cidr: "::/128", label: "Unspecified address" },
  { cidr: "::1/128", label: "Loopback" },
  { cidr: "::ffff:0:0/96", label: "IPv4-mapped (RFC 4291)" },
  { cidr: "64:ff9b::/96", label: "NAT64 well-known prefix (RFC 6052)" },
  { cidr: "100::/64", label: "Discard-only (RFC 6666)" },
  { cidr: "2001::/32", label: "Teredo (RFC 4380)" },
  { cidr: "2001:db8::/32", label: "Documentation (RFC 3849)" },
  { cidr: "2002::/16", label: "6to4 (RFC 3056)" },
  { cidr: "2000::/3", label: "Global unicast" },
  { cidr: "fc00::/7", label: "Unique local address (ULA, RFC 4193)" },
  { cidr: "fe80::/10", label: "Link-local unicast" },
  { cidr: "ff00::/8", label: "Multicast" },
];

function compileRanges(list: RangeInfo[]) {
  return list.map((r) => ({ ...r, c: parseCidrInput(r.cidr) }));
}

const V4_COMPILED = compileRanges(V4_RANGES);
const V6_COMPILED = compileRanges(V6_RANGES);

export function cidrContainsAddress(c: Cidr, value: bigint): boolean {
  return (value & prefixMask(c.version, c.prefix)) === networkOf(c);
}

/** Scope / type of an address (longest matching special-purpose range wins). */
export function classifyAddress(version: IpVersion, value: bigint): string {
  const table = version === 4 ? V4_COMPILED : V6_COMPILED;
  let best: { prefix: number; label: string } | null = null;
  for (const r of table) {
    if (cidrContainsAddress(r.c, value) && (best === null || r.c.prefix > best.prefix)) {
      best = { prefix: r.c.prefix, label: r.label };
    }
  }
  if (best) {
    return best.label;
  }
  return version === 4 ? "Public (globally routable)" : "Reserved / unassigned";
}

export function ipv4Class(value: bigint): string {
  const first = Number(value >> 24n);
  if (first < 128) return "A";
  if (first < 192) return "B";
  if (first < 224) return "C";
  if (first < 240) return "D (multicast)";
  return "E (reserved)";
}

export function reverseDns(version: IpVersion, value: bigint): string {
  if (version === 4) {
    return `${formatIPv4(value).split(".").reverse().join(".")}.in-addr.arpa`;
  }
  const nibbles = expandIPv6(value).replace(/:/g, "").split("").reverse();
  return `${nibbles.join(".")}.ip6.arpa`;
}

// ---------------------------------------------------------------- calculator

export interface BinaryGroup {
  network: string;
  host: string;
}

export interface SubnetInfo {
  version: IpVersion;
  address: string;
  prefix: number;
  cidr: string;
  network: string;
  /** IPv4 only */
  broadcast: string | null;
  netmask: string;
  wildcard: string;
  firstHost: string;
  lastHost: string;
  totalAddresses: bigint;
  usableHosts: bigint;
  hostBits: number;
  ipClass: string | null;
  type: string;
  reverseDns: string;
  /** IPv6 only */
  compressed: string | null;
  expanded: string | null;
  /** Set when an IPv6 address is IPv4-mapped (::ffff:a.b.c.d) */
  mappedIPv4: string | null;
  binary: BinaryGroup[];
  binarySeparator: string;
}

export function networkOf(c: Cidr): bigint {
  return c.address & prefixMask(c.version, c.prefix);
}

export function lastOf(c: Cidr): bigint {
  return networkOf(c) | hostMask(c.version, c.prefix);
}

function binaryGroups(c: Cidr): BinaryGroup[] {
  const bits = bitsOf(c.version);
  const size = c.version === 4 ? 8 : 16;
  const str = c.address.toString(2).padStart(bits, "0");
  const groups: BinaryGroup[] = [];
  for (let i = 0; i < bits; i += size) {
    const chunk = str.slice(i, i + size);
    const netLen = Math.max(0, Math.min(size, c.prefix - i));
    groups.push({ network: chunk.slice(0, netLen), host: chunk.slice(netLen) });
  }
  return groups;
}

export function calculate(c: Cidr): SubnetInfo {
  const { version, prefix } = c;
  const bits = bitsOf(version);
  const hostBits = bits - prefix;
  const net = networkOf(c);
  const last = lastOf(c);
  const fmt = (v: bigint) => formatAddress(version, v);
  const total = 1n << BigInt(hostBits);

  let first = net;
  let lastHost = last;
  let usable = total;
  if (version === 4 && prefix <= 30) {
    first = net + 1n;
    lastHost = last - 1n;
    usable = total - 2n;
  }
  // IPv4 /31 (RFC 3021) and /32: every address is usable.
  // IPv6: no broadcast; /127 (RFC 6164) and /128 included; all addresses usable.

  const mapped =
    version === 6 && c.address >> 32n === 0xffffn ? formatIPv4(c.address & 0xffffffffn) : null;

  return {
    version,
    address: fmt(c.address),
    prefix,
    cidr: `${fmt(net)}/${prefix}`,
    network: fmt(net),
    broadcast: version === 4 ? fmt(last) : null,
    netmask: fmt(prefixMask(version, prefix)),
    wildcard: fmt(hostMask(version, prefix)),
    firstHost: fmt(first),
    lastHost: fmt(lastHost),
    totalAddresses: total,
    usableHosts: usable,
    hostBits,
    ipClass: version === 4 ? ipv4Class(c.address) : null,
    type: classifyAddress(version, c.address),
    reverseDns: reverseDns(version, c.address),
    compressed: version === 6 ? formatIPv6(c.address) : null,
    expanded: version === 6 ? expandIPv6(c.address) : null,
    mappedIPv4: mapped,
    binary: binaryGroups(c),
    binarySeparator: version === 4 ? "." : ":",
  };
}

// ---------------------------------------------------------------- split

export interface SplitResult {
  subnets: string[];
  total: bigint;
  truncated: boolean;
  newPrefix: number;
}

export function splitByPrefix(c: Cidr, newPrefix: number, cap = MAX_SPLIT_ROWS): SplitResult {
  const bits = bitsOf(c.version);
  if (!Number.isInteger(newPrefix) || newPrefix < c.prefix || newPrefix > bits) {
    throw new IpError(`New prefix must be between /${c.prefix} and /${bits}`);
  }
  const count = 1n << BigInt(newPrefix - c.prefix);
  const step = 1n << BigInt(bits - newPrefix);
  const net = networkOf(c);
  const shown = count > BigInt(cap) ? cap : Number(count);
  const subnets: string[] = [];
  for (let i = 0; i < shown; i++) {
    subnets.push(`${formatAddress(c.version, net + step * BigInt(i))}/${newPrefix}`);
  }
  return { subnets, total: count, truncated: count > BigInt(cap), newPrefix };
}

export function splitByCount(c: Cidr, count: number, cap = MAX_SPLIT_ROWS): SplitResult {
  if (!Number.isInteger(count) || count < 1) {
    throw new IpError("Number of subnets must be a positive integer");
  }
  if ((count & (count - 1)) !== 0) {
    const lower = 2 ** Math.floor(Math.log2(count));
    throw new IpError(
      `${count} is not a power of two; equal-sized subnets need 2, 4, 8, ... (try ${lower} or ${lower * 2})`,
    );
  }
  const extra = Math.log2(count);
  const bits = bitsOf(c.version);
  if (c.prefix + extra > bits) {
    throw new IpError(`Cannot split /${c.prefix} into ${count} subnets: it would exceed /${bits}`);
  }
  return splitByPrefix(c, c.prefix + extra, cap);
}

// ---------------------------------------------------------------- contains / overlap

export type Relation = "equal" | "a-contains-b" | "b-contains-a" | "disjoint";

export function compareCidrs(a: Cidr, b: Cidr): Relation {
  if (a.version !== b.version) {
    throw new IpError("Cannot compare an IPv4 value with an IPv6 value");
  }
  const na = networkOf(a);
  const nb = networkOf(b);
  if (a.prefix === b.prefix) {
    return na === nb ? "equal" : "disjoint";
  }
  if (a.prefix < b.prefix) {
    return (nb & prefixMask(a.version, a.prefix)) === na ? "a-contains-b" : "disjoint";
  }
  return (na & prefixMask(b.version, b.prefix)) === nb ? "b-contains-a" : "disjoint";
}

function cidrLabel(c: Cidr): string {
  const isHost = c.prefix === bitsOf(c.version);
  const addr = formatAddress(c.version, isHost ? c.address : networkOf(c));
  return isHost ? addr : `${addr}/${c.prefix}`;
}

export function describeRelation(a: Cidr, b: Cidr): { relation: Relation; text: string } {
  const relation = compareCidrs(a, b);
  const sa = cidrLabel(a);
  const sb = cidrLabel(b);
  const text = {
    equal: `${sa} and ${sb} describe the same network.`,
    "a-contains-b": `${sa} contains ${sb}. They overlap.`,
    "b-contains-a": `${sb} contains ${sa}. They overlap.`,
    disjoint: `${sa} and ${sb} do not overlap.`,
  }[relation];
  return { relation, text };
}

// ---------------------------------------------------------------- range / aggregate

export function parseRange(input: string): { version: IpVersion; start: bigint; end: bigint } {
  const parts = input.split("-");
  if (parts.length !== 2) {
    throw new IpError(`Invalid range "${input.trim()}": use "start - end"`);
  }
  const a = parseAddress(parts[0]!);
  const b = parseAddress(parts[1]!);
  if (a.version !== b.version) {
    throw new IpError("Range start and end must be the same IP version");
  }
  if (a.value > b.value) {
    throw new IpError("Range start must not be greater than range end");
  }
  return { version: a.version, start: a.value, end: b.value };
}

function trailingZeros(n: bigint, max: number): number {
  if (n === 0n) return max;
  let tz = 0;
  while (((n >> BigInt(tz)) & 1n) === 0n) tz++;
  return tz;
}

/** Minimal list of CIDRs covering exactly [start, end]. At most ~2*bits iterations. */
export function rangeToCidrs(version: IpVersion, start: bigint, end: bigint): Cidr[] {
  const bits = bitsOf(version);
  if (start > end) {
    throw new IpError("Range start must not be greater than range end");
  }
  const out: Cidr[] = [];
  let cur = start;
  while (cur <= end) {
    const remaining = end - cur + 1n;
    const fit = remaining.toString(2).length - 1; // floor(log2(remaining))
    const hostBitsCount = Math.min(trailingZeros(cur, bits), fit);
    out.push({ version, address: cur, prefix: bits - hostBitsCount });
    cur += 1n << BigInt(hostBitsCount);
  }
  return out;
}

export function formatCidr(c: Cidr): string {
  return `${formatAddress(c.version, networkOf(c))}/${c.prefix}`;
}

export function rangeInputToCidrs(input: string): string[] {
  const { version, start, end } = parseRange(input);
  return rangeToCidrs(version, start, end).map(formatCidr);
}

export interface AggregateResult {
  inputCount: number;
  v4: string[];
  v6: string[];
  errors: string[];
}

/** Parse a pasted list of CIDRs / IPs / ranges, merge overlapping and adjacent ones, return minimal set. */
export function aggregate(text: string): AggregateResult {
  const tokens = text
    .split(/[\n,;]+/)
    .map((t) => t.trim())
    .filter((t) => t !== "" && !t.startsWith("#"));
  const errors: string[] = [];
  const intervals: Record<IpVersion, Array<[bigint, bigint]>> = { 4: [], 6: [] };
  let inputCount = 0;
  for (const tok of tokens) {
    try {
      if (tok.includes("-")) {
        const r = parseRange(tok);
        intervals[r.version].push([r.start, r.end]);
      } else {
        const c = parseCidrInput(tok);
        intervals[c.version].push([networkOf(c), lastOf(c)]);
      }
      inputCount++;
    } catch (e) {
      errors.push(`${tok}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const result: AggregateResult = { inputCount, v4: [], v6: [], errors };
  for (const version of [4, 6] as const) {
    const list = intervals[version].sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0));
    const merged: Array<[bigint, bigint]> = [];
    for (const [s, e] of list) {
      const last = merged[merged.length - 1];
      if (last && s <= last[1] + 1n) {
        if (e > last[1]) last[1] = e;
      } else {
        merged.push([s, e]);
      }
    }
    const target = version === 4 ? result.v4 : result.v6;
    for (const [s, e] of merged) {
      for (const c of rangeToCidrs(version, s, e)) {
        target.push(formatCidr(c));
      }
    }
  }
  return result;
}

/** Thousands separators for big numbers. */
export function formatBigInt(n: bigint): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
