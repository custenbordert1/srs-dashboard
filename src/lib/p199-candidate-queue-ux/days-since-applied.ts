import type { P199DaysSinceAppliedId } from "@/lib/p199-candidate-queue-ux/types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Whole calendar days since applied (local midnight math avoided; uses floor of elapsed ms). */
export function daysSinceApplied(appliedDate: string, nowMs = Date.now()): number | null {
  if (!appliedDate.trim()) return null;
  const applied = new Date(appliedDate);
  if (Number.isNaN(applied.getTime())) return null;
  return Math.max(0, Math.floor((nowMs - applied.getTime()) / MS_PER_DAY));
}

export function matchesDaysSinceAppliedBucket(
  appliedDate: string,
  bucket: P199DaysSinceAppliedId,
  nowMs = Date.now(),
): boolean {
  if (bucket === "all") return true;
  const days = daysSinceApplied(appliedDate, nowMs);
  if (days === null) return false;
  switch (bucket) {
    case "today":
      return days === 0;
    case "1":
      return days === 1;
    case "2":
      return days === 2;
    case "3-5":
      return days >= 3 && days <= 5;
    case "6-10":
      return days >= 6 && days <= 10;
    case "10+":
      return days >= 10;
    default:
      return true;
  }
}
