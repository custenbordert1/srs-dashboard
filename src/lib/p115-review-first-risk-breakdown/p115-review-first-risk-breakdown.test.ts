import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ReviewWorkflowItem } from "@/lib/p109-project-mapping-review/types";
import type { BulkReviewGroup } from "@/lib/p111-bulk-mapping-review/types";
import type { BulkGroupImpactSimulation } from "@/lib/p112-bulk-approval-impact-validation/types";
import {
  buildWhatWouldMakeItSafe,
  collectMissingConfidenceFactors,
  explainWhyNotSafe,
  recommendReviewFirstAction,
} from "@/lib/p115-review-first-risk-breakdown/analyze-review-first-group";

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
      title: "Retail Merchandiser — Elko, NV",
      city: "Elko",
      state: "NV",
    },
    confidenceScore: 66,
    mappingDecision: "REVIEW",
    mappingReasons: ["Similar title"],
    factorScores: [
      {
        factor: "client",
        points: 0,
        maxPoints: 12,
        matched: false,
        detail: "Different client",
      },
      {
        factor: "project_code",
        points: 0,
        maxPoints: 10,
        matched: false,
        detail: "No project code match",
      },
      {
        factor: "city",
        points: 15,
        maxPoints: 15,
        matched: true,
        detail: "Same city",
      },
    ],
    explanationHeadline: "66% — Needs review",
    approvalStatus: "pending",
    priorDecision: null,
    priorNotes: null,
    availableActions: ["approve", "reject", "skip"],
    ...overrides,
  };
}

function bulkGroup(members: ReviewWorkflowItem[]): BulkReviewGroup {
  const first = members[0]!;
  const scores = members.map((member) => member.confidenceScore);
  return {
    groupId: "elko-group",
    closedPositionTitle: first.closedPosition.title,
    closedPositionId: first.closedPosition.positionId,
    recommendedPositionId: first.recommendedPosition.positionId,
    recommendedPositionTitle: first.recommendedPosition.title,
    city: first.closedPosition.city,
    state: first.closedPosition.state,
    confidenceBand: "approvable_65_79",
    client: "Merchandiser",
    averageConfidence: Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length),
    minConfidence: Math.min(...scores),
    candidateCount: members.length,
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
    safeToApprove: "REVIEW FIRST",
    riskNotes: ["Average confidence 66% is borderline for bulk approval."],
    candidateIds: group.candidateIds,
  };
}

describe("p115-review-first-risk-breakdown", () => {
  it("collects missing confidence factors across members", () => {
    const members = [
      workflowItem({ candidateId: "c1" }),
      workflowItem({ candidateId: "c2", candidateName: "Jamie Lee" }),
    ];
    const missing = collectMissingConfidenceFactors(members);
    assert.ok(missing.some((factor) => factor.factor === "client"));
    assert.ok(missing.some((factor) => factor.factor === "project_code"));
  });

  it("explains why a borderline group is not SAFE", () => {
    const group = bulkGroup([workflowItem()]);
    const explained = explainWhyNotSafe({
      group,
      riskNotes: ["Average confidence 66% is borderline for bulk approval."],
    });
    assert.match(explained.whyNotSafe, /borderline/i);
  });

  it("builds steps for what would make a group SAFE", () => {
    const group = bulkGroup([workflowItem(), workflowItem({ candidateId: "c2", confidenceScore: 68 })]);
    const steps = buildWhatWouldMakeItSafe({
      group,
      missingFactors: collectMissingConfidenceFactors(group.members),
      riskNotes: ["Minimum confidence 66% is near the bulk-approve threshold."],
      remainingBlocked: 0,
    });
    assert.ok(steps.some((step) => step.includes("75%")));
    assert.ok(steps.some((step) => step.includes("client")));
  });

  it("recommends split_group when a SAFE subgroup with multiple candidates exists", () => {
    const group = bulkGroup([
      workflowItem({ candidateId: "c1", confidenceScore: 66 }),
      workflowItem({ candidateId: "c2", confidenceScore: 78 }),
      workflowItem({ candidateId: "c3", confidenceScore: 80 }),
    ]);
    const action = recommendReviewFirstAction({
      group,
      simulation: simulation(group),
      missingFactors: collectMissingConfidenceFactors(group.members),
      splitRecommendations: [
        {
          splitBy: "confidence_score",
          subgroupLabel: "confidence_gte_75",
          candidateCount: 2,
          candidateIds: ["c2", "c3"],
          averageConfidence: 79,
          wouldBecomeSafe: true,
          projectedSafeToApprove: "SAFE",
          reason: "Split by confidence_score yields SAFE subgroup (79% avg).",
        },
      ],
    });
    assert.equal(action.action, "split_group");
  });

  it("recommends request_recruiter_review when protection exclusions exist", () => {
    const group = bulkGroup([workflowItem()]);
    const action = recommendReviewFirstAction({
      group,
      simulation: {
        ...simulation(group),
        safetyExclusions: { alreadySent: 1, duplicateRisk: 0, invalidEmail: 0, other: 0, total: 1 },
      },
      missingFactors: [],
      splitRecommendations: [],
    });
    assert.equal(action.action, "request_recruiter_review");
  });
});
