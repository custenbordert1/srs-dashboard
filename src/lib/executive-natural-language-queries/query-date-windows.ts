import {
  BREEZY_ADDED_DATE_TIMEZONE,
  calendarDateKeyInTimezone,
  countCandidatesLastCalendarDays,
  isAppliedDateInRange,
} from "@/lib/breezy-api";
import type { BreezyCandidate } from "@/lib/breezy-api";
import { currentMtdDateRange } from "@/lib/candidate-ingestion/mtd-candidates";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseTimestamp(raw: string | null | undefined): Date | null {
  if (!raw?.trim()) return null;
  const date = new Date(raw.trim());
  return Number.isNaN(date.getTime()) ? null : date;
}

function calendarDayKey(date: Date, timeZone = BREEZY_ADDED_DATE_TIMEZONE): string {
  return calendarDateKeyInTimezone(date, timeZone);
}

function shiftCalendarDayKey(dayKey: string, deltaDays: number, timeZone = BREEZY_ADDED_DATE_TIMEZONE): string {
  const noon = new Date(`${dayKey}T12:00:00.000Z`);
  return calendarDayKey(new Date(noon.getTime() + deltaDays * MS_PER_DAY), timeZone);
}

export function resolveReferenceDayKeys(referenceIso: string, timeZone = BREEZY_ADDED_DATE_TIMEZONE) {
  const reference = parseTimestamp(referenceIso) ?? new Date();
  const todayKey = calendarDayKey(reference, timeZone);
  const yesterdayKey = shiftCalendarDayKey(todayKey, -1, timeZone);
  return { reference, todayKey, yesterdayKey, timeZone };
}

export function countApplicantsToday(candidates: BreezyCandidate[], referenceIso: string): number {
  return countCandidatesLastCalendarDays(candidates, referenceIso, 1);
}

export function countApplicantsYesterday(candidates: BreezyCandidate[], referenceIso: string): number {
  const { yesterdayKey, timeZone } = resolveReferenceDayKeys(referenceIso);
  return candidates.filter((candidate) => {
    const applied = parseTimestamp(candidate.appliedDate || candidate.addedDate);
    if (!applied) return false;
    return calendarDayKey(applied, timeZone) === yesterdayKey;
  }).length;
}

export function countApplicantsThisWeek(candidates: BreezyCandidate[], referenceIso: string): number {
  return countCandidatesLastCalendarDays(candidates, referenceIso, 7);
}

export function countApplicantsThisMonth(candidates: BreezyCandidate[], referenceIso: string): number {
  const range = currentMtdDateRange(parseTimestamp(referenceIso) ?? new Date());
  return candidates.filter((candidate) =>
    isAppliedDateInRange(candidate.appliedDate, range.start, range.end),
  ).length;
}

export function isTimestampOnCalendarDay(
  raw: string | null | undefined,
  dayKey: string,
  timeZone = BREEZY_ADDED_DATE_TIMEZONE,
): boolean {
  const at = parseTimestamp(raw);
  if (!at) return false;
  return calendarDayKey(at, timeZone) === dayKey;
}

export function isTimestampInLastCalendarDays(
  raw: string | null | undefined,
  referenceIso: string,
  dayCount: number,
  timeZone = BREEZY_ADDED_DATE_TIMEZONE,
): boolean {
  const at = parseTimestamp(raw);
  if (!at) return false;
  const { todayKey } = resolveReferenceDayKeys(referenceIso, timeZone);
  const endMs = new Date(`${todayKey}T12:00:00.000Z`).getTime();
  const startMs = endMs - (dayCount - 1) * MS_PER_DAY;
  const key = calendarDayKey(at, timeZone);
  const keyMs = new Date(`${key}T12:00:00.000Z`).getTime();
  return keyMs >= startMs && keyMs <= endMs + MS_PER_DAY;
}

export function buildComparison(
  current: number,
  previous: number,
  previousLabel: string,
): {
  label: string;
  value: number;
  delta: number;
  direction: "up" | "down" | "flat";
  deltaLabel: string;
} {
  const delta = current - previous;
  const direction = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  const sign = delta > 0 ? "+" : "";
  return {
    label: previousLabel,
    value: previous,
    delta,
    direction,
    deltaLabel: `${sign}${delta}`,
  };
}

export function formatRefreshLabel(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, { timeStyle: "short" }).format(new Date(iso));
  } catch {
    return iso;
  }
}
