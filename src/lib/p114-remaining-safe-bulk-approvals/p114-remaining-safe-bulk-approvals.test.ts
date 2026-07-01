import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ReviewWorkflowItem } from "@/lib/p109-project-mapping-review/types";
import type { BulkReviewGroup } from "@/lib/p111-bulk-mapping-review/types";
import type { BulkGroupImpactSimulation } from "@/lib/p112-bulk-approval-impact-validation/types";
import {
  identifyRemainingSafeBulkGroups,
  isP113PaysonGroup,
} from "@/lib/p114-remaining-safe-bulk-approvals/apply-remaining-safe-bulk-approvals";
import { P113_TARGET_GROUP_ID } from "@/lib/p113-first-safe-bulk-approval/types";

function workflowItem(overrides?: Partial<ReviewWorkflowItem>): ReviewWorkflowItem {
  return {
    candidateId: "c1",
    candidateName: "Alex Rivera",
    closedPosition: {
      positionId: "closed-1",
      title: "Merchandiser — Lake Havasu City, AZ",
      city: "Lake Havasu City",
      state: "AZ",
      breezyStatus: "closed",
      postingAgeDays: 30,
    },
    recommendedPosition: {
      positionId: "pub-1",
      title: "Retail Merchandiser - Lake Havasu City, AZ",
      city: "Lake Havasu City",
      state: "AZ",
    },
    confidenceScore: 80,
    mappingDecision: "REVIEW",
    mappingReasons: ["Same city"],
    factorScores: [],
    explanationHeadline: "80% — Needs review",
    approvalStatus: "pending",
    priorDecision: null,
    priorNotes: null,
    availableActions: ["approve", "reject", "skip"],
    ...overrides,
  };
}

function bulkGroup(input: {
  groupId: string;
  title: string;
  city: string;
  state: string;
  recommendedPositionId: string;
  candidateIds: string[];
  confidence?: number;
}): BulkReviewGroup {
  const members = input.candidateIds.map((candidateId, index) =>
    workflowItem({
      candidateId,
      candidateName: `Candidate ${index + 1}`,
      closedPosition: {
        positionId: `closed-${input.groupId}`,
        title: input.title,
        city: input.city,
        state: input.state,
        breezyStatus: "closed",
        postingAgeDays: 30,
      },
      recommendedPosition: {
        positionId: input.recommendedPositionId,
        title: `${input.title} Active`,
        city: input.city,
        state: input.state,
      },
      confidenceScore: input.confidence ?? 80,
    }),
  );

  return {
    groupId: input.groupId,
    closedPositionTitle: input.title,
    closedPositionId: members[0]!.closedPosition.positionId,
    recommendedPositionId: input.recommendedPositionId,
    recommendedPositionTitle: members[0]!.recommendedPosition.title,
    city: input.city,
    state: input.state,
    confidenceBand: "high_80_plus",
    client: "Retail",
    averageConfidence: input.confidence ?? 80,
    minConfidence: input.confidence ?? 80,
    candidateCount: members.length,
    candidateIds: input.candidateIds,
    members,
    bulkApprovable: true,
    bulkApproveBlockers: [],
    individualReviewOnly: false,
  };
}

function simulation(group: BulkReviewGroup, safeToApprove: BulkGroupImpactSimulation["safeToApprove"]): BulkGroupImpactSimulation {
  return {
    groupId: group.groupId,
    groupName: `${group.closedPositionTitle} → ${group.recommendedPositionTitle}`,
    closedPositionTitle: group.closedPositionTitle,
    candidateCount: group.candidateCount,
    averageConfidence: group.averageConfidence,
    minConfidence: group.minConfidence,
    confidenceBand: group.confidenceBand,
    recommendedActivePosition: {
      positionId: group.recommendedPositionId,
      title: group.recommendedPositionTitle,
      city: group.city,
      state: group.state,
    },
    safetyExclusions: { alreadySent: 0, duplicateRisk: 0, invalidEmail: 0, other: 0, total: 0 },
    newlyEligibleAfterApproval: group.candidateCount,
    remainingBlocked: 0,
    recoveryRatePercent: 100,
    safeToApprove,
    riskNotes: [],
    candidateIds: group.candidateIds,
  };
}

describe("p114-remaining-safe-bulk-approvals", () => {
  it("detects the P113 Payson group", () => {
    const payson = bulkGroup({
      groupId: P113_TARGET_GROUP_ID,
      title: "Continuity Store Merchandiser – Payson, AZ",
      city: "Payson",
      state: "AZ",
      recommendedPositionId: "07c1de432ea6",
      candidateIds: ["c-payson"],
    });
    assert.equal(isP113PaysonGroup(payson), true);
  });

  it("identifies remaining SAFE groups and excludes Payson, REVIEW FIRST, and DO NOT APPROVE", () => {
    const payson = bulkGroup({
      groupId: P113_TARGET_GROUP_ID,
      title: "Continuity Store Merchandiser – Payson, AZ",
      city: "Payson",
      state: "AZ",
      recommendedPositionId: "07c1de432ea6",
      candidateIds: ["c-payson"],
    });
    const safeHavasu = bulkGroup({
      groupId: "havasu-safe",
      title: "Continuity Merchandiser Lake Havasu City, AZ",
      city: "Lake Havasu City",
      state: "AZ",
      recommendedPositionId: "a707da4f2564",
      candidateIds: ["c-havasu-1", "c-havasu-2"],
    });
    const reviewFirst = bulkGroup({
      groupId: "elko-review",
      title: "Merchandiser Elko, NV",
      city: "Elko",
      state: "NV",
      recommendedPositionId: "pub-elko",
      candidateIds: ["c-elko"],
      confidence: 66,
    });
    const doNotApprove = bulkGroup({
      groupId: "blocked-group",
      title: "Blocked Group",
      city: "Denver",
      state: "CO",
      recommendedPositionId: "pub-denver",
      candidateIds: ["c-blocked"],
    });

    const groups = [payson, safeHavasu, reviewFirst, doNotApprove];
    const simulations = [
      simulation(payson, "SAFE"),
      simulation(safeHavasu, "SAFE"),
      simulation(reviewFirst, "REVIEW FIRST"),
      simulation(doNotApprove, "DO NOT APPROVE"),
    ];

    const remaining = identifyRemainingSafeBulkGroups({ groups, simulations });
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0]?.group.groupId, "havasu-safe");
    assert.equal(remaining[0]?.simulation.safeToApprove, "SAFE");
  });
});
