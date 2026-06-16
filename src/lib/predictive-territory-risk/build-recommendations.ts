import type {
  PredictiveRiskFactors,
  PredictiveRiskRecommendation,
  PredictiveRiskRecommendationKind,
} from "@/lib/predictive-territory-risk/types";
import type { DashboardTabId } from "@/lib/recruiting-tab-source-labels";

const RECOMMENDATION_LABELS: Record<PredictiveRiskRecommendationKind, string> = {
  "increase-ads": "Increase ads",
  "refresh-jobs": "Refresh jobs",
  "expand-radius": "Expand radius",
  "increase-pay": "Increase pay",
  "reassign-recruiter": "Reassign recruiter",
  "escalate-dm": "Escalate to DM",
};

function nav(
  tabId: DashboardTabId,
  label: string,
  elementId?: string,
): PredictiveRiskRecommendation["navigation"] {
  return { tabId, elementId, label };
}

export function buildPredictiveRecommendations(input: {
  factors: PredictiveRiskFactors;
  dmName: string;
  zeroApplicantJobs: number;
  recruiterWorkloadScore: number;
}): PredictiveRiskRecommendation[] {
  const recommendations: PredictiveRiskRecommendation[] = [];

  if (input.factors.applicationVelocityRisk >= 60 || input.zeroApplicantJobs > 0) {
    recommendations.push({
      kind: "increase-ads",
      label: RECOMMENDATION_LABELS["increase-ads"],
      reason:
        input.zeroApplicantJobs > 0
          ? `${input.zeroApplicantJobs} jobs have zero applicants`
          : "Application velocity is slowing",
      navigation: nav("candidates", "Open Candidates Center", "recruiter-action-queue"),
    });
  }

  if (input.factors.pipelineDepthRisk >= 55) {
    recommendations.push({
      kind: "refresh-jobs",
      label: RECOMMENDATION_LABELS["refresh-jobs"],
      reason: "Pipeline depth is too shallow for open call volume",
      navigation: nav("job-management", "Open Job Management"),
    });
  }

  if (input.factors.coverageGapRisk >= 50 || input.factors.deadlinePressure >= 50) {
    recommendations.push({
      kind: "expand-radius",
      label: RECOMMENDATION_LABELS["expand-radius"],
      reason: "Coverage gap with deadline pressure on open stores",
      navigation: nav("placement-command-center", "Open Placement Command Center", "placement-store-coverage"),
    });
  }

  if (input.factors.hiringVelocityRisk >= 65) {
    recommendations.push({
      kind: "increase-pay",
      label: RECOMMENDATION_LABELS["increase-pay"],
      reason: "Hiring velocity is lagging relative to open demand",
      navigation: nav("territory-intelligence", "Open Territory Intelligence"),
    });
  }

  if (input.recruiterWorkloadScore >= 70 || input.factors.followUpBacklogRisk >= 50) {
    recommendations.push({
      kind: "reassign-recruiter",
      label: RECOMMENDATION_LABELS["reassign-recruiter"],
      reason: "Recruiter workload or follow-up backlog is elevated",
      navigation: nav("candidates", "Open Candidates Center"),
    });
  }

  if (
    input.factors.coverageGapRisk >= 60 ||
    input.factors.alertVolumeRisk >= 55 ||
    input.factors.completionTrendRisk >= 60
  ) {
    recommendations.push({
      kind: "escalate-dm",
      label: RECOMMENDATION_LABELS["escalate-dm"],
      reason: `${input.dmName} territory is forecast to miss coverage targets`,
      navigation: nav("dm-scorecards", "Open DM Scorecards"),
    });
  }

  return recommendations.slice(0, 4);
}
