import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyCandidate } from "@/lib/breezy-api";
import { buildApprovalQueueCommandCenter } from "@/lib/approval-queue-command-center/build-approval-queue-command-center";
import { scoreApprovalPriority } from "@/lib/approval-queue-command-center/score-approval-priority";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { emptyRecruitingActions } from "@/lib/candidate-recruiting-actions";
import { DEFAULT_CANDIDATE_ONBOARDING_POLICY } from "@/lib/candidate-onboarding-engine/onboarding-policy-store";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";

function candidate(id: string, patch: Partial<BreezyCandidate> = {}): BreezyCandidate {
  return {
    candidateId: id,
    firstName: "Alex",
    lastName: "Kim",
    email: "alex@example.com",
    phone: "555-0100",
    source: "Indeed",
    stage: "Applied",
    appliedDate: "2026-06-20T10:00:00.000Z",
    createdDate: "2026-06-20T10:00:00.000Z",
    addedDate: "2026-06-20T10:00:00.000Z",
    updatedDate: "2026-06-20T10:00:00.000Z",
    addedDateSource: "creation_date",
    positionName: "Merchandiser",
    positionId: "pos-1",
    city: "Atlanta",
    state: "GA",
    zipCode: "30301",
    hasResume: true,
    resumeText: "Retail merchandising",
    ...patch,
  };
}

function workflow(id: string, patch: Partial<CandidateWorkflowRecord> = {}): CandidateWorkflowRecord {
  return {
    candidateId: id,
    workflowStatus: "Paperwork Needed",
    assignedRecruiter: "Jordan Lee",
    assignedDM: "DM South",
    notes: [],
    history: [],
    lastActionAt: null,
    nextActionNeeded: "Send paperwork",
    recruitingActions: emptyRecruitingActions(),
    followUpDueAt: null,
    snoozedUntil: null,
    paperworkStatus: "not_sent",
    signatureRequestId: null,
    paperworkTemplateKey: null,
    paperworkSentAt: null,
    paperworkSignedAt: null,
    paperworkError: null,
    directDepositStatus: "not_requested",
    directDepositRequestedAt: null,
    directDepositLastReminderAt: null,
    directDepositNotes: null,
    directDepositTriggeredByUserId: null,
    directDepositLastDeliveryMode: null,
    directDepositLastHrCopyIncluded: null,
    directDepositLastHrBccAddress: null,
    ...patch,
  };
}

function onboardingRecord(
  candidateId: string,
  patch: Partial<CandidateOnboardingRecord> = {},
): CandidateOnboardingRecord {
  return {
    onboardingId: `onb-${candidateId}`,
    candidateId,
    status: "pending_approval",
    paperworkComplete: false,
    readyForMel: false,
    createdAt: "2026-06-20T12:00:00.000Z",
    retryCount: 0,
    escalated: false,
    statusHistory: [{ at: "2026-06-20T12:00:00.000Z", status: "pending_approval" }],
    ...patch,
  };
}

describe("approval-queue-command-center", () => {
  it("scores high priority for strong grade, confidence, and aging", () => {
    const breezy = candidate("c-1");
    const wf = workflow("c-1", { assignedRecruiter: "Jordan Lee" });
    const row = buildScoredWorkflowRow(breezy, wf);
    row.aiGrade = "A+";
    row.actionConfidence = 0.9;
    row.matchPercent = 85;

    const scored = scoreApprovalPriority({
      row,
      queueAgeHours: 50,
      positionUrgency: "Critical",
      recruiterQueueCount: 120,
      hasDrift: false,
    });

    assert.equal(scored.priority, "high");
    assert.ok(scored.priorityScore >= 55);
  });

  it("builds recruiter rollups, aging buckets, and priority groups", () => {
    const rowA = buildScoredWorkflowRow(
      candidate("c-a", { firstName: "Aidan", lastName: "Collins" }),
      workflow("c-a", { assignedRecruiter: "Jordan Lee" }),
    );
    const rowB = buildScoredWorkflowRow(
      candidate("c-b", { firstName: "Mary", lastName: "Eckstine", email: "mary@example.com" }),
      workflow("c-b", { assignedRecruiter: "Unassigned" }),
    );
    rowB.aiGrade = "D";

    const snapshot = buildApprovalQueueCommandCenter({
      candidates: [rowA, rowB],
      onboardingRecords: [onboardingRecord("c-a"), onboardingRecord("c-b")],
      policy: DEFAULT_CANDIDATE_ONBOARDING_POLICY,
      fetchedAt: "2026-06-24T12:00:00.000Z",
    });

    assert.equal(snapshot.executiveSummary.totalQueue, 2);
    assert.equal(snapshot.recruiterRollups.length, 2);
    assert.equal(snapshot.candidatesByRecruiter.length, 2);
    assert.equal(
      snapshot.executiveSummary.agingBuckets.reduce((sum, bucket) => sum + bucket.count, 0),
      2,
    );
    assert.equal(
      snapshot.highPriority.length + snapshot.mediumPriority.length + snapshot.lowPriority.length,
      2,
    );
    assert.equal(snapshot.readOnly, true);
  });
});
