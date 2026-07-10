import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { DEFAULT_P84_FEATURE_FLAGS } from "@/lib/autonomous-paperwork-send-engine/feature-flags-store";
import { canLiveSendPaperwork } from "@/lib/autonomous-paperwork-send-engine/feature-flags-store";
import type { P62P83ApprovalQueueEntry } from "@/lib/p62-p83-approval-preview/types";
import { buildP84SendQueuePreview } from "@/lib/p84-send-queue-preview/build-p84-send-queue-preview-from-stores";
import {
  buildP84SendQueueEntry,
  simulateApprovalPersistenceRow,
} from "@/lib/p84-send-queue-preview/build-p84-send-queue-preview";

function sampleCandidate(patch: Partial<BreezyCandidate> = {}): BreezyCandidate {
  return {
    candidateId: "q-1",
    firstName: "Gary",
    lastName: "Smigocki",
    email: "gary@example.com",
    phone: "555",
    source: "Indeed",
    stage: "Applied",
    appliedDate: "2026-06-05",
    createdDate: "2026-06-05",
    addedDate: "2026-06-05",
    updatedDate: "2026-06-05",
    addedDateSource: "creation_date",
    positionId: "p1",
    positionName: "Merchandiser",
    city: "Woodbury",
    state: "NJ",
    zipCode: "08096",
    resumeText: "Retail merchandiser Walmart Target customer service travel willing",
    hasResume: true,
    questionnaireAnswers: [
      { question: "smartphone", answer: "Yes" },
      { question: "internet", answer: "Yes" },
      { question: "transportation", answer: "Yes" },
    ],
    hasQuestionnaire: true,
    ...patch,
  };
}

function approvalEntry(
  patch: Partial<P62P83ApprovalQueueEntry> = {},
): P62P83ApprovalQueueEntry {
  return {
    candidateId: "q-1",
    candidateName: "Gary Smigocki",
    positionId: "p1",
    jobTitle: "Merchandiser",
    city: "Woodbury",
    state: "NJ",
    dmTerritory: "NJ",
    suggestedDm: "Melissa O'Connor",
    assignedRecruiter: "Taylor",
    confidence: 65,
    approvalStatus: "pending",
    riskLevel: "medium",
    safeToApprove: true,
    assignmentReason: "Territory match",
    postApprovalSimulation: {
      approvalSimulated: true,
      workflowStatus: "Paperwork Needed",
      actionType: "send-paperwork",
      recruiterAssigned: "Taylor",
      dmAssigned: "Melissa O'Connor",
      p84Eligible: true,
      liveSend: false,
      p83Action: "send-paperwork",
      simulationDetail: "test",
    },
    manualApprovalRequired: true,
    autoApproveBlocked: true,
    ...patch,
  };
}

function readyRow(patch: Partial<ScoredCandidateWorkflowRow> = {}): ScoredCandidateWorkflowRow {
  const base = buildScoredWorkflowRow(sampleCandidate(), {
    candidateId: "q-1",
    workflowStatus: "Applied",
    assignedRecruiter: "Unassigned",
    assignedDM: "Unassigned",
    notes: [],
    history: [],
  });
  return {
    ...base,
    dmNeedsAssignment: false,
    candidateGrade: {
      ...base.candidateGrade,
      paperworkReady: true,
      categoryScores: { ...base.candidateGrade.categoryScores, paperworkReadiness: 75 },
    },
    ...patch,
  };
}

describe("p84-send-queue-preview (P96)", () => {
  it("never enables live paperwork sends", () => {
    assert.equal(DEFAULT_P84_FEATURE_FLAGS.liveSend, false);
    assert.equal(canLiveSendPaperwork(DEFAULT_P84_FEATURE_FLAGS), false);
  });

  it("simulates approval persistence without changing production stores", () => {
    const row = readyRow();
    const persisted = simulateApprovalPersistenceRow(row, approvalEntry());
    assert.equal(persisted.workflowStatus, "Paperwork Needed");
    assert.equal(persisted.actionType, "send-paperwork");
    assert.equal(persisted.assignedRecruiter, "Taylor");
    assert.equal(row.workflowStatus, "Applied");
  });

  it("places P84-eligible candidates in send queue with liveSend false", () => {
    const row = readyRow();
    const entry = buildP84SendQueueEntry({
      approval: approvalEntry(),
      row,
      jobsByPositionId: new Map([["p1", { jobId: "p1", status: "published" } as BreezyJob]]),
      onboarding: null,
      p84Flags: DEFAULT_P84_FEATURE_FLAGS,
    });
    assert.equal(entry.inSendQueue, true);
    assert.equal(entry.liveSend, false);
    assert.equal(entry.eligibilityResult, "eligible");
    assert.equal(entry.autoApproveBlocked, true);
    assert.ok(entry.sendBlockedReason?.includes("Executive approval"));
  });

  it("every queued candidate passed P84 gates in cohort preview", () => {
    const report = buildP84SendQueuePreview({
      approvalQueue: [approvalEntry(), approvalEntry({ candidateId: "q-2", candidateName: "Alex Rivera" })],
      rowsByCandidateId: new Map([
        ["q-1", readyRow()],
        ["q-2", readyRow({ candidateId: "q-2", email: "alex@example.com" })],
      ]),
      jobsByPositionId: new Map([["p1", { jobId: "p1", status: "published" } as BreezyJob]]),
      onboardingByCandidateId: new Map(),
      p84Flags: DEFAULT_P84_FEATURE_FLAGS,
    });
    assert.equal(report.metrics.sendQueueCount, 2);
    assert.equal(report.metrics.liveSendsDisabledCount, 2);
    for (const entry of report.sendQueue) {
      assert.equal(entry.eligibilityResult, "eligible");
      assert.equal(entry.liveSend, false);
    }
  });
});
