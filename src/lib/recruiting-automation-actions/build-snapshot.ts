import type {
  AutomationControlCenterSnapshot,
  AutomationControlCenterSummary,
  AutomationRoiGeneratedSummary,
  RecruitingAutomationRecord,
} from "@/lib/recruiting-automation-actions/types";
import { enrichAutomationWithRoi } from "@/lib/executive-trust-roi/enrich-automation";
import type { AutomationRoiView } from "@/lib/executive-trust-roi/types";
import type { RecommendationRecord } from "@/lib/recommendation-intelligence/types";
import { buildQueueAgingBuckets } from "@/lib/recruiting-automation-actions/queue-aging";
import { resolveAutomationSafetyMode } from "@/lib/recruiting-automation-actions/safety-rules";
import type { AutomationSafetyMode } from "@/lib/recruiting-automation-actions/types";

function parsePlacementsInfluenced(record: RecruitingAutomationRecord): number {
  const payload = record.payload;
  if ("expectedPlacements" in payload) return payload.expectedPlacements;
  const match = record.expectedImpact.match(/\+(\d+)\s*placement/i);
  return match ? Number.parseInt(match[1]!, 10) : 0;
}

function parseApplicantGain(record: RecruitingAutomationRecord): number {
  const payload = record.payload;
  if ("expectedApplicantGain" in payload) return payload.expectedApplicantGain;
  const match = record.expectedImpact.match(/\+(\d+)\s*applicant/i);
  return match ? Number.parseInt(match[1]!, 10) : 0;
}

function parseCoverageGain(record: RecruitingAutomationRecord): number {
  const payload = record.payload;
  if ("expectedCoverageGain" in payload) return payload.expectedCoverageGain;
  const match = record.expectedImpact.match(/\+(\d+)%?\s*coverage/i);
  return match ? Number.parseInt(match[1]!, 10) : 0;
}

function buildRoiGenerated(
  completed: RecruitingAutomationRecord[],
  automationRoiById: Record<string, AutomationRoiView>,
): AutomationRoiGeneratedSummary {
  let applicantsGained = 0;
  let coverageGained = 0;
  let placementsInfluenced = 0;

  for (const record of completed) {
    const roi = automationRoiById[record.id];
    applicantsGained += roi?.projectedApplicantGain ?? parseApplicantGain(record);
    coverageGained += roi?.projectedCoverageGain ?? parseCoverageGain(record);
    placementsInfluenced += parsePlacementsInfluenced(record);
  }

  return { applicantsGained, coverageGained, placementsInfluenced };
}

function automationRoiSortScore(
  record: RecruitingAutomationRecord,
  automationRoiById: Record<string, AutomationRoiView>,
): number {
  const roi = automationRoiById[record.id];
  if (!roi) return 0;
  return roi.projectedApplicantGain * 2 + roi.projectedCoverageGain + roi.confidenceScore * 0.1;
}

function buildSummary(
  records: RecruitingAutomationRecord[],
  automationRoiById: Record<string, AutomationRoiView>,
): AutomationControlCenterSummary {
  const completed = records.filter((r) => r.approvalStatus === "Completed");
  const failed = records.filter((r) => r.approvalStatus === "Failed");
  const executedCount = completed.length + failed.length;
  const executionSuccessRate =
    executedCount > 0 ? Math.round((completed.length / executedCount) * 100) : 0;

  return {
    draft: records.filter((r) => r.approvalStatus === "Draft").length,
    pendingApproval: records.filter((r) => r.approvalStatus === "Pending Approval").length,
    approved: records.filter((r) => r.approvalStatus === "Approved").length,
    executing: records.filter((r) => r.approvalStatus === "Executing").length,
    completed: completed.length,
    failed: failed.length,
    cancelled: records.filter((r) => r.approvalStatus === "Cancelled").length,
    recommended: records.filter((r) => r.sourceRecommendation != null && r.approvalStatus === "Draft")
      .length,
    executedCount,
    executionSuccessRate,
    roiGenerated: buildRoiGenerated(completed, automationRoiById),
  };
}

function sortByRoi(
  records: RecruitingAutomationRecord[],
  automationRoiById: Record<string, AutomationRoiView>,
): RecruitingAutomationRecord[] {
  return [...records].sort((a, b) => {
    const roiDelta = automationRoiSortScore(b, automationRoiById) - automationRoiSortScore(a, automationRoiById);
    if (roiDelta !== 0) return roiDelta;
    return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
  });
}

export function buildAutomationControlCenterSnapshot(input: {
  records: RecruitingAutomationRecord[];
  safetyMode: AutomationSafetyMode;
  generatedAt: string;
  recommendationRecords?: RecommendationRecord[];
}): AutomationControlCenterSnapshot {
  const referenceMs = Date.parse(input.generatedAt);
  const mode = resolveAutomationSafetyMode(input.safetyMode);
  const automationRoiById = enrichAutomationWithRoi({
    automations: input.records,
    records: input.recommendationRecords ?? [],
  });
  const records = sortByRoi(input.records, automationRoiById);

  return {
    generatedAt: input.generatedAt,
    safetyMode: mode,
    summary: buildSummary(records, automationRoiById),
    recommended: sortByRoi(
      records.filter((r) => r.sourceRecommendation != null && r.approvalStatus === "Draft"),
      automationRoiById,
    ),
    jobRefreshDrafts: sortByRoi(
      records.filter((r) => r.actionType === "job-refresh"),
      automationRoiById,
    ),
    postingDrafts: sortByRoi(
      records.filter((r) => r.actionType === "create-posting"),
      automationRoiById,
    ),
    followUpCampaigns: sortByRoi(
      records.filter((r) => r.actionType === "follow-up-campaign"),
      automationRoiById,
    ),
    pendingApproval: sortByRoi(
      records.filter((r) => r.approvalStatus === "Pending Approval"),
      automationRoiById,
    ),
    approved: sortByRoi(
      records.filter((r) => r.approvalStatus === "Approved"),
      automationRoiById,
    ),
    executed: sortByRoi(
      records.filter((r) => r.approvalStatus === "Completed"),
      automationRoiById,
    ),
    failed: sortByRoi(
      records.filter((r) => r.approvalStatus === "Failed"),
      automationRoiById,
    ),
    cancelled: records.filter((r) => r.approvalStatus === "Cancelled"),
    all: records,
    automationRoiById,
    queueAging: buildQueueAgingBuckets(records, referenceMs),
  };
}
