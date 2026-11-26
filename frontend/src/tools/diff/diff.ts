import { diffLines, diffWords, diffWordsWithSpace } from "diff";

export type DiffMode = "line" | "word" | "json";
export type PartType = "same" | "add" | "del";

export interface DiffPart {
  text: string;
  type: PartType;
}

export interface DiffOptions {
  mode: DiffMode;
  ignoreWhitespace?: boolean;
}

export interface DiffResult {
  error: string;
  parts: DiffPart[];
  /** Whether parts are line-based (each part consists of whole lines). */
  lineBased: boolean;
  added: number;
  removed: number;
  identical: boolean;
}

export function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      out[k] = sortKeysDeep((value as Record<string, unknown>)[k]);
    }
    return out;
  }
  return value;
}

/** Parse JSON and re-serialize with sorted keys and 2-space indent. Throws on invalid JSON. */
export function normalizeJson(input: string): string {
  return JSON.stringify(sortKeysDeep(JSON.parse(input)), null, 2);
}

export function computeDiff(left: string, right: string, opts: DiffOptions): DiffResult {
  let a = left;
  let b = right;
  if (opts.mode === "json") {
    try {
      a = left.trim() === "" ? "" : normalizeJson(left);
    } catch (e) {
      return fail(`Left side is not valid JSON: ${msg(e)}`);
    }
    try {
      b = right.trim() === "" ? "" : normalizeJson(right);
    } catch (e) {
      return fail(`Right side is not valid JSON: ${msg(e)}`);
    }
  }

  const lineBased = opts.mode !== "word";
  const changes = lineBased
    ? diffLines(a, b, { ignoreWhitespace: opts.ignoreWhitespace })
    : opts.ignoreWhitespace
      ? diffWords(a, b)
      : diffWordsWithSpace(a, b);

  const parts: DiffPart[] = changes.map((c) => ({
    text: c.value,
    type: c.added ? "add" : c.removed ? "del" : "same",
  }));
  let added = 0;
  let removed = 0;
  for (const c of changes) {
    if (c.added) added += c.count ?? 0;
    else if (c.removed) removed += c.count ?? 0;
  }
  return {
    error: "",
    parts,
    lineBased,
    added,
    removed,
    identical: parts.every((p) => p.type === "same"),
  };
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function fail(error: string): DiffResult {
  return { error, parts: [], lineBased: true, added: 0, removed: 0, identical: false };
}

export interface Row {
  left: { no: number; text: string; type: "same" | "del" } | null;
  right: { no: number; text: string; type: "same" | "add" } | null;
}

function splitLines(text: string): string[] {
  const lines = text.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/** Build aligned side-by-side rows from line-based diff parts. */
export function buildRows(parts: DiffPart[]): Row[] {
  const rows: Row[] = [];
  let l = 0;
  let r = 0;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]!;
    if (p.type === "same") {
      for (const t of splitLines(p.text)) {
        rows.push({
          left: { no: ++l, text: t, type: "same" },
          right: { no: ++r, text: t, type: "same" },
        });
      }
    } else if (p.type === "del") {
      const next = parts[i + 1];
      const dels = splitLines(p.text);
      const adds = next && next.type === "add" ? splitLines(next.text) : [];
      if (adds.length) i++;
      const n = Math.max(dels.length, adds.length);
      for (let k = 0; k < n; k++) {
        rows.push({
          left: k < dels.length ? { no: ++l, text: dels[k]!, type: "del" } : null,
          right: k < adds.length ? { no: ++r, text: adds[k]!, type: "add" } : null,
        });
      }
    } else {
      for (const t of splitLines(p.text)) {
        rows.push({ left: null, right: { no: ++r, text: t, type: "add" } });
      }
    }
  }
  return rows;
}

/** For word mode side-by-side: left pane = same+del, right pane = same+add. */
export function splitPanes(parts: DiffPart[]): { left: DiffPart[]; right: DiffPart[] } {
  return {
    left: parts.filter((p) => p.type !== "add"),
    right: parts.filter((p) => p.type !== "del"),
  };
}
