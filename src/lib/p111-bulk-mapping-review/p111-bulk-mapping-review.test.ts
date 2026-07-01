import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ReviewWorkflowItem } from "@/lib/p109-project-mapping-review/types";
import {
  checkCandidateBulkApproveSafety,
  evaluateGroupBulkSafety,
} from "@/lib/p111-bulk-mapping-review/bulk-safety-rules";
import {
  buildBulkGroupId,
  groupPendingReviewItems,
  resolveConfidenceBand,
} from "@/lib/p111-bulk-mapping-review/group-review-queue";
import { P111_BULK_APPROVE_MIN_CONFIDENCE } from "@/lib/p111-bulk-mapping-review/types";

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

describe("p111-bulk-mapping-review", () => {
  it("resolves confidence bands", () => {
    assert.equal(resolveConfidenceBand(85), "high_80_plus");
    assert.equal(resolveConfidenceBand(70), "approvable_65_79");
    assert.equal(resolveConfidenceBand(55), "review_50_64");
    assert.equal(resolveConfidenceBand(40), "low_below_50");
  });

  it("groups pending items by mapping dimensions", () => {
    const items = [
      workflowItem({ candidateId: "c1" }),
      workflowItem({ candidateId: "c2" }),
      workflowItem({
        candidateId: "c3",
        closedPosition: {
          ...workflowItem().closedPosition,
          title: "Different Role",
        },
      }),
    ];
    const safety = new Map([
      ["c1", { passesBulkApprove: true, blockers: [], baselineBlocker: "project_mapping_review" }],
      ["c2", { passesBulkApprove: true, blockers: [], baselineBlocker: "project_mapping_review" }],
      ["c3", { passesBulkApprove: true, blockers: [], baselineBlocker: "project_mapping_review" }],
    ]);
    const groups = groupPendingReviewItems(items, safety);
    assert.equal(groups.length, 2);
    assert.equal(groups[0]?.candidateCount, 2);
  });

  it("builds stable group ids", () => {
    const id = buildBulkGroupId({
      closedTitle: "Merchandiser — Elko, NV",
      recommendedPositionId: "pub-1",
      city: "Elko",
      state: "NV",
      confidenceBand: "approvable_65_79",
      client: "Retail",
    });
    assert.ok(id.includes("pub-1"));
    assert.ok(id.includes("NV"));
  });

  it("passes bulk safety when all rules satisfied", () => {
    const item = workflowItem({ confidenceScore: 70 });
    const check = checkCandidateBulkApproveSafety({
      item,
      baselineBlocker: "project_mapping_review",
    });
    assert.equal(check.passesBulkApprove, true);
  });

  it("blocks bulk approve below confidence threshold", () => {
    const item = workflowItem({ confidenceScore: 60 });
    const check = checkCandidateBulkApproveSafety({
      item,
      baselineBlocker: "project_mapping_review",
    });
    assert.equal(check.passesBulkApprove, false);
    assert.ok(check.blockers.some((b) => b.includes(String(P111_BULK_APPROVE_MIN_CONFIDENCE))));
  });

  it("blocks bulk approve for protection blockers", () => {
    for (const blocker of ["already_sent", "duplicate_risk", "invalid_email"] as const) {
      const check = checkCandidateBulkApproveSafety({
        item: workflowItem(),
        baselineBlocker: blocker,
      });
      assert.equal(check.passesBulkApprove, false);
    }
  });

  it("marks group bulk-approvable only when all members pass", () => {
    const members = [workflowItem({ candidateId: "c1" }), workflowItem({ candidateId: "c2", confidenceScore: 68 })];
    const safety = new Map([
      ["c1", { passesBulkApprove: true, blockers: [], baselineBlocker: "project_mapping_review" }],
      ["c2", { passesBulkApprove: true, blockers: [], baselineBlocker: "project_mapping_review" }],
    ]);
    const ok = evaluateGroupBulkSafety({ members, safetyByCandidate: safety });
    assert.equal(ok.bulkApprovable, true);

    const weak = new Map([
      ["c1", { passesBulkApprove: true, blockers: [], baselineBlocker: "project_mapping_review" }],
      [
        "c2",
        {
          passesBulkApprove: false,
          blockers: ["Already sent"],
          baselineBlocker: "already_sent",
        },
      ],
    ]);
    const blocked = evaluateGroupBulkSafety({ members, safetyByCandidate: weak });
    assert.equal(blocked.bulkApprovable, false);
  });

  it("excludes non-pending items from groups", () => {
    const items = [
      workflowItem({ candidateId: "c1", approvalStatus: "pending" }),
      workflowItem({ candidateId: "c2", approvalStatus: "approved" }),
    ];
    const safety = new Map([
      ["c1", { passesBulkApprove: true, blockers: [], baselineBlocker: "project_mapping_review" }],
    ]);
    const groups = groupPendingReviewItems(items, safety);
    assert.equal(groups.reduce((sum, g) => sum + g.candidateCount, 0), 1);
  });
});
