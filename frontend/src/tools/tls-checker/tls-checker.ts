export interface TlsReason {
  code: string;
  message: string;
}

export interface TlsCert {
  subject: string;
  issuer: string;
  serial: string;
  not_before: string;
  not_after: string;
  days_remaining: number;
  dns_names: string[];
  ip_addresses: string[];
  key_algorithm: string;
  key_size?: number;
  curve?: string;
  signature_algorithm: string;
  sha256: string;
  is_ca: boolean;
  self_signed: boolean;
  key_usage: string[];
  ext_key_usage: string[];
  pem: string;
}

export interface TlsProbe {
  version: string;
  supported: boolean;
  cipher_suite?: string;
  error?: string;
}

export interface TlsResult {
  host: string;
  port: number;
  sni: string;
  verdict: { valid: boolean; reasons: TlsReason[] };
  connection: {
    version: string;
    cipher_suite: string;
    alpn: string;
    server_name: string;
    address: string;
    handshake_ms: number;
    ocsp_stapled: boolean;
    ocsp_bytes: number;
    sct_count: number;
  };
  chain: TlsCert[];
  probes?: TlsProbe[];
}

export interface Target {
  host: string;
  port: number;
}

export const DEFAULT_PORT = 443;
export const EXPIRY_WARNING_DAYS = 30;

/**
 * Parses "host", "host:port", "[::1]:8443" or a pasted URL such as
 * "https://user@example.com:8443/path?x" into host and port.
 */
export function parseTarget(input: string): Target | null {
  let s = input.trim();
  if (!s) return null;
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
  s = s.split(/[/?#]/)[0] ?? "";
  const at = s.lastIndexOf("@");
  if (at >= 0) s = s.slice(at + 1);
  if (!s) return null;

  let host = s;
  let portStr = "";
  if (s.startsWith("[")) {
    const end = s.indexOf("]");
    if (end < 0) return null;
    host = s.slice(1, end);
    const rest = s.slice(end + 1);
    if (rest) {
      if (!rest.startsWith(":")) return null;
      portStr = rest.slice(1);
    }
  } else if ((s.match(/:/g) ?? []).length === 1) {
    const i = s.indexOf(":");
    host = s.slice(0, i);
    portStr = s.slice(i + 1);
  }
  host = host.replace(/\.$/, "");
  if (!host) return null;

  let port = DEFAULT_PORT;
  if (portStr) {
    if (!/^\d+$/.test(portStr)) return null;
    port = Number(portStr);
    if (port < 1 || port > 65535) return null;
  }
  return { host, port };
}

export type VerdictLevel = "ok" | "warning" | "error";

export interface VerdictView {
  level: VerdictLevel;
  title: string;
  details: string[];
}

export function describeDays(days: number): string {
  if (days < 0) {
    const n = -days;
    return `expired ${n} day${n === 1 ? "" : "s"} ago`;
  }
  if (days === 0) return "expires today";
  return `${days} day${days === 1 ? "" : "s"} remaining`;
}

export function reasonTitle(code: string): string {
  switch (code) {
    case "expired":
      return "expired";
    case "not_yet_valid":
      return "not yet valid";
    case "hostname_mismatch":
      return "hostname mismatch";
    case "self_signed":
      return "self-signed";
    case "unknown_authority":
      return "unknown authority";
    case "incomplete_chain":
      return "incomplete chain";
    case "no_certificate":
      return "no certificate";
    default:
      return "chain verification failed";
  }
}

/** Turns the backend verdict into a banner: valid, expiring soon, or invalid with reasons. */
export function verdictView(r: TlsResult): VerdictView {
  if (!r.verdict.valid) {
    const reasons = r.verdict.reasons;
    return {
      level: "error",
      title: `Invalid certificate: ${reasons.length ? reasonTitle(reasons[0]!.code) : "unknown problem"}`,
      details: reasons.map((x) => x.message),
    };
  }
  const days = r.chain[0]?.days_remaining ?? 0;
  if (days <= EXPIRY_WARNING_DAYS) {
    return {
      level: "warning",
      title: `Valid, but expires in ${days} day${days === 1 ? "" : "s"}`,
      details: [],
    };
  }
  return { level: "ok", title: `Valid, expires in ${days} days`, details: [] };
}

export function keyDescription(c: TlsCert): string {
  if (c.curve) return `${c.key_algorithm} ${c.curve}`;
  return c.key_size ? `${c.key_algorithm} ${c.key_size}-bit` : c.key_algorithm;
}

/** Maps an HTTP failure to a message a user can act on. */
export function friendlyError(status: number, serverMessage?: string): string {
  switch (status) {
    case 429:
      return "Too many requests. Please wait a moment and try again.";
    case 503:
      return "The server is busy with other checks. Please try again shortly.";
    case 403:
      return "This target is not allowed (private, loopback or reserved addresses are blocked).";
    case 504:
      return "The connection timed out. The host may be down or filtering this port.";
    case 400:
      return serverMessage || "Invalid request.";
    case 502:
      if (serverMessage?.includes("refused")) {
        return "Connection refused. Nothing is listening on that port.";
      }
      return serverMessage || "Could not connect to the target.";
    default:
      return serverMessage || `Unexpected error (HTTP ${status}).`;
  }
}
