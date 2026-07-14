import {
  P1866_FUNNEL_STAGES,
  type P1866CohortCandidate,
  type P1866FunnelStage,
  type P1866FunnelStageMetrics,
  type P1866HealthBand,
} from "@/lib/p186-6-executive-recruiting-intelligence/types";
import { average, dedupeCohort, median } from "@/lib/p186-6-executive-recruiting-intelligence/util";

const emptyHealth = (): Record<P1866HealthBand, number> => ({
  excellent: 0,
  good: 0,
  fair: 0,
  poor: 0,
  critical: 0,
  unknown: 0,
});

export function buildFunnelMetrics(input: {
  cohort: P1866CohortCandidate[];
  previousCohortCounts?: Partial<Record<P1866FunnelStage, number>>;
  healthByCandidate?: Record<string, P1866HealthBand>;
  nowMs?: number;
}): P1866FunnelStageMetrics[] {
  const now = input.nowMs ?? Date.now();
  const deduped = dedupeCohort(input.cohort, P1866_FUNNEL_STAGES);
  const byStage = new Map<P1866FunnelStage, P1866CohortCandidate[]>();
  for (const stage of P1866_FUNNEL_STAGES) byStage.set(stage, []);
  for (const row of deduped) {
    byStage.get(row.funnelStage)?.push(row);
  }

  let firstStageCount = 0;
  return P1866_FUNNEL_STAGES.map((stage, idx) => {
    const rows = byStage.get(stage) ?? [];
    const ages = rows.map((r) => Math.max(0, now - Date.parse(r.stageEnteredAt)));
    const healthDistribution = emptyHealth();
    for (const r of rows) {
      const band = input.healthByCandidate?.[r.candidateId] ?? "unknown";
      healthDistribution[band] += 1;
    }
    const currentCount = rows.length;
    if (idx === 0) firstStageCount = currentCount || 1;
    const prevStage = idx > 0 ? P1866_FUNNEL_STAGES[idx - 1]! : null;
    const prevCount = prevStage ? (byStage.get(prevStage)?.length ?? 0) : null;
    const conversionFromPrevious =
      prevCount != null && prevCount > 0 ? Math.round((currentCount / prevCount) * 1000) / 10 : null;
    const cumulativeConversion =
      idx === 0
        ? 100
        : firstStageCount > 0
          ? Math.round((currentCount / firstStageCount) * 1000) / 10
          : null;
    const previous = input.previousCohortCounts?.[stage];
    const trendVsPrevious =
      previous != null && previous > 0
        ? Math.round(((currentCount - previous) / previous) * 1000) / 10
        : previous === 0 && currentCount > 0
          ? 100
          : null;

    return {
      stage,
      currentCount,
      enteredToday: rows.filter((r) => r.enteredInRange).length,
      exitedToday: rows.filter((r) => r.exitedInRange).length,
      conversionFromPrevious,
      cumulativeConversion,
      averageAgeMs: average(ages),
      medianAgeMs: median(ages),
      oldestAgeMs: ages.length ? Math.max(...ages) : null,
      blockedCount: rows.filter((r) => r.blocked).length,
      healthDistribution,
      trendVsPrevious,
    };
  });
}

export function computeConversionRates(input: {
  cohort: P1866CohortCandidate[];
}): Record<string, number | null> {
  const deduped = dedupeCohort(input.cohort, P1866_FUNNEL_STAGES);
  const counts = Object.fromEntries(
    P1866_FUNNEL_STAGES.map((s) => [s, deduped.filter((c) => c.funnelStage === s).length]),
  ) as Record<P1866FunnelStage, number>;

  const ratio = (a: P1866FunnelStage, b: P1866FunnelStage) =>
    counts[a] > 0 ? Math.round((counts[b] / counts[a]) * 1000) / 10 : null;

  return {
    application_to_review: ratio("APPLIED", "RECRUITER_REVIEW"),
    review_to_recommendation: ratio("RECRUITER_REVIEW", "HIRING_RECOMMENDATION"),
    recommendation_to_approval: ratio("HIRING_RECOMMENDATION", "OPERATOR_APPROVED"),
    approval_to_paperwork: ratio("OPERATOR_APPROVED", "PAPERWORK_NEEDED"),
    paperwork_sent_to_viewed: ratio("PAPERWORK_SENT", "PAPERWORK_VIEWED"),
    viewed_to_signed: ratio("PAPERWORK_VIEWED", "PAPERWORK_SIGNED"),
    signed_to_onboarding_complete: ratio("PAPERWORK_SIGNED", "ONBOARDING_COMPLETE"),
    onboarding_complete_to_ready_for_mel: ratio("ONBOARDING_COMPLETE", "READY_FOR_MEL"),
    ready_for_mel_to_exported: ratio("READY_FOR_MEL", "EXPORTED"),
  };
}
