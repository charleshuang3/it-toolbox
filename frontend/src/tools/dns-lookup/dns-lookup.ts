export const RECORD_TYPES = [
  "A",
  "AAAA",
  "CNAME",
  "MX",
  "TXT",
  "NS",
  "SOA",
  "CAA",
  "SRV",
  "PTR",
] as const;
export type RecordType = (typeof RECORD_TYPES)[number];

export const MAX_RESOLVERS = 5;

export const NAMED_RESOLVERS = [
  { id: "system", label: "System", hint: "Server's own resolver" },
  { id: "cloudflare", label: "Cloudflare", hint: "1.1.1.1" },
  { id: "google", label: "Google", hint: "8.8.8.8" },
  { id: "quad9", label: "Quad9", hint: "9.9.9.9" },
] as const;

export interface DnsRequest {
  name: string;
  type: string;
  resolvers: string[];
}

export interface DnsRecord {
  name: string;
  type: string;
  ttl: number;
  data: Record<string, unknown>;
  display: string;
}

export interface DnsResolverResult {
  resolver: string;
  address?: string;
  rcode?: string;
  authoritative: boolean;
  truncated: boolean;
  usedTcp: boolean;
  answers: DnsRecord[];
  queryTimeMs: number;
  error?: string;
  blocked?: boolean;
}

export interface DnsResponse {
  name: string;
  type: string;
  results: DnsResolverResult[];
}

export class DnsApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "DnsApiError";
    this.status = status;
  }
}

/** Turn an HTTP failure into a message suitable for showing to the user. */
export function friendlyHttpError(status: number, serverMessage?: string): string {
  switch (status) {
    case 429:
      return "Too many requests. Please wait a moment and try again.";
    case 503:
      return "The server is busy with other lookups. Please try again in a few seconds.";
    case 400:
      return serverMessage || "The request was rejected as invalid.";
    default:
      return serverMessage || `Request failed with HTTP ${status}.`;
  }
}

export async function lookupDns(
  req: DnsRequest,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<DnsResponse> {
  let res: Response;
  try {
    res = await fetchImpl("/api/net/dns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
      signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new DnsApiError("Could not reach the server.", 0);
  }
  if (!res.ok) {
    let msg: string | undefined;
    try {
      msg = ((await res.json()) as { error?: string }).error;
    } catch {
      // body was not JSON
    }
    throw new DnsApiError(friendlyHttpError(res.status, msg), res.status);
  }
  return (await res.json()) as DnsResponse;
}

const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;

function portOk(p: string | undefined): boolean {
  if (p === undefined) return true;
  const n = Number(p);
  return Number.isInteger(n) && n >= 1 && n <= 65535;
}

/** Light client-side check of a custom resolver (`ip` or `ip:port`, `[v6]:port`). The server is authoritative. */
export function isValidCustomResolver(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  const bracket = /^\[([0-9a-fA-F:.]+)\](?::(\d{1,5}))?$/.exec(v);
  if (bracket) return portOk(bracket[2]);
  if (v.split(":").length > 2) return /^[0-9a-fA-F:.]+$/.test(v);
  const [host = "", port] = v.split(":");
  if (!IPV4.test(host)) return false;
  if (host.split(".").some((o) => Number(o) > 255)) return false;
  return portOk(port);
}

export type RecordStatus = "common" | "unique";

export interface AnnotatedRecord extends DnsRecord {
  status: RecordStatus;
}

export interface AnnotatedResult extends DnsResolverResult {
  records: AnnotatedRecord[];
}

export interface DnsComparison {
  results: AnnotatedResult[];
  /** True when the resolvers that answered do not all agree. */
  disagree: boolean;
  /** True when the rcodes differ among resolvers that answered. */
  rcodeDiffers: boolean;
}

/** Identity of a record for comparison: TTL is ignored because caches legitimately differ. */
export function recordKey(r: DnsRecord): string {
  return `${r.name.toLowerCase()}|${r.type}|${r.display}`;
}

/**
 * Compare answers across resolvers. A record is "common" when every resolver
 * that responded (no error) returned it, otherwise "unique". Resolvers with
 * errors are ignored for the comparison.
 */
export function compareAnswers(results: DnsResolverResult[]): DnsComparison {
  const ok = results.filter((r) => !r.error);
  const keySets = ok.map((r) => new Set(r.answers.map(recordKey)));
  const everywhere = (key: string) => keySets.every((s) => s.has(key));

  const annotated: AnnotatedResult[] = results.map((r) => ({
    ...r,
    records: r.answers.map((a) => ({
      ...a,
      status: r.error || ok.length < 2 || everywhere(recordKey(a)) ? "common" : "unique",
    })),
  }));

  const union = new Set<string>();
  keySets.forEach((s) => s.forEach((k) => union.add(k)));
  const missingSomewhere = [...union].some((k) => !everywhere(k));
  const rcodeDiffers = new Set(ok.map((r) => r.rcode)).size > 1;

  return {
    results: annotated,
    disagree: ok.length > 1 && (missingSomewhere || rcodeDiffers),
    rcodeDiffers,
  };
}

export function formatTtl(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const parts: string[] = [];
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (s && !d) parts.push(`${s}s`);
  return parts.join(" ");
}

export function describeRcode(rcode: string | undefined): string {
  switch (rcode) {
    case "NOERROR":
      return "OK";
    case "NXDOMAIN":
      return "Name does not exist";
    case "SERVFAIL":
      return "Server failure";
    case "REFUSED":
      return "Query refused";
    case "FORMERR":
      return "Malformed query";
    case "NOTIMP":
      return "Not implemented";
    default:
      return rcode ?? "";
  }
}
