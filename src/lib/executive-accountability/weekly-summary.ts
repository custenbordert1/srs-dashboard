import type { ExecutiveTrackedAction } from "@/lib/executive-accountability/types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Monday 00:00 UTC for the week containing referenceMs. */
export function startOfUtcWeek(referenceMs: number): number {
  const date = new Date(referenceMs);
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  date.setUTCHours(0, 0, 0, 0);
  return date.getTime();
}

export function buildExecutiveWeeklySummary(input: {
  actions: ExecutiveTrackedAction[];
  overdueCount: number;
  referenceMs?: number;
}): import("@/lib/executive-accountability/types").ExecutiveWeeklySummary {
  const referenceMs = input.referenceMs ?? Date.now();
  const periodStartMs = startOfUtcWeek(referenceMs);
  const periodEndMs = periodStartMs + 7 * MS_PER_DAY;

  const inWeek = (iso: string | null | undefined): boolean => {
    if (!iso) return false;
    const ms = new Date(iso).getTime();
    return !Number.isNaN(ms) && ms >= periodStartMs && ms < periodEndMs;
  };

  const opened = input.actions.filter((row) => inWeek(row.createdAt)).length;
  const completed = input.actions.filter((row) => inWeek(row.completedAt)).length;
  const archived = input.actions.filter((row) => inWeek(row.archivedAt)).length;

  const blockers = input.actions
    .filter(
      (row) =>
        (row.status === "open" || row.status === "in_progress") &&
        (row.priority === "critical" || row.priority === "high"),
    )
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
    .map((row) => row.title);

  return {
    periodStart: new Date(periodStartMs).toISOString(),
    periodEnd: new Date(periodEndMs).toISOString(),
    opened,
    completed,
    overdue: input.overdueCount,
    archived,
    topBlockers: blockers.slice(0, 5),
  };
}
