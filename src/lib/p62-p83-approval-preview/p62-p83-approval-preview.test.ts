import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_P84_FEATURE_FLAGS } from "@/lib/autonomous-paperwork-send-engine/feature-flags-store";
import { canLiveSendPaperwork } from "@/lib/autonomous-paperwork-send-engine/feature-flags-store";
import type { P62AssignmentPreviewEntry } from "@/lib/p62-assignment-preview/types";
import { buildP62P83ApprovalPreview } from "@/lib/p62-p83-approval-preview/build-p62-p83-approval-preview";
import {
  P95_EXCLUDED_CALL_FIRST_CANDIDATE_ID,
  P95_EXCLUDED_CALL_FIRST_CANDIDATE_NAME,
} from "@/lib/p62-p83-approval-preview/types";

function successEntry(
  patch: Partial<P62AssignmentPreviewEntry> = {},
): P62AssignmentPreviewEntry {
  return {
    candidateId: "ok-1",
    candidateName: "Gary Smigocki",
    positionId: "p1",
    jobTitle: "Merchandiser",
    city: "Woodbury",
    state: "NJ",
    dmTerritory: "NJ",
    suggestedDm: "Melissa O'Connor",
    currentRecruiter: "Unassigned",
    recommendedRecruiter: "Taylor",
    assignmentReason: "Territory match",
    workloadBalanceFactor: "0 owned",
    confidence: 65,
    riskLevel: "medium",
    outcome: "assignable",
    humanReviewReason: null,
    downstream: {
      steps: [],
      expectedWorkflowStatus: "Paperwork Needed",
      expectedActionType: "send-paperwork",
      p83Action: "send-paperwork",
      p83ShouldAdvance: true,
      p84EligibleAfterSimulation: true,
      p84BlockingReasonsAfterSimulation: [],
      stillBlockedAfterAssignment: false,
      remainingBlocker: null,
    },
    manualApprovalRequired: true,
    ...patch,
  };
}

function callFirstEntry(): P62AssignmentPreviewEntry {
  return successEntry({
    candidateId: P95_EXCLUDED_CALL_FIRST_CANDIDATE_ID,
    candidateName: P95_EXCLUDED_CALL_FIRST_CANDIDATE_NAME,
    downstream: {
      steps: [],
      expectedWorkflowStatus: "Applied",
      expectedActionType: "none",
      p83Action: "call-first",
      p83ShouldAdvance: false,
      p84EligibleAfterSimulation: false,
      p84BlockingReasonsAfterSimulation: ["Current status: Applied."],
      stillBlockedAfterAssignment: true,
      remainingBlocker: "Verification needed before paperwork: technology readiness.",
    },
  });
}

describe("p62-p83-approval-preview (P95)", () => {
  it("never enables live paperwork sends", () => {
    assert.equal(DEFAULT_P84_FEATURE_FLAGS.liveSend, false);
    assert.equal(canLiveSendPaperwork(DEFAULT_P84_FEATURE_FLAGS), false);
  });

  it("puts successful P94 simulations in the approval queue", () => {
    const report = buildP62P83ApprovalPreview({
      p94Entries: [successEntry(), callFirstEntry()],
    });
    assert.equal(report.metrics.approvalQueueCount, 1);
    assert.equal(report.metrics.excludedCallFirst, 1);
    assert.equal(report.excluded[0]?.candidateName, P95_EXCLUDED_CALL_FIRST_CANDIDATE_NAME);
  });

  it("every simulated approval reaches P84 eligible with liveSend false", () => {
    const report = buildP62P83ApprovalPreview({
      p94Entries: [successEntry(), successEntry({ candidateId: "ok-2", candidateName: "Alex Rivera" })],
    });
    for (const entry of report.approvalQueue) {
      assert.equal(entry.postApprovalSimulation.p84Eligible, true);
      assert.equal(entry.postApprovalSimulation.liveSend, false);
      assert.equal(entry.postApprovalSimulation.workflowStatus, "Paperwork Needed");
      assert.equal(entry.postApprovalSimulation.actionType, "send-paperwork");
      assert.equal(entry.autoApproveBlocked, true);
    }
    assert.equal(report.metrics.liveSendsBlocked, report.metrics.approvalQueueCount);
  });

  it("does not auto-approve — manual approval required on every queue entry", () => {
    const report = buildP62P83ApprovalPreview({ p94Entries: [successEntry()] });
    const entry = report.approvalQueue[0];
    assert.ok(entry);
    assert.equal(entry.manualApprovalRequired, true);
    assert.equal(entry.approvalStatus, "pending");
  });
});
