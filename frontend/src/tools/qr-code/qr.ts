import QRCode from "qrcode";

export type ErrorCorrection = "L" | "M" | "Q" | "H";

export const MIN_SIZE = 64;
export const MAX_SIZE = 2048;

export interface QrOptions {
  text: string;
  errorCorrection: ErrorCorrection;
  size: number;
  foreground: string;
  background: string;
}

const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export function isValidHexColor(value: string): boolean {
  return HEX_RE.test(value);
}

export function clampSize(size: number): number {
  if (!Number.isFinite(size)) return 256;
  return Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(size)));
}

function toQrOptions(opts: QrOptions) {
  if (!isValidHexColor(opts.foreground) || !isValidHexColor(opts.background)) {
    throw new Error("Colors must be hex values like #000000");
  }
  return {
    errorCorrectionLevel: opts.errorCorrection,
    width: clampSize(opts.size),
    margin: 2,
    color: { dark: opts.foreground, light: opts.background },
  };
}

export async function generateSvg(opts: QrOptions): Promise<string> {
  if (!opts.text) throw new Error("Text is empty");
  return QRCode.toString(opts.text, { ...toQrOptions(opts), type: "svg" });
}

export async function generatePngDataUrl(opts: QrOptions): Promise<string> {
  if (!opts.text) throw new Error("Text is empty");
  return QRCode.toDataURL(opts.text, { ...toQrOptions(opts), type: "image/png" });
}

/** Decode a QR code from image data. Returns null when none is found. */
export async function decodeQr(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): Promise<string | null> {
  const { default: jsQR } = await import("jsqr");
  const result = jsQR(data, width, height, { inversionAttempts: "attemptBoth" });
  return result ? result.data : null;
}
