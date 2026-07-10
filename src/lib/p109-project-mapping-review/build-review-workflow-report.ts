import { buildProjectMappingReport } from "@/lib/p108-intelligent-project-mapping";
import type { CandidateMappingRecommendation } from "@/lib/p108-intelligent-project-mapping/types";
import {
  buildApprovalBridgeIndex,
  buildSafetyStatus,
  resolveMappingApprovalStatus,
} from "@/lib/p109-project-mapping-review/approval-bridge";
import { findP109ReviewRecord, loadP109ReviewRecords } from "@/lib/p109-project-mapping-review/review-decision-store";
import type {
  ReviewWorkflowItem,
  ReviewWorkflowReport,
} from "@/lib/p109-project-mapping-review/types";
import { P109_DEFAULT_MODE, P109_SOURCE_PHASE } from "@/lib/p109-project-mapping-review/types";

function toWorkflowItem(
  rec: CandidateMappingRecommendation,
  records: Awaited<ReturnType<typeof loadP109ReviewRecords>>,
): ReviewWorkflowItem {
  const prior = findP109ReviewRecord(records, rec.candidateId);
  const approvalStatus = resolveMappingApprovalStatus({
    candidateId: rec.candidateId,
    mappingDecision: rec.mappingDecision,
    record: prior,
  });

  return {
    candidateId: rec.candidateId,
    candidateName: rec.candidateName,
    closedPosition: rec.currentClosedPosition,
    recommendedPosition: {
      positionId: rec.recommendedPositionId,
      title: rec.recommendedPositionTitle,
      city: rec.recommendedCity,
      state: rec.recommendedState,
    },
    confidenceScore: rec.confidenceScore,
    mappingDecision: rec.mappingDecision,
    mappingReasons: rec.mappingReason,
    factorScores: rec.factorScores,
    explanationHeadline: rec.explanationHeadline,
    approvalStatus,
    priorDecision: prior?.decision ?? null,
    priorNotes: prior?.notes ?? null,
    availableActions: ["approve", "reject", "skip"],
  };
}

function buildTopProjectsNeedingReview(items: ReviewWorkflowItem[]): ReviewWorkflowReport["topProjectsNeedingReview"] {
  const byPosition = new Map<
    string,
    {
      positionId: string;
      title: string;
      city: string;
      state: string;
      pending: ReviewWorkflowItem[];
      all: ReviewWorkflowItem[];
    }
  >();

  for (const item of items) {
    const key = item.closedPosition.positionId;
    const existing = byPosition.get(key);
    if (existing) {
      existing.all.push(item);
      if (item.approvalStatus === "pending") existing.pending.push(item);
    } else {
      byPosition.set(key, {
        positionId: key,
        title: item.closedPosition.title,
        city: item.closedPosition.city,
        state: item.closedPosition.state,
        pending: item.approvalStatus === "pending" ? [item] : [],
        all: [item],
      });
    }
  }

  return [...byPosition.values()]
    .filter((g) => g.pending.length > 0)
    .map((g) => ({
      positionId: g.positionId,
      title: g.title,
      city: g.city,
      state: g.state,
      pendingCount: g.pending.length,
      totalCandidates: g.all.length,
      averageConfidence: Math.round(
        g.all.reduce((sum, c) => sum + c.confidenceScore, 0) / g.all.length,
      ),
    }))
    .sort((a, b) => b.pendingCount - a.pendingCount)
    .slice(0, 10);
}

export async function buildReviewWorkflowReport(): Promise<ReviewWorkflowReport> {
  const warnings = [
    "P109 — read-only approval bridge; no Breezy writes.",
    "P109 — no live sends or automatic paperwork.",
    "P109 — P106.3 runner behavior unchanged.",
    `Mode: ${P109_DEFAULT_MODE}.`,
  ];

  const [mappingReport, p109Records] = await Promise.all([
    buildProjectMappingReport({ mode: "dryRun" }),
    loadP109ReviewRecords(),
  ]);

  const reviewCandidates = mappingReport.recommendations.filter(
    (r) => r.mappingDecision === "REVIEW" || r.mappingDecision === "AUTO_MAP",
  );

  const workflowItems = reviewCandidates.map((rec) => toWorkflowItem(rec, p109Records));
  const pendingItems = workflowItems.filter((i) => i.approvalStatus === "pending");

  const approvalBridge = buildApprovalBridgeIndex({
    recommendations: reviewCandidates,
    records: p109Records,
  });

  const metrics = {
    totalReviewCandidates: reviewCandidates.length,
    approvedCount: approvalBridge.approved.length,
    rejectedCount: approvalBridge.rejected.length,
    skippedCount: approvalBridge.skipped.length,
    pendingCount: pendingItems.length,
    autoMapCount: mappingReport.metrics.autoMapCount,
    noMatchCount: mappingReport.metrics.noMatchCount,
  };

  const summary = [
    `${metrics.totalReviewCandidates} review candidates.`,
    `${metrics.approvedCount} approved, ${metrics.rejectedCount} rejected, ${metrics.skippedCount} skipped, ${metrics.pendingCount} pending.`,
    `${pendingItems.length} awaiting recruiter decision.`,
  ].join(" ");

  return {
    sourcePhase: P109_SOURCE_PHASE,
    generatedAt: new Date().toISOString(),
    mode: P109_DEFAULT_MODE,
    summary,
    metrics,
    topProjectsNeedingReview: buildTopProjectsNeedingReview(workflowItems),
    highestConfidencePending: [...pendingItems]
      .sort((a, b) => b.confidenceScore - a.confidenceScore)
      .slice(0, 5),
    lowestConfidencePending: [...pendingItems]
      .sort((a, b) => a.confidenceScore - b.confidenceScore)
      .slice(0, 5),
    reviewQueue: workflowItems.sort((a, b) => b.confidenceScore - a.confidenceScore),
    approvalBridge,
    safetyStatus: buildSafetyStatus(),
    warnings: [...warnings, ...mappingReport.warnings],
  };
}
