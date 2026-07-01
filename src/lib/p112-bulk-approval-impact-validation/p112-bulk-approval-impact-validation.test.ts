import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ReviewWorkflowItem } from "@/lib/p109-project-mapping-review/types";
import type { BulkImpactPreview, BulkReviewGroup } from "@/lib/p111-bulk-mapping-review/types";
import { recommendGroupApproval } from "@/lib/p112-bulk-approval-impact-validation/recommend-group-approval";

function workflowItem(overrides?: Partial<ReviewWorkflowItem>): ReviewWorkflowItem {
  return {
    candidateId: "c1",
    candidateName: "Alex Rivera",
    closedPosition: {
      positionId: "closed-1",
      title: "Merchandiser — Elko, NV",
      city: "Elko",
      state: "NV",
      breezyStatus: "closed",
      postingAgeDays: 30,
    },
    recommendedPosition: {
      positionId: "pub-1",
      title: "Merchandiser — Elko, NV",
      city: "Elko",
      state: "NV",
    },
    confidenceScore: 70,
    mappingDecision: "REVIEW",
    mappingReasons: ["Similar title"],
    factorScores: [],
    explanationHeadline: "70% — Needs review",
    approvalStatus: "pending",
    priorDecision: null,
    priorNotes: null,
    availableActions: ["approve", "reject", "skip"],
    ...overrides,
  };
}

function bulkGroup(overrides?: Partial<BulkReviewGroup>): BulkReviewGroup {
  const member = workflowItem();
  return {
    groupId: "group-1",
    closedPositionTitle: member.closedPosition.title,
    closedPositionId: member.closedPosition.positionId,
    recommendedPositionId: member.recommendedPosition.positionId,
    recommendedPositionTitle: member.recommendedPosition.title,
    city: member.closedPosition.city,
    state: member.closedPosition.state,
    confidenceBand: "approvable_65_79",
    client: "Retail",
    averageConfidence: 70,
    minConfidence: 70,
    candidateCount: 1,
    candidateIds: [member.candidateId],
    members: [member],
    bulkApprovable: true,
    bulkApproveBlockers: [],
    individualReviewOnly: false,
    ...overrides,
  };
}

function preview(overrides?: Partial<BulkImpactPreview>): BulkImpactPreview {
  return {
    groupId: "group-1",
    action: "approved",
    sharedNote: "test",
    candidatesAffected: 1,
    newlyEligibleAfterApproval: 1,
    safetyExcluded: { alreadySent: 0, duplicateRisk: 0, invalidEmail: 0, other: 0 },
    remainingPending: 0,
    candidateDetails: [
      {
        candidateId: "c1",
        candidateName: "Alex Rivera",
        wouldBecomeEligible: true,
        exclusionReason: null,
      },
    ],
    ...overrides,
  };
}

describe("p112-bulk-approval-impact-validation", () => {
  it("recommends DO NOT APPROVE when protection exclusions exist", () => {
    const result = recommendGroupApproval({
      group: bulkGroup(),
      preview: preview({
        newlyEligibleAfterApproval: 0,
        safetyExcluded: { alreadySent: 1, duplicateRisk: 0, invalidEmail: 0, other: 0 },
        candidateDetails: [
          {
            candidateId: "c1",
            candidateName: "Alex Rivera",
            wouldBecomeEligible: false,
            exclusionReason: "already_sent",
          },
        ],
      }),
    });
    assert.equal(result.recommendation, "DO NOT APPROVE");
    assert.ok(result.riskNotes.some((note) => note.includes("protection")));
  });

  it("recommends DO NOT APPROVE when no candidates become newly eligible", () => {
    const result = recommendGroupApproval({
      group: bulkGroup(),
      preview: preview({
        newlyEligibleAfterApproval: 0,
        candidateDetails: [
          {
            candidateId: "c1",
            candidateName: "Alex Rivera",
            wouldBecomeEligible: false,
            exclusionReason: "missing_onboarding",
          },
        ],
      }),
    });
    assert.equal(result.recommendation, "DO NOT APPROVE");
  });

  it("recommends SAFE for full recovery with high confidence", () => {
    const result = recommendGroupApproval({
      group: bulkGroup({
        averageConfidence: 84,
        minConfidence: 82,
        confidenceBand: "high_80_plus",
        candidateCount: 2,
      }),
      preview: preview({
        candidatesAffected: 2,
        newlyEligibleAfterApproval: 2,
        candidateDetails: [
          {
            candidateId: "c1",
            candidateName: "Alex Rivera",
            wouldBecomeEligible: true,
            exclusionReason: null,
          },
          {
            candidateId: "c2",
            candidateName: "Jamie Lee",
            wouldBecomeEligible: true,
            exclusionReason: null,
          },
        ],
      }),
    });
    assert.equal(result.recommendation, "SAFE");
  });

  it("recommends REVIEW FIRST for borderline confidence with full recovery", () => {
    const result = recommendGroupApproval({
      group: bulkGroup({
        averageConfidence: 68,
        minConfidence: 66,
        confidenceBand: "approvable_65_79",
      }),
      preview: preview(),
    });
    assert.equal(result.recommendation, "REVIEW FIRST");
    assert.ok(result.riskNotes.length > 0);
  });

  it("recommends REVIEW FIRST when some candidates remain blocked", () => {
    const result = recommendGroupApproval({
      group: bulkGroup({
        averageConfidence: 82,
        minConfidence: 80,
        confidenceBand: "high_80_plus",
        candidateCount: 2,
      }),
      preview: preview({
        candidatesAffected: 2,
        newlyEligibleAfterApproval: 1,
        candidateDetails: [
          {
            candidateId: "c1",
            candidateName: "Alex Rivera",
            wouldBecomeEligible: true,
            exclusionReason: null,
          },
          {
            candidateId: "c2",
            candidateName: "Jamie Lee",
            wouldBecomeEligible: false,
            exclusionReason: "missing_onboarding",
          },
        ],
      }),
    });
    assert.equal(result.recommendation, "REVIEW FIRST");
    assert.ok(result.riskNotes.some((note) => note.includes("remain blocked")));
  });

  it("flags near-threshold min confidence in risk notes", () => {
    const result = recommendGroupApproval({
      group: bulkGroup({ minConfidence: 66, averageConfidence: 67 }),
      preview: preview(),
    });
    assert.equal(result.recommendation, "REVIEW FIRST");
    assert.ok(result.riskNotes.some((note) => note.includes("near the bulk-approve threshold")));
  });
});
