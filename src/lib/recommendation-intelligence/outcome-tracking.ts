import type { RecruitingIntelligenceRouteBundle } from "@/lib/recruiting-intelligence/load-recruiting-intelligence-route-bundle";
import { diffOutcomeMetrics, extractOutcomeMetrics } from "@/lib/recommendation-intelligence/metrics";
import { scoreEffectiveness } from "@/lib/recommendation-intelligence/scoring";
import type {
  OutcomeCheckpointDay,
  OutcomeMetrics,
  RecommendationRecord,
} from "@/lib/recommendation-intelligence/types";
import {
  OUTCOME_CHECKPOINT_DAYS,
  RECOMMENDATION_TRACKING_EXPIRY_DAYS,
} from "@/lib/recommendation-intelligence/types";

const CHECKPOINT_DAY_OFFSETS: Record<OutcomeCheckpointDay, number> = {
  day0: 0,
  day7: 7,
  day14: 14,
  day30: 30,
};

function daysSince(iso: string, referenceMs: number): number {
  return Math.max(0, Math.round((referenceMs - Date.parse(iso)) / (24 * 60 * 60 * 1000)));
}

function checkpointDue(
  record: RecommendationRecord,
  checkpoint: OutcomeCheckpointDay,
  referenceMs: number,
): boolean {
  const anchor = record.executionDate ?? record.createdDate;
  return daysSince(anchor, referenceMs) >= CHECKPOINT_DAY_OFFSETS[checkpoint];
}

function actualApplicantGain(record: RecommendationRecord): number {
  const baseline = record.baselineMetrics;
  const latest =
    record.outcomeCheckpoints.day30 ??
    record.outcomeCheckpoints.day14 ??
    record.outcomeCheckpoints.day7 ??
    record.outcomeCheckpoints.day0;
  if (!latest || !baseline) return 0;
  return diffOutcomeMetrics(latest, baseline).applicants;
}

export function updateRecommendationOutcomeCheckpoints(input: {
  record: RecommendationRecord;
  bundle: RecruitingIntelligenceRouteBundle;
  referenceMs: number;
}): RecommendationRecord {
  const { record, bundle, referenceMs } = input;
  if (record.status !== "In Progress" && record.status !== "Executed") return record;

  const currentMetrics = extractOutcomeMetrics(bundle, record.scope);
  const checkpoints = { ...record.outcomeCheckpoints };

  for (const day of OUTCOME_CHECKPOINT_DAYS) {
    if (checkpoints[day] == null && checkpointDue(record, day, referenceMs)) {
      checkpoints[day] = currentMetrics;
    }
  }

  return {
    ...record,
    outcomeCheckpoints: checkpoints,
  };
}

export function scoreExpiredRecommendation(input: {
  record: RecommendationRecord;
  bundle: RecruitingIntelligenceRouteBundle;
  referenceMs: number;
}): RecommendationRecord {
  const { record, bundle, referenceMs } = input;
  const expired = Date.parse(record.expiresAt) <= referenceMs;
  if (!expired || record.effectiveness != null) return record;

  const withCheckpoints = updateRecommendationOutcomeCheckpoints({
    record,
    bundle,
    referenceMs,
  });
  const current = extractOutcomeMetrics(bundle, withCheckpoints.scope);
  const baseline = withCheckpoints.baselineMetrics ?? current;

  const effectiveness = scoreEffectiveness({
    expectedApplicantGain: withCheckpoints.expectedApplicantGain,
    baseline,
    current,
  });

  const wasTracked =
    withCheckpoints.status === "In Progress" || withCheckpoints.status === "Executed";

  return {
    ...withCheckpoints,
    effectiveness,
    effectivenessScoredAt: new Date(referenceMs).toISOString(),
    status: wasTracked ? "Completed" : "Ignored",
    outcomeCheckpoints: {
      ...withCheckpoints.outcomeCheckpoints,
      day30: withCheckpoints.outcomeCheckpoints.day30 ?? current,
    },
  };
}

export function processRecommendationOutcomes(input: {
  records: RecommendationRecord[];
  bundle: RecruitingIntelligenceRouteBundle;
  referenceMs?: number;
}): RecommendationRecord[] {
  const referenceMs = input.referenceMs ?? Date.parse(input.bundle.fetchedAt);
  return input.records.map((record) => {
    const checkpointed = updateRecommendationOutcomeCheckpoints({
      record,
      bundle: input.bundle,
      referenceMs,
    });
    if (daysSince(checkpointed.createdDate, referenceMs) >= RECOMMENDATION_TRACKING_EXPIRY_DAYS) {
      return scoreExpiredRecommendation({
        record: checkpointed,
        bundle: input.bundle,
        referenceMs,
      });
    }
    return checkpointed;
  });
}

export function summarizeActualGain(record: RecommendationRecord): number {
  return actualApplicantGain(record);
}

export function latestOutcomeMetrics(record: RecommendationRecord): OutcomeMetrics | null {
  return (
    record.outcomeCheckpoints.day30 ??
    record.outcomeCheckpoints.day14 ??
    record.outcomeCheckpoints.day7 ??
    record.outcomeCheckpoints.day0 ??
    record.baselineMetrics
  );
}
