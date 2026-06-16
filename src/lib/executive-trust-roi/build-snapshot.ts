import { AUTOPILOT_RECOMMENDATION_LABELS } from "@/lib/recruiting-autopilot/recommendation-labels";
import { summarizeActualGain } from "@/lib/recommendation-intelligence/outcome-tracking";
import type { RecommendationRecord } from "@/lib/recommendation-intelligence/types";
import {
  averageDelta,
  computeRoiCategory,
  outcomeDeltaForRecord,
  typeSuccessRate,
} from "@/lib/executive-trust-roi/roi-categories";
import { assignRecordTrustFlag, assignTrustFlag } from "@/lib/executive-trust-roi/trust-flags";
import type {
  ActionPerformanceRow,
  ActualVsExpectedRow,
  CeoRoiSummary,
  ExecutiveImpactSummary,
  ExecutiveTrustRoiSnapshot,
} from "@/lib/executive-trust-roi/types";

function typeLabel(type: string): string {
  return (
    AUTOPILOT_RECOMMENDATION_LABELS[type as keyof typeof AUTOPILOT_RECOMMENDATION_LABELS] ??
    type.replace(/-/g, " ")
  );
}

export function buildExecutiveImpactSummary(records: RecommendationRecord[]): ExecutiveImpactSummary {
  const executed = records.filter(
    (row) => row.status === "Executed" || row.status === "In Progress" || row.status === "Completed",
  );
  const scored = records.filter((row) => row.effectiveness != null);

  let applicants = 0;
  let interviews = 0;
  let hires = 0;
  let coverage = 0;
  let openCalls = 0;
  let projects = 0;
  let risks = 0;

  for (const record of scored) {
    const delta = outcomeDeltaForRecord(record);
    if (!delta) continue;
    applicants += Math.max(0, delta.applicants);
    interviews += Math.max(0, delta.interviews);
    hires += Math.max(0, delta.newHires);
    coverage += Math.max(0, delta.coveragePercent);
    openCalls += Math.max(0, delta.openCalls);
    projects += Math.max(0, delta.projectCompletionPercent);
    risks += Math.max(0, delta.riskScore);
  }

  return {
    applicantsGenerated: applicants,
    interviewsGenerated: interviews,
    hiresGenerated: hires,
    coverageGained: coverage,
    openCallsReduced: openCalls,
    projectsImproved: projects,
    risksReduced: risks,
    trackedActions: records.length,
    scoredActions: scored.length,
  };
}

export function buildActionPerformanceRows(records: RecommendationRecord[]): ActionPerformanceRow[] {
  const byType = new Map<string, RecommendationRecord[]>();
  for (const row of records) {
    const list = byType.get(row.recommendationType) ?? [];
    list.push(row);
    byType.set(row.recommendationType, list);
  }

  return [...byType.entries()].map(([recommendationType, scoped]) => {
    const scored = scoped.filter((row) => row.effectiveness != null);
    const avg = averageDelta(scored);
    const roiCategory =
      scored.length === 0 ? ("Not enough data" as const) : computeRoiCategory(scored[0]!);

    return {
      recommendationType,
      label: typeLabel(recommendationType),
      successRate: typeSuccessRate(scoped),
      averageApplicantGain: avg.applicants,
      averageHireGain: avg.newHires,
      averageCoverageGain: avg.coveragePercent,
      averageOpenCallReduction: avg.openCalls,
      averageRiskReduction: avg.riskScore,
      roiCategory,
      trustFlag: assignTrustFlag({ records: scoped, roiCategory }),
      totalTracked: scoped.length,
    };
  });
}

export function buildActualVsExpectedRows(records: RecommendationRecord[]): ActualVsExpectedRow[] {
  return records
    .filter((row) => row.status !== "Ignored")
    .slice(0, 25)
    .map((row) => ({
      recommendationId: row.recommendationId,
      label: typeLabel(row.recommendationType),
      expectedApplicantGain: row.expectedApplicantGain,
      actualApplicantGain: summarizeActualGain(row),
      expectedImpactScore: row.expectedImpactScore,
      effectiveness: row.effectiveness,
      roiCategory: computeRoiCategory(row),
      trustFlag: assignRecordTrustFlag(row, records.filter((r) => r.recommendationType === row.recommendationType)),
    }));
}

export function buildCeoRoiSummary(
  records: RecommendationRecord[],
  impact: ExecutiveImpactSummary,
): CeoRoiSummary {
  const performance = buildActionPerformanceRows(records);
  const sorted = [...performance].sort((a, b) => b.successRate - a.successRate);
  const automationRecords = records.filter((row) => row.source === "autopilot" || row.source === "daily-action");
  const automationCompleted = automationRecords.filter((row) => row.status === "Completed");
  const automationSuccess = typeSuccessRate(automationCompleted);

  return {
    bestActionWorking: sorted[0]
      ? {
          label: sorted[0].label,
          successRate: sorted[0].successRate,
          trustFlag: sorted[0].trustFlag,
        }
      : null,
    worstAction:
      sorted.length > 1
        ? {
            label: sorted[sorted.length - 1]!.label,
            successRate: sorted[sorted.length - 1]!.successRate,
            trustFlag: sorted[sorted.length - 1]!.trustFlag,
          }
        : null,
    estimatedHiresInfluenced: impact.hiresGenerated,
    coverageGained: impact.coverageGained,
    automationRoi: {
      completedCount: automationCompleted.length,
      successRate: automationSuccess,
      summary:
        automationCompleted.length > 0
          ? `${automationSuccess}% success across ${automationCompleted.length} completed automations`
          : "Automation ROI tracking begins after completed executions",
    },
  };
}

export function buildExecutiveTrustRoiSnapshot(input: {
  records: RecommendationRecord[];
  generatedAt: string;
}): ExecutiveTrustRoiSnapshot {
  const performance = buildActionPerformanceRows(input.records);
  const sorted = [...performance].sort((a, b) => b.successRate - a.successRate);
  const impact = buildExecutiveImpactSummary(input.records);

  const trustByType: Record<string, import("@/lib/executive-trust-roi/types").TrustFlag> = {};
  for (const row of performance) {
    trustByType[row.recommendationType] = row.trustFlag;
  }

  return {
    generatedAt: input.generatedAt,
    executiveImpact: impact,
    topPerformingActions: sorted.slice(0, 5),
    worstPerformingActions: [...sorted].reverse().slice(0, 5),
    actualVsExpected: buildActualVsExpectedRows(input.records),
    trustByType,
    ceoRoiSummary: buildCeoRoiSummary(input.records, impact),
  };
}
