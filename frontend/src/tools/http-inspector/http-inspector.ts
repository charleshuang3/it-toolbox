export const METHODS = ["GET", "HEAD", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"] as const;
export type Method = (typeof METHODS)[number];
export const MAX_BODY_BYTES = 64 * 1024;

export interface HeaderRow {
  name: string;
  value: string;
}

export interface Timings {
  dns_ms: number;
  connect_ms: number;
  tls_ms: number;
  ttfb_ms: number;
  transfer_ms: number;
  total_ms: number;
}

export interface TlsInfo {
  version: string;
  cipher_suite: string;
  server_name?: string;
  subject?: string;
  issuer?: string;
  not_after?: string;
  verified: boolean;
}

export interface Hop {
  url: string;
  method: string;
  status: number;
  status_text: string;
  protocol: string;
  headers: HeaderRow[];
  remote_ip?: string;
  location?: string;
  timings: Timings;
  tls?: TlsInfo;
}

export interface BodyInfo {
  content_type: string;
  preview: string;
  truncated: boolean;
  is_binary: boolean;
  size: number;
  size_capped: boolean;
}

export type SecurityStatus = "pass" | "warn" | "missing";

export interface SecurityItem {
  name: string;
  status: SecurityStatus;
  value?: string;
  message: string;
}

export interface CookieInfo {
  name: string;
  secure: boolean;
  http_only: boolean;
  same_site: string;
  hints: string[];
}

export interface ApiError {
  code: string;
  message: string;
}

export interface InspectResponse {
  url: string;
  method: string;
  insecure_skip_verify: boolean;
  warnings: string[];
  hops: Hop[];
  body?: BodyInfo;
  security?: { score: number; items: SecurityItem[] };
  cookies: CookieInfo[];
  total_ms: number;
  error?: ApiError;
}

export interface InspectRequest {
  url: string;
  method: Method;
  headers: Record<string, string>;
  body: string;
  follow_redirects: boolean;
  insecure_skip_verify: boolean;
  http_version: "auto" | "h1" | "h2";
}

/** Turn header rows into the object the API expects; blank names are dropped, later rows win. */
export function headersToObject(rows: HeaderRow[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of rows) {
    const name = r.name.trim();
    if (name) out[name] = r.value;
  }
  return out;
}

/** Add https:// when the user typed a bare host. */
export function normalizeUrl(input: string): string {
  const s = input.trim();
  if (!s) return "";
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`;
}

/** Returns an error message, or "" when the form is valid. */
export function validateForm(url: string, body: string): string {
  if (!url.trim()) return "Enter a URL.";
  try {
    const u = new URL(normalizeUrl(url));
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      return "Only http:// and https:// URLs are supported.";
    }
  } catch {
    return "The URL is not valid.";
  }
  if (new TextEncoder().encode(body).length > MAX_BODY_BYTES) {
    return "The body is larger than 64 KB.";
  }
  return "";
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function formatMs(ms: number): string {
  if (ms < 1) return "<1 ms";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function statusClass(status: number): "success" | "info" | "warning" | "error" {
  if (status >= 500 || status < 100) return "error";
  if (status >= 400) return "warning";
  if (status >= 300) return "info";
  return "success";
}

export interface WaterfallSegment {
  key: "dns" | "connect" | "tls" | "ttfb" | "transfer";
  label: string;
  ms: number;
  /** Left offset and width as percentages of the scale. */
  left: number;
  width: number;
}

const PHASES: { key: WaterfallSegment["key"]; label: string; field: keyof Timings }[] = [
  { key: "dns", label: "DNS", field: "dns_ms" },
  { key: "connect", label: "TCP connect", field: "connect_ms" },
  { key: "tls", label: "TLS handshake", field: "tls_ms" },
  { key: "ttfb", label: "Time to first byte", field: "ttfb_ms" },
  { key: "transfer", label: "Content transfer", field: "transfer_ms" },
];

function phaseSum(t: Timings): number {
  return PHASES.reduce((a, p) => a + Math.max(0, t[p.field]), 0);
}

/** Lay out sequential phases for one hop on a shared scale (maxMs, default: the hop's own sum). */
export function waterfall(t: Timings, maxMs?: number): WaterfallSegment[] {
  const scale = Math.max(maxMs ?? 0, phaseSum(t), 0.001);
  let offset = 0;
  const out: WaterfallSegment[] = [];
  for (const p of PHASES) {
    const ms = Math.max(0, t[p.field]);
    out.push({
      key: p.key,
      label: p.label,
      ms,
      left: (offset / scale) * 100,
      width: (ms / scale) * 100,
    });
    offset += ms;
  }
  return out;
}

/** Largest summed phase time across hops, for a common waterfall scale. */
export function waterfallScale(hops: Hop[]): number {
  return hops.reduce((m, h) => Math.max(m, phaseSum(h.timings)), 0);
}

export function scoreGrade(score: number): { grade: string; cls: "success" | "warning" | "error" } {
  if (score >= 80) return { grade: "A", cls: "success" };
  if (score >= 60) return { grade: "B", cls: "success" };
  if (score >= 40) return { grade: "C", cls: "warning" };
  return { grade: "D", cls: "error" };
}

/** Map an HTTP failure from the API (or the network layer) to a friendly message. */
export function friendlyError(
  status: number,
  err?: Partial<ApiError> | null,
  retryAfter?: string | null,
): string {
  switch (status) {
    case 429:
      return `Too many requests. Please wait${retryAfter ? ` ${retryAfter} seconds` : " a moment"} and try again.`;
    case 503:
      return "The server is busy with other inspections right now. Try again in a few seconds.";
    case 403:
      return (
        err?.message ||
        "This target is blocked: private and internal addresses cannot be inspected."
      );
    case 504:
      return "The request timed out before the target finished responding.";
  }
  if (err?.message) return err.message;
  return `Request failed (HTTP ${status}).`;
}

export function errorTitle(code: string | undefined): string {
  switch (code) {
    case "blocked_target":
      return "Target blocked";
    case "timeout":
      return "Timed out";
    case "tls_error":
      return "TLS error";
    case "dns_error":
      return "DNS error";
    default:
      return "Request failed";
  }
}
