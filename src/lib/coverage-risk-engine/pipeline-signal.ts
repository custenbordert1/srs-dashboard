import type { BreezyCandidate } from "@/lib/breezy-api";
import { normalizeStateCode } from "@/lib/dm-territory-map";
import {
  isAppliedStage,
  isInterviewingStage,
  parseDate,
} from "@/lib/dm-dashboard/territory-shared";

export type StatePipelineCounts = {
  applied: number;
  interviewing: number;
  totalActive: number;
};

export function buildPipelineCountsByState(
  candidates: BreezyCandidate[],
  territoryStates?: string[],
): Map<string, StatePipelineCounts> {
  const map = new Map<string, StatePipelineCounts>();
  const allowed =
    territoryStates && territoryStates.length > 0
      ? new Set(territoryStates.map(normalizeStateCode))
      : null;

  for (const candidate of candidates) {
    const state = normalizeStateCode(candidate.state);
    if (!state) continue;
    if (allowed && !allowed.has(state)) continue;

    const entry = map.get(state) ?? { applied: 0, interviewing: 0, totalActive: 0 };
    if (isInterviewingStage(candidate.stage)) {
      entry.interviewing += 1;
      entry.totalActive += 1;
    } else if (isAppliedStage(candidate.stage)) {
      entry.applied += 1;
      entry.totalActive += 1;
    }
    map.set(state, entry);
  }

  return map;
}

/** 0–100 — higher means stronger recruiting pipeline in the market. */
export function pipelineScoreForState(counts: StatePipelineCounts | undefined): number {
  if (!counts) return 15;
  const weighted = counts.interviewing * 3 + counts.applied;
  if (weighted >= 8) return 90;
  if (weighted >= 5) return 75;
  if (weighted >= 3) return 55;
  if (weighted >= 1) return 35;
  return 10;
}

export function recentPipelineVelocity(
  candidates: BreezyCandidate[],
  state: string,
  referenceIso: string,
  days = 14,
): number {
  const code = normalizeStateCode(state);
  const reference = new Date(referenceIso);
  const since = reference.getTime() - days * 24 * 60 * 60 * 1000;
  let count = 0;
  for (const candidate of candidates) {
    if (normalizeStateCode(candidate.state) !== code) continue;
    const applied = parseDate(candidate.appliedDate);
    if (applied && applied.getTime() >= since) count += 1;
  }
  return count;
}
