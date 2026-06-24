import type { RecruiterActionPriority } from "@/lib/candidate-workflow-types";
import type { ProgressionStageType } from "@/lib/candidate-progression-engine/types";

const PRIORITY_RANK: Record<RecruiterActionPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export const PROGRESSION_PRIORITY_STYLES: Record<RecruiterActionPriority, string> = {
  high: "border-red-500/40 bg-red-500/10 text-red-100",
  medium: "border-amber-500/40 bg-amber-500/10 text-amber-100",
  low: "border-zinc-600 bg-zinc-900/60 text-zinc-300",
};

export const PROGRESSION_STAGE_STYLES: Record<ProgressionStageType, string> = {
  "contact-candidate": "border-sky-500/40 bg-sky-500/10 text-sky-100",
  "schedule-interview": "border-violet-500/40 bg-violet-500/10 text-violet-100",
  "send-paperwork": "border-teal-500/40 bg-teal-500/10 text-teal-100",
  "ready-for-mel": "border-emerald-500/40 bg-emerald-500/10 text-emerald-100",
  escalate: "border-red-500/50 bg-red-500/15 text-red-100",
  none: "border-zinc-700 bg-zinc-900/50 text-zinc-400",
};

export function progressionSortKey(input: {
  progressionPriority?: RecruiterActionPriority | null;
  progressionConfidence?: number | null;
}): number {
  const pri = input.progressionPriority ?? "low";
  const confidence = input.progressionConfidence ?? 0;
  return PRIORITY_RANK[pri] * 100 - confidence;
}

export function compareProgressionPriority(
  a: {
    progressionPriority?: RecruiterActionPriority | null;
    progressionConfidence?: number | null;
    candidateId?: string;
  },
  b: {
    progressionPriority?: RecruiterActionPriority | null;
    progressionConfidence?: number | null;
    candidateId?: string;
  },
): number {
  const keyDiff = progressionSortKey(a) - progressionSortKey(b);
  if (keyDiff !== 0) return keyDiff;
  return (a.candidateId ?? "").localeCompare(b.candidateId ?? "");
}

export function progressionBadgeStyle(
  recommendedStage: string | null | undefined,
  priority?: RecruiterActionPriority | null,
): string {
  if (!recommendedStage?.trim()) return PROGRESSION_PRIORITY_STYLES.low;
  if (recommendedStage === "Escalate") return PROGRESSION_STAGE_STYLES.escalate;
  if (priority && PROGRESSION_PRIORITY_STYLES[priority]) {
    return PROGRESSION_PRIORITY_STYLES[priority];
  }
  return "border-indigo-500/40 bg-indigo-500/10 text-indigo-100";
}
