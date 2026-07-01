import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ReviewWorkflowItem } from "@/lib/p109-project-mapping-review/types";
import type { BulkReviewGroup } from "@/lib/p111-bulk-mapping-review/types";
import type { BulkReviewToolsReport } from "@/lib/p111-bulk-mapping-review/types";
import type { BulkGroupImpactSimulation } from "@/lib/p112-bulk-approval-impact-validation/types";
import {
  findP113TargetGroup,
  resolveFirstSafeBulkGroup,
} from "@/lib/p113-first-safe-bulk-approval/apply-first-safe-bulk-approval";
import { P113_TARGET_GROUP_ID } from "@/lib/p113-first-safe-bulk-approval/types";

function workflowItem(overrides?: Partial<ReviewWorkflowItem>): ReviewWorkflowItem {
  return {
    candidateId: "bfd12572f3e5",
    candidateName: "Alex Rivera",
    closedPosition: {
      positionId: "closed-payson",
      title: "Continuity Store Merchandiser – Payson, AZ",
      city: "Payson",
      state: "AZ",
      breezyStatus: "closed",
      postingAgeDays: 30,
    },
    recommendedPosition: {
      positionId: "07c1de432ea6",
      title: "Continuity In-Store Merchandiser Payson, AZ",
      city: "Payson",
      state: "AZ",
    },
    confidenceScore: 84,
    mappingDecision: "REVIEW",
    mappingReasons: ["Same city"],
    factorScores: [],
    explanationHeadline: "84% — Needs review",
    approvalStatus: "pending",
    priorDecision: null,
    priorNotes: null,
    availableActions: ["approve", "reject", "skip"],
    ...overrides,
  };
}

function bulkGroup(): BulkReviewGroup {
  const members = [
    workflowItem({ candidateId: "bfd12572f3e5" }),
    workflowItem({ candidateId: "cde8b040e7a4", candidateName: "Jamie Lee" }),
  ];
  return {
    groupId: P113_TARGET_GROUP_ID,
    closedPositionTitle: members[0]!.closedPosition.title,
    closedPositionId: members[0]!.closedPosition.positionId,
    recommendedPositionId: members[0]!.recommendedPosition.positionId,
    recommendedPositionTitle: members[0]!.recommendedPosition.title,
    city: "Payson",
    state: "AZ",
    confidenceBand: "high_80_plus",
    client: "Store",
    averageConfidence: 84,
    minConfidence: 84,
    candidateCount: 2,
    candidateIds: members.map((member) => member.candidateId),
    members,
    bulkApprovable: true,
    bulkApproveBlockers: [],
    individualReviewOnly: false,
  };
}

function simulation(group: BulkReviewGroup): BulkGroupImpactSimulation {
  return {
    groupId: group.groupId,
    groupName: "Continuity Store Merchandiser – Payson, AZ → Continuity In-Store Merchandiser Payson, AZ",
    closedPositionTitle: group.closedPositionTitle,
    candidateCount: 2,
    averageConfidence: 84,
    minConfidence: 84,
    confidenceBand: "high_80_plus",
    recommendedActivePosition: {
      positionId: "07c1de432ea6",
      title: "Continuity In-Store Merchandiser Payson, AZ",
      city: "Payson",
      state: "AZ",
    },
    safetyExclusions: { alreadySent: 0, duplicateRisk: 0, invalidEmail: 0, other: 0, total: 0 },
    newlyEligibleAfterApproval: 2,
    remainingBlocked: 0,
    recoveryRatePercent: 100,
    safeToApprove: "SAFE",
    riskNotes: [],
    candidateIds: ["bfd12572f3e5", "cde8b040e7a4"],
  };
}

function p111Report(group: BulkReviewGroup): BulkReviewToolsReport {
  return {
    sourcePhase: "P111",
    generatedAt: new Date().toISOString(),
    mode: "dryRun",
    summary: "test",
    metrics: {
      totalGroups: 1,
      bulkApprovableGroups: 1,
      individualReviewOnlyGroups: 0,
      totalPendingCandidates: 2,
      bulkApprovableCandidates: 2,
      estimatedCandidatesRecoverable: 2,
      safetyExclusions: {
        alreadySent: 0,
        duplicateRisk: 0,
        invalidEmail: 0,
        belowConfidenceThreshold: 0,
        missingRecommendedPosition: 0,
      },
    },
    groups: [group],
    topRecommendedBulkApprovals: [group],
    warnings: [],
  };
}

describe("p113-first-safe-bulk-approval", () => {
  it("finds the Payson target group by id or location", () => {
    const group = bulkGroup();
    assert.equal(findP113TargetGroup([group])?.groupId, P113_TARGET_GROUP_ID);
    assert.equal(
      findP113TargetGroup([{ ...group, groupId: "other-id" }])?.groupId,
      "other-id",
    );
  });

  it("resolves the SAFE Payson group with matching simulation", () => {
    const group = bulkGroup();
    const resolved = resolveFirstSafeBulkGroup({
      p111Report: p111Report(group),
      simulation: simulation(group),
    });
    assert.equal(resolved.group.groupId, P113_TARGET_GROUP_ID);
    assert.equal(resolved.simulation.safeToApprove, "SAFE");
    assert.equal(resolved.group.candidateCount, 2);
  });

  it("rejects non-SAFE simulations", () => {
    const group = bulkGroup();
    const unsafe = { ...simulation(group), safeToApprove: "REVIEW FIRST" as const };
    assert.throws(
      () => resolveFirstSafeBulkGroup({ p111Report: p111Report(group), simulation: unsafe }),
      /not SAFE/,
    );
  });

  it("requires bulk-approvable P111 group", () => {
    const group = { ...bulkGroup(), bulkApprovable: false };
    assert.throws(
      () =>
        resolveFirstSafeBulkGroup({
          p111Report: p111Report(group),
          simulation: simulation(group),
        }),
      /not bulk-approvable/,
    );
  });
});
