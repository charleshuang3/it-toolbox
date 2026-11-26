import * as he from "he";

export interface EncodeOptions {
  /** Also encode every non-ASCII character (default: only & < > " '). */
  nonAscii?: boolean;
  /** Use named references (&eacute;) for non-ASCII instead of numeric. */
  named?: boolean;
  /** Use hexadecimal numeric references instead of decimal. */
  hex?: boolean;
}

/** Encodes only the characters significant in HTML: & < > " ' */
export function escapeHtml(input: string): string {
  return he.escape(input).replace(/'/g, "&#x27;");
}

export function encode(input: string, opts: EncodeOptions = {}): string {
  if (!opts.nonAscii) return escapeHtml(input);
  return he.encode(input, { useNamedReferences: !!opts.named, decimal: !opts.hex });
}

export function decode(input: string): string {
  return he.decode(input);
}
