import { computeTypeSuccessRate } from "@/lib/recommendation-intelligence/scoring";
import type { RecommendationRecord } from "@/lib/recommendation-intelligence/types";
import type { RecruitingAutomationRecord } from "@/lib/recruiting-automation-actions/types";
import { computeRoiCategory } from "@/lib/executive-trust-roi/roi-categories";
import { assignRecordTrustFlag, assignTrustFlag } from "@/lib/executive-trust-roi/trust-flags";
import type { AutomationRoiView } from "@/lib/executive-trust-roi/types";

function parseExpectedApplicantGain(expectedImpact: string): number {
  const match = expectedImpact.match(/\+(\d+)\s*applicant/i);
  return match ? Number.parseInt(match[1]!, 10) : 5;
}

function parseExpectedCoverageGain(expectedImpact: string): number {
  const match = expectedImpact.match(/\+(\d+)%?\s*coverage/i);
  return match ? Number.parseInt(match[1]!, 10) : 3;
}

export function enrichAutomationWithRoi(input: {
  automations: RecruitingAutomationRecord[];
  records: RecommendationRecord[];
}): Record<string, AutomationRoiView> {
  const byId: Record<string, AutomationRoiView> = {};

  for (const automation of input.automations) {
    const sourceRecommendation = automation.sourceRecommendation;
    const linked = sourceRecommendation
      ? input.records.find((row) => row.recommendationId === sourceRecommendation.recommendationId)
      : null;
    const typeKey = sourceRecommendation?.recommendationType ?? automation.actionType;
    const typeRecords = input.records.filter(
      (row) => row.recommendationType === typeKey || row.recommendationId.includes(typeKey),
    );
    const historicalSuccessRate =
      typeRecords.length > 0 ? computeTypeSuccessRate(typeRecords, typeKey) : 0;

    const projectedApplicantGain = parseExpectedApplicantGain(automation.expectedImpact);
    const projectedCoverageGain = parseExpectedCoverageGain(automation.expectedImpact);
    const trustFlag = linked
      ? assignRecordTrustFlag(linked, typeRecords)
      : assignTrustFlag({ records: typeRecords });

    const isCompleted = automation.approvalStatus === "Completed";
    const actualCategory = linked && isCompleted ? computeRoiCategory(linked) : null;

    byId[automation.id] = {
      automationId: automation.id,
      expectedRoi: linked ? computeRoiCategory(linked) : historicalSuccessRate >= 60 ? "Medium ROI" : "Not enough data",
      confidenceScore: Math.min(100, Math.round(historicalSuccessRate * 0.85 + projectedApplicantGain)),
      projectedApplicantGain,
      projectedCoverageGain,
      historicalSuccessRate,
      trustFlag,
      actualResult:
        isCompleted && linked
          ? `+${linked.outcomeCheckpoints.day30?.applicants ?? 0} applicants vs baseline`
          : null,
      roiCategory: actualCategory,
      recommendationAccuracy:
        isCompleted && linked?.effectiveness
          ? `${linked.effectiveness} — ${linked.expectedOutcome}`
          : null,
    };
  }

  return byId;
}
