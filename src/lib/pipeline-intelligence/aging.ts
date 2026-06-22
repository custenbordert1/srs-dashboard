import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { calendarDaysSince } from "@/lib/candidate-action-sla";
import type { CandidateAgingBucket } from "@/lib/pipeline-intelligence/types";
import {
  isActivePipelineCandidate,
  isBeyondStageSla,
  mapToCanonicalPipelineStage,
} from "@/lib/pipeline-intelligence/stage-mapping";

export const AGING_BUCKETS: CandidateAgingBucket[] = ["0-2", "3-5", "6-10", "10+"];

export function classifyAgingBucket(days: number | null): CandidateAgingBucket {
  if (days === null || days <= 2) return "0-2";
  if (days <= 5) return "3-5";
  if (days <= 10) return "6-10";
  return "10+";
}

export function buildCandidateAgingSummary(
  candidates: ScoredCandidateWorkflowRow[],
  referenceMs = Date.now(),
): Array<{ bucket: CandidateAgingBucket; count: number; beyondSlaCount: number }> {
  const counts = new Map<CandidateAgingBucket, { count: number; beyondSlaCount: number }>();
  for (const bucket of AGING_BUCKETS) {
    counts.set(bucket, { count: 0, beyondSlaCount: 0 });
  }

  for (const row of candidates) {
    if (!isActivePipelineCandidate(row)) continue;
    const stage = mapToCanonicalPipelineStage(row);
    const days = calendarDaysSince(row.appliedDate, referenceMs);
    const bucket = classifyAgingBucket(days);
    const entry = counts.get(bucket)!;
    entry.count += 1;
    if (isBeyondStageSla(stage, row, referenceMs)) entry.beyondSlaCount += 1;
  }

  return AGING_BUCKETS.map((bucket) => ({
    bucket,
    count: counts.get(bucket)!.count,
    beyondSlaCount: counts.get(bucket)!.beyondSlaCount,
  }));
}
