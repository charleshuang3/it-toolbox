export type EncodeMode = "component" | "uri";

export function encodeUrl(input: string, mode: EncodeMode): string {
  return mode === "component" ? encodeURIComponent(input) : encodeURI(input);
}

/** Throws a readable Error on malformed escape sequences. */
export function decodeUrl(input: string, mode: EncodeMode): string {
  try {
    return mode === "component" ? decodeURIComponent(input) : decodeURI(input);
  } catch {
    throw new Error("Malformed URL encoding: invalid percent-escape sequence");
  }
}

export interface QueryParam {
  key: string;
  value: string;
}

export interface ParsedUrl {
  protocol: string;
  username: string;
  password: string;
  hostname: string;
  port: string;
  pathname: string;
  hash: string;
  params: QueryParam[];
}

/** Throws if the URL is invalid. */
export function parseUrl(input: string): ParsedUrl {
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    throw new Error("Invalid URL: include a scheme, e.g. https://example.com/path");
  }
  return {
    protocol: u.protocol,
    username: decodeSafe(u.username),
    password: decodeSafe(u.password),
    hostname: u.hostname,
    port: u.port,
    pathname: u.pathname,
    hash: u.hash,
    params: Array.from(u.searchParams.entries()).map(([key, value]) => ({ key, value })),
  };
}

function decodeSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Rebuilds a URL string from parts. Throws if the result is invalid. */
export function buildUrl(p: ParsedUrl): string {
  const u = new URL(`${p.protocol.replace(/:?$/, ":")}//${p.hostname}`);
  u.username = p.username;
  u.password = p.password;
  u.port = p.port;
  u.pathname = p.pathname;
  const sp = new URLSearchParams();
  for (const { key, value } of p.params) {
    if (key !== "" || value !== "") sp.append(key, value);
  }
  u.search = sp.toString();
  u.hash = p.hash;
  return u.toString();
}
