import type { BreezyCandidate } from "@/lib/breezy-api";
import type { PipelineStageBucket } from "@/lib/dm-dashboard/candidate-pipeline";
import {
  MS_PER_DAY,
  isAppliedStage,
  isHiredStage,
  isInterviewingStage,
  parseDate,
} from "@/lib/dm-dashboard/territory-shared";

const STALLED_DAYS = 14;

/** Shared bucket rules for pipeline + operational drawer counts. */
export function classifyBucketForCandidate(
  candidate: BreezyCandidate,
  reference: Date,
): PipelineStageBucket {
  const applied = parseDate(candidate.appliedDate);
  const daysInPipeline =
    applied !== null
      ? Math.max(0, Math.round((reference.getTime() - applied.getTime()) / MS_PER_DAY))
      : null;

  if (isHiredStage(candidate.stage)) return "hired";
  if (isInterviewingStage(candidate.stage)) {
    if (daysInPipeline !== null && daysInPipeline >= STALLED_DAYS) return "stalled";
    return "interviewing";
  }
  if (isAppliedStage(candidate.stage)) {
    if (daysInPipeline !== null && daysInPipeline >= STALLED_DAYS) return "stalled";
    return "applied";
  }
  if (daysInPipeline !== null && daysInPipeline >= STALLED_DAYS) return "stalled";
  return "applied";
}
