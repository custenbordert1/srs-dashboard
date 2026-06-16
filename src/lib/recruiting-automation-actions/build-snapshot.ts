import type {
  AutomationControlCenterSnapshot,
  AutomationControlCenterSummary,
  RecruitingAutomationRecord,
} from "@/lib/recruiting-automation-actions/types";
import { enrichAutomationWithRoi } from "@/lib/executive-trust-roi/enrich-automation";
import type { RecommendationRecord } from "@/lib/recommendation-intelligence/types";
import { resolveAutomationSafetyMode } from "@/lib/recruiting-automation-actions/safety-rules";
import type { AutomationSafetyMode } from "@/lib/recruiting-automation-actions/types";

function isThisWeek(iso: string, referenceMs: number): boolean {
  const ms = Date.parse(iso);
  return referenceMs - ms <= 7 * 24 * 60 * 60 * 1000;
}

function buildSummary(
  records: RecruitingAutomationRecord[],
  referenceMs: number,
): AutomationControlCenterSummary {
  return {
    draft: records.filter((r) => r.approvalStatus === "Draft").length,
    pendingApproval: records.filter((r) => r.approvalStatus === "Pending Approval").length,
    approved: records.filter((r) => r.approvalStatus === "Approved").length,
    executedThisWeek: records.filter(
      (r) =>
        r.approvalStatus === "Completed" &&
        r.executedAt != null &&
        isThisWeek(r.executedAt, referenceMs),
    ).length,
    failed: records.filter((r) => r.approvalStatus === "Failed").length,
    cancelled: records.filter((r) => r.approvalStatus === "Cancelled").length,
    recommended: records.filter((r) => r.sourceRecommendation != null && r.approvalStatus === "Draft")
      .length,
  };
}

export function buildAutomationControlCenterSnapshot(input: {
  records: RecruitingAutomationRecord[];
  safetyMode: AutomationSafetyMode;
  generatedAt: string;
  recommendationRecords?: RecommendationRecord[];
}): AutomationControlCenterSnapshot {
  const referenceMs = Date.parse(input.generatedAt);
  const mode = resolveAutomationSafetyMode(input.safetyMode);
  const records = [...input.records].sort(
    (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
  );
  const automationRoiById = enrichAutomationWithRoi({
    automations: records,
    records: input.recommendationRecords ?? [],
  });

  return {
    generatedAt: input.generatedAt,
    safetyMode: mode,
    summary: buildSummary(records, referenceMs),
    recommended: records.filter((r) => r.sourceRecommendation != null && r.approvalStatus === "Draft"),
    jobRefreshDrafts: records.filter((r) => r.actionType === "job-refresh"),
    postingDrafts: records.filter((r) => r.actionType === "create-posting"),
    followUpCampaigns: records.filter((r) => r.actionType === "follow-up-campaign"),
    pendingApproval: records.filter((r) => r.approvalStatus === "Pending Approval"),
    approved: records.filter((r) => r.approvalStatus === "Approved"),
    executed: records.filter((r) => r.approvalStatus === "Completed"),
    failed: records.filter((r) => r.approvalStatus === "Failed"),
    cancelled: records.filter((r) => r.approvalStatus === "Cancelled"),
    all: records,
    automationRoiById,
  };
}
