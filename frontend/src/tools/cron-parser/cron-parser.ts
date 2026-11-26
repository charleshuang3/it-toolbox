import cronstrue from "cronstrue";
import { CronExpressionParser } from "cron-parser";

export const MAX_RUNS = 50;

export interface CronRun {
  /** Epoch milliseconds. */
  ms: number;
  /** Formatted in the selected time zone. */
  formatted: string;
}

export interface CronResult {
  error: string;
  description: string;
  fieldCount: number;
  runs: CronRun[];
}

const MACROS: Record<string, string> = {
  "@yearly": "0 0 1 1 *",
  "@annually": "0 0 1 1 *",
  "@monthly": "0 0 1 * *",
  "@weekly": "0 0 * * 0",
  "@daily": "0 0 * * *",
  "@hourly": "0 * * * *",
};

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function formatInZone(ms: number, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZoneName: "short",
  }).format(ms);
}

export function listTimeZones(): string[] {
  const zones =
    typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  return zones.includes("UTC") ? zones : ["UTC", ...zones];
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Parse a 5-field (minute-first) or 6-field (seconds-first) cron expression, describe it
 * and compute the next `count` run times in `tz`.
 */
export function parseCron(
  expression: string,
  tz: string,
  count = 10,
  from: Date = new Date(),
): CronResult {
  const expr = expression.trim().replace(/\s+/g, " ");
  const fieldCount = expr ? expr.split(" ").length : 0;
  const fail = (error: string): CronResult => ({ error, description: "", fieldCount, runs: [] });
  if (!expr) return fail("");
  const macro = expr.startsWith("@") ? MACROS[expr.toLowerCase()] : undefined;
  if (expr.startsWith("@") && !macro) return fail(`Unsupported macro: ${expr}`);
  if (!macro && fieldCount !== 5 && fieldCount !== 6) {
    return fail(
      `Expected 5 fields (minute hour day-of-month month day-of-week) or 6 fields with a leading seconds field, got ${fieldCount}.`,
    );
  }
  if (!isValidTimeZone(tz)) return fail(`Unknown time zone: ${tz}`);
  const n = Math.max(1, Math.min(MAX_RUNS, Math.floor(count) || 1));

  let description: string;
  try {
    description = cronstrue.toString(macro ?? expr, {
      throwExceptionOnParseError: true,
      use24HourTimeFormat: true,
    });
  } catch (e) {
    return fail(errMsg(e));
  }

  try {
    const it = CronExpressionParser.parse(macro ?? expr, { currentDate: from, tz });
    const runs: CronRun[] = [];
    for (let i = 0; i < n && it.hasNext(); i++) {
      const ms = it.next().getTime();
      runs.push({ ms, formatted: formatInZone(ms, tz) });
    }
    return { error: "", description, fieldCount, runs };
  } catch (e) {
    return fail(errMsg(e));
  }
}
