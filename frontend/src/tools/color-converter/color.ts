import {
  parse,
  formatHex,
  formatHex8,
  formatRgb,
  formatHsl,
  converter,
  wcagContrast,
} from "culori";

const toHwb = converter("hwb");
const toOklch = converter("oklch");

export interface ColorFormats {
  hex: string;
  rgb: string;
  hsl: string;
  hwb: string;
  oklch: string;
}

function round(n: number | undefined, digits = 0): number {
  const f = 10 ** digits;
  return Math.round((n ?? 0) * f) / f;
}

/** Parse any CSS color string. Returns undefined when invalid. */
export function parseColor(input: string) {
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  return parse(trimmed);
}

export function getFormats(input: string): ColorFormats | null {
  const color = parseColor(input);
  if (!color) return null;
  const alpha = color.alpha ?? 1;
  const a = alpha < 1 ? ` / ${round(alpha, 3)}` : "";

  const hwb = toHwb(color);
  const oklch = toOklch(color);

  return {
    hex: alpha < 1 ? formatHex8(color) : formatHex(color),
    rgb: formatRgb(color),
    hsl: formatHsl(color),
    hwb: `hwb(${round(hwb.h)} ${round(hwb.w * 100)}% ${round(hwb.b * 100)}%${a})`,
    oklch: `oklch(${round(oklch.l * 100, 2)}% ${round(oklch.c, 4)} ${round(oklch.h, 2)}${a})`,
  };
}

/** Returns "#rrggbb" for use with <input type="color">, or null. */
export function toPickerHex(input: string): string | null {
  const color = parseColor(input);
  return color ? formatHex(color) : null;
}

export function contrastRatio(a: string, b: string): number | null {
  const ca = parseColor(a);
  const cb = parseColor(b);
  if (!ca || !cb) return null;
  return wcagContrast(ca, cb);
}

export interface WcagResult {
  ratio: number;
  aaNormal: boolean;
  aaLarge: boolean;
  aaaNormal: boolean;
  aaaLarge: boolean;
}

export function wcagResult(a: string, b: string): WcagResult | null {
  const ratio = contrastRatio(a, b);
  if (ratio === null) return null;
  return {
    ratio: Math.round(ratio * 100) / 100,
    aaNormal: ratio >= 4.5,
    aaLarge: ratio >= 3,
    aaaNormal: ratio >= 7,
    aaaLarge: ratio >= 4.5,
  };
}
