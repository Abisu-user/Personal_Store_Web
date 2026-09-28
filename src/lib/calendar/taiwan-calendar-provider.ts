import "server-only";

import snapshot2026 from "./snapshots/2026.json";
import snapshot2027 from "./snapshots/2027.json";
import { buildCalendarDays, discoverOfficialCsvUrl, parseOfficialCsv, validateOfficialRows, type OfficialRow } from "./taiwan-calendar-core";

const DATASET_URL = "https://data.gov.tw/dataset/14718";
const REVALIDATE_SECONDS = 86_400;
const bundled = new Map<number, OfficialRow[]>([
  [2026, snapshot2026 as OfficialRow[]],
  [2027, snapshot2027 as OfficialRow[]],
]);
const memory = new Map<number, { rows: OfficialRow[] | null; expiresAt: number }>();
const pending = new Map<number, Promise<OfficialRow[] | null>>();

// Bundled, validated DGPA years must be available immediately, including the
// next year. A slow catalogue request must not make a published year appear
// empty on the first render.
for (const [year, rows] of bundled) {
  validateOfficialRows(rows, year);
  memory.set(year, { rows, expiresAt: Number.POSITIVE_INFINITY });
}

async function downloadYear(year: number): Promise<OfficialRow[] | null> {
  const catalogue = await fetch(DATASET_URL, { next: { revalidate: REVALIDATE_SECONDS }, signal: AbortSignal.timeout(8000) });
  if (!catalogue.ok) throw new Error("DGPA dataset catalogue unavailable");
  const csvUrl = discoverOfficialCsvUrl(await catalogue.text(), year);
  if (!csvUrl) return null;
  const response = await fetch(csvUrl, { next: { revalidate: REVALIDATE_SECONDS }, signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error("DGPA CSV unavailable");
  return parseOfficialCsv(await response.text(), year);
}

async function loadYear(year: number): Promise<OfficialRow[] | null> {
  const cached = memory.get(year);
  if (cached && cached.expiresAt > Date.now()) return cached.rows;
  const existing = pending.get(year);
  if (existing) return existing;
  const promise = (async () => {
    try {
      const rows = await downloadYear(year);
      const resolved = rows ?? bundled.get(year) ?? null;
      memory.set(year, { rows: resolved, expiresAt: Date.now() + REVALIDATE_SECONDS * 1000 });
      return resolved;
    } catch (error) {
      console.warn("[calendar] Official calendar unavailable; using last successful year or bundled snapshot", { year, error });
      const fallback = cached?.rows ?? bundled.get(year) ?? null;
      memory.set(year, { rows: fallback, expiresAt: Date.now() + 60 * 60 * 1000 });
      return fallback;
    } finally {
      pending.delete(year);
    }
  })();
  pending.set(year, promise);
  return promise;
}

export async function getTaiwanCalendarDays(from: string, to: string) {
  const first = new Date(from + "T12:00:00Z");
  const last = new Date(to + "T12:00:00Z");
  // Resolve weekends touching a holiday just outside the requested range.
  first.setUTCDate(first.getUTCDate() - 7);
  last.setUTCDate(last.getUTCDate() + 7);
  const years = Array.from({ length: last.getUTCFullYear() - first.getUTCFullYear() + 1 }, (_, index) => first.getUTCFullYear() + index);
  const currentYear = new Date().getFullYear();
  for (const year of [currentYear, currentYear + 1]) {
    if (!years.includes(year)) void loadYear(year);
  }
  const results = await Promise.all(years.map(async (year) => [year, await loadYear(year)] as const));
  return buildCalendarDays(from, to, new Map(results));
}
