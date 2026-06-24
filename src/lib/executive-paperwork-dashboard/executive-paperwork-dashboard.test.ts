import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyCandidate } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { emptyRecruitingActions } from "@/lib/candidate-recruiting-actions";
import { DEFAULT_CANDIDATE_ONBOARDING_POLICY } from "@/lib/candidate-onboarding-engine/onboarding-policy-store";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { buildExecutivePaperworkDashboard } from "@/lib/executive-paperwork-dashboard/build-executive-paperwork-dashboard";
import {
  classifyPaperworkStage,
  detectPaperworkDrift,
} from "@/lib/executive-paperwork-dashboard/classify-paperwork-stage";

function candidate(id: string): BreezyCandidate {
  return {
    candidateId: id,
    firstName: "Mary",
    lastName: "Eckstine",
    email: "mary@example.com",
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
    onboardingId: "onb-1",
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

describe("executive-paperwork-dashboard", () => {
  it("classifies approval queue from onboarding pending_approval", () => {
    const breezy = candidate("c-1");
    const wf = workflow("c-1", { workflowStatus: "Paperwork Needed" });
    const row = buildScoredWorkflowRow(breezy, wf);
    const stage = classifyPaperworkStage({
      row,
      onboarding: onboardingRecord("c-1"),
    });
    assert.equal(stage, "approvalQueue");
  });

  it("prioritizes failed over approval queue", () => {
    const breezy = candidate("c-2");
    const wf = workflow("c-2", { paperworkStatus: "failed", paperworkError: "Dropbox error" });
    const row = buildScoredWorkflowRow(breezy, wf);
    const stage = classifyPaperworkStage({
      row,
      onboarding: onboardingRecord("c-2", { status: "pending_approval" }),
    });
    assert.equal(stage, "failed");
  });

  it("detects drift when workflow sent but onboarding pending approval", () => {
    const breezy = candidate("c-3");
    const wf = workflow("c-3", {
      workflowStatus: "Paperwork Sent",
      paperworkStatus: "sent",
      signatureRequestId: "sig-abc",
      paperworkSentAt: "2026-06-21T10:00:00.000Z",
    });
    const row = buildScoredWorkflowRow(breezy, wf);
    const drift = detectPaperworkDrift({
      row,
      onboarding: onboardingRecord("c-3", {
        status: "pending_approval",
        signatureRequestId: "sig-abc",
      }),
    });
    assert.equal(drift.hasDrift, true);
    assert.equal(drift.sourceOfTruth, "workflow");
  });

  it("builds dashboard with KPI strip, recruiter rollup, and drift rows", () => {
    const breezyA = candidate("c-a");
    const breezyB = candidate("c-b");
    breezyB.firstName = "Alex";
    breezyB.lastName = "Kim";
    breezyB.candidateId = "c-b";

    const rowA = buildScoredWorkflowRow(
      breezyA,
      workflow("c-a", { assignedRecruiter: "Jordan Lee" }),
    );
    const rowB = buildScoredWorkflowRow(
      breezyB,
      workflow("c-b", {
        assignedRecruiter: "Jordan Lee",
        workflowStatus: "Paperwork Sent",
        paperworkStatus: "sent",
        signatureRequestId: "sig-sent",
        paperworkSentAt: "2026-06-21T10:00:00.000Z",
      }),
    );

    const dashboard = buildExecutivePaperworkDashboard({
      candidates: [rowA, rowB],
      onboardingRecords: [
        onboardingRecord("c-a"),
        onboardingRecord("c-b", {
          status: "pending_approval",
          signatureRequestId: "sig-sent",
        }),
      ],
      policy: DEFAULT_CANDIDATE_ONBOARDING_POLICY,
      fetchedAt: "2026-06-22T12:00:00.000Z",
    });

    assert.equal(dashboard.kpiStrip.approvalQueue, 1);
    assert.equal(dashboard.kpiStrip.sent, 1);
    assert.equal(dashboard.kpiStrip.driftCount, 1);
    assert.equal(dashboard.approvalQueueRecruiterRollup[0]?.recruiter, "Jordan Lee");
    assert.equal(dashboard.approvalQueueRecruiterRollup[0]?.count, 1);
    assert.equal(dashboard.driftRows.length, 1);
    assert.equal(dashboard.stages.find((stage) => stage.id === "approvalQueue")?.label, "Approval Queue");

    const approvalRow = dashboard.stages.find((stage) => stage.id === "approvalQueue")?.rows[0];
    assert.equal(approvalRow?.approvalStatus, "pending");
  });
});
