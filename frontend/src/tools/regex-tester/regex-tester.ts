export const MAX_MATCHES = 1000;
export const MAX_TEXT_LENGTH = 200_000;

export interface MatchGroup {
  index: number;
  name?: string;
  value: string | undefined;
}

export interface RegexMatch {
  index: number;
  end: number;
  text: string;
  groups: MatchGroup[];
}

export interface RegexRequest {
  pattern: string;
  flags: string;
  text: string;
  replacement?: string;
}

export interface RegexResult {
  error: string;
  matches: RegexMatch[];
  truncated: boolean;
  replaced: string | null;
}

export function normalizeFlags(flags: string): string {
  return Array.from(new Set(flags.split(""))).join("");
}

/** Map capture group index -> name by scanning the pattern source. */
export function groupNameMap(pattern: string): Map<number, string> {
  const map = new Map<number, string>();
  let idx = 0;
  let inClass = false;
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "\\") {
      i++;
      continue;
    }
    if (inClass) {
      if (c === "]") inClass = false;
      continue;
    }
    if (c === "[") {
      inClass = true;
      continue;
    }
    if (c !== "(") continue;
    if (pattern[i + 1] !== "?") {
      idx++;
      continue;
    }
    if (pattern[i + 2] === "<" && pattern[i + 3] !== "=" && pattern[i + 3] !== "!") {
      idx++;
      const end = pattern.indexOf(">", i + 3);
      if (end > 0) map.set(idx, pattern.slice(i + 3, end));
    }
  }
  return map;
}

/** Run a regex against text. Synchronous; never throws. */
export function runRegex(req: RegexRequest): RegexResult {
  const empty: RegexResult = { error: "", matches: [], truncated: false, replaced: null };
  if (req.pattern === "") return empty;
  if (req.text.length > MAX_TEXT_LENGTH) {
    return { ...empty, error: `Text is too long (max ${MAX_TEXT_LENGTH} characters)` };
  }
  const flags = normalizeFlags(req.flags);
  const global = flags.includes("g");
  let re: RegExp;
  try {
    re = new RegExp(req.pattern, global ? flags : flags + "g");
  } catch (e) {
    return { ...empty, error: e instanceof Error ? e.message : String(e) };
  }

  const names = groupNameMap(req.pattern);
  const matches: RegexMatch[] = [];
  let truncated = false;
  let m: RegExpExecArray | null;
  while ((m = re.exec(req.text)) !== null) {
    if (matches.length >= MAX_MATCHES) {
      truncated = true;
      break;
    }
    const groups: MatchGroup[] = [];
    for (let i = 1; i < m.length; i++) {
      const name = names.get(i);
      groups.push(name ? { index: i, name, value: m[i] } : { index: i, value: m[i] });
    }
    matches.push({ index: m.index, end: m.index + m[0].length, text: m[0], groups });
    if (m[0] === "") re.lastIndex++;
    if (!global) break;
  }

  let replaced: string | null = null;
  if (req.replacement !== undefined) {
    replaced = req.text.replace(new RegExp(req.pattern, flags), req.replacement);
  }
  return { error: "", matches, truncated, replaced };
}

export interface Segment {
  text: string;
  matchIndex: number | null;
}

/** Split text into alternating plain / matched segments for highlighting. */
export function toSegments(text: string, matches: RegexMatch[]): Segment[] {
  const segs: Segment[] = [];
  let pos = 0;
  matches.forEach((m, i) => {
    if (m.end <= m.index || m.index < pos) return;
    if (m.index > pos) segs.push({ text: text.slice(pos, m.index), matchIndex: null });
    segs.push({ text: text.slice(m.index, m.end), matchIndex: i });
    pos = m.end;
  });
  if (pos < text.length) segs.push({ text: text.slice(pos), matchIndex: null });
  return segs;
}
