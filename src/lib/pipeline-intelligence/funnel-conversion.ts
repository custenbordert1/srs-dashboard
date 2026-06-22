import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { FunnelConversionTrend, FunnelTransitionMetric } from "@/lib/pipeline-intelligence/types";
import {
  isActivePipelineCandidate,
  mapToCanonicalPipelineStage,
  type CanonicalPipelineStage,
} from "@/lib/pipeline-intelligence/stage-mapping";

/** Executive funnel groups (progression order). */
export const FUNNEL_GROUP_STAGES: CanonicalPipelineStage[][] = [
  ["Applied"],
  ["Needs Review"],
  ["Contacted"],
  ["Interview Scheduled", "Interview Completed"],
  ["Paperwork Pending", "Paperwork Sent"],
  ["Ready for MEL"],
  ["Active Rep"],
];

export const FUNNEL_TRANSITIONS: Array<{
  id: string;
  label: string;
  fromGroup: number;
  toGroup: number;
}> = [
  { id: "applied-review", label: "Applied → Review", fromGroup: 0, toGroup: 1 },
  { id: "review-contacted", label: "Review → Contacted", fromGroup: 1, toGroup: 2 },
  { id: "contacted-interview", label: "Contacted → Interview", fromGroup: 2, toGroup: 3 },
  { id: "interview-paperwork", label: "Interview → Paperwork", fromGroup: 3, toGroup: 4 },
  { id: "paperwork-mel", label: "Paperwork → Ready For MEL", fromGroup: 4, toGroup: 5 },
  { id: "mel-active", label: "Ready For MEL → Active Rep", fromGroup: 5, toGroup: 6 },
];

const TREND_WINDOW_MS = 21 * 24 * 60 * 60 * 1000;

function funnelGroupIndex(stage: CanonicalPipelineStage): number {
  for (let index = 0; index < FUNNEL_GROUP_STAGES.length; index += 1) {
    if (FUNNEL_GROUP_STAGES[index]!.includes(stage)) return index;
  }
  return -1;
}

function hasReachedFunnelGroup(row: ScoredCandidateWorkflowRow, groupIndex: number): boolean {
  const current = mapToCanonicalPipelineStage(row);
  const currentIndex = funnelGroupIndex(current);
  return currentIndex >= groupIndex;
}

function countInFunnelGroup(candidates: ScoredCandidateWorkflowRow[], groupIndex: number): number {
  return candidates.filter((row) => {
    const current = mapToCanonicalPipelineStage(row);
    return funnelGroupIndex(current) === groupIndex;
  }).length;
}

function transitionConversionPct(
  candidates: ScoredCandidateWorkflowRow[],
  fromGroup: number,
  toGroup: number,
): number | null {
  const reachedFrom = candidates.filter((row) => hasReachedFunnelGroup(row, fromGroup)).length;
  if (reachedFrom === 0) return null;
  const reachedTo = candidates.filter((row) => hasReachedFunnelGroup(row, toGroup)).length;
  return Math.min(100, Math.round((reachedTo / reachedFrom) * 1000) / 10);
}

function resolveTrend(allPct: number | null, recentPct: number | null): FunnelConversionTrend {
  if (allPct === null || recentPct === null) return "flat";
  if (recentPct > allPct + 2) return "up";
  if (recentPct < allPct - 2) return "down";
  return "flat";
}

export function buildFunnelTransitionMetrics(
  candidates: ScoredCandidateWorkflowRow[],
  referenceMs = Date.now(),
): FunnelTransitionMetric[] {
  const active = candidates.filter(isActivePipelineCandidate);
  const recentCutoff = referenceMs - TREND_WINDOW_MS;
  const recent = active.filter((row) => {
    const appliedMs = new Date(row.appliedDate).getTime();
    return !Number.isNaN(appliedMs) && appliedMs >= recentCutoff;
  });

  return FUNNEL_TRANSITIONS.map((transition) => {
    const allPct = transitionConversionPct(active, transition.fromGroup, transition.toGroup);
    const recentPct = transitionConversionPct(recent, transition.fromGroup, transition.toGroup);
    return {
      id: transition.id,
      label: transition.label,
      fromGroup: transition.fromGroup,
      toGroup: transition.toGroup,
      count: countInFunnelGroup(active, transition.fromGroup),
      conversionPct: allPct,
      trend: resolveTrend(allPct, recentPct),
    };
  });
}
