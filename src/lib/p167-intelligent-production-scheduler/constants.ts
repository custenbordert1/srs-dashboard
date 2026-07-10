import type { P167SchedulerRecommendation } from "@/lib/p167-intelligent-production-scheduler/types";

/** Combined Dropbox API ceiling used for scheduler go/no-go (P165 validated target). */
export const P167_DROPBOX_CYCLE_BUDGET = 35;

/** Minimum spacing after a live send burst when rate-limit headroom is low. */
export const P167_LOW_RATE_LIMIT_REMAINING_THRESHOLD = 10;

/** Minutes to wait tiers mapped to recommendations. */
export const P167_WAIT_MINUTES: Record<
  Exclude<P167SchedulerRecommendation, "READY_NOW" | "NO_ELIGIBLE_CANDIDATES" | "PAUSE_INVESTIGATION_REQUIRED">,
  number
> = {
  WAIT_2_MINUTES: 2,
  WAIT_5_MINUTES: 5,
  WAIT_10_MINUTES: 10,
  WAIT_15_MINUTES: 15,
};

export function waitRecommendationForMinutes(minutes: number): P167SchedulerRecommendation {
  if (minutes <= 2) return "WAIT_2_MINUTES";
  if (minutes <= 5) return "WAIT_5_MINUTES";
  if (minutes <= 10) return "WAIT_10_MINUTES";
  return "WAIT_15_MINUTES";
}

export function addMinutes(iso: string | null, minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}
