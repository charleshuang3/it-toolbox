export interface Base64Options {
  urlSafe?: boolean;
  /** Keep "=" padding (default true). */
  padding?: boolean;
}

export function bytesToBase64(bytes: Uint8Array, opts: Base64Options = {}): string {
  const { urlSafe = false, padding = true } = opts;
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  let out = btoa(binary);
  if (urlSafe) out = out.replace(/\+/g, "-").replace(/\//g, "_");
  if (!padding) out = out.replace(/=+$/, "");
  return out;
}

/** Decodes standard or url-safe base64 (padding optional, whitespace ignored). Throws on invalid input. */
export function base64ToBytes(input: string): Uint8Array {
  let s = input.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/_-]*={0,2}$/.test(s)) {
    throw new Error("Invalid Base64: contains characters outside the Base64 alphabet");
  }
  s = s.replace(/=+$/, "").replace(/-/g, "+").replace(/_/g, "/");
  if (s.length % 4 === 1) {
    throw new Error("Invalid Base64: incorrect length");
  }
  s += "=".repeat((4 - (s.length % 4)) % 4);
  const binary = atob(s);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function encodeText(text: string, opts: Base64Options = {}): string {
  return bytesToBase64(new TextEncoder().encode(text), opts);
}

/** Decodes to UTF-8 text. Throws if input is not valid Base64 or not valid UTF-8. */
export function decodeText(input: string): string {
  const bytes = base64ToBytes(input);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("Decoded data is not valid UTF-8 text (use Base64 to file instead)");
  }
}

/** Strips an optional data URI prefix, returning the base64 payload. */
export function stripDataUri(input: string): string {
  const m = /^\s*data:[^,]*;base64,/i.exec(input);
  return m ? input.slice(m[0].length) : input;
}
