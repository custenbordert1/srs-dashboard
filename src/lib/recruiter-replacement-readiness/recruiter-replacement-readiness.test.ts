import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyCandidate } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { emptyRecruitingActions } from "@/lib/candidate-recruiting-actions";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { buildRecruiterReplacementReadiness } from "@/lib/recruiter-replacement-readiness/build-recruiter-replacement-readiness";
import { traceCandidateFunnelGate } from "@/lib/recruiter-replacement-readiness/trace-funnel-gates";

function candidate(id: string): BreezyCandidate {
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
  };
}

function workflow(id: string, patch: Partial<CandidateWorkflowRecord> = {}): CandidateWorkflowRecord {
  return {
    candidateId: id,
    workflowStatus: "Qualified",
    assignedRecruiter: "Unassigned",
    assignedDM: "Unassigned",
    notes: [],
    history: [],
    lastActionAt: null,
    nextActionNeeded: "Review",
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

describe("recruiter-replacement-readiness", () => {
  it("flags unassigned recruiter as first P62 failure", () => {
    const breezy = candidate("c-1");
    const wf = workflow("c-1");
    const row = buildScoredWorkflowRow(breezy, wf);
    const trace = traceCandidateFunnelGate({
      row,
      candidate: breezy,
      workflow: wf,
      jobsByPositionId: new Map([["pos-1", { jobId: "pos-1", name: "Merch", state: "GA" } as never]]),
    });
    assert.equal(trace.firstStageFailed, "p62_assignment");
    assert.equal(trace.failureReason, "recruiter_unassigned");
  });

  it("aggregates zero paperwork readiness when all unassigned", () => {
    const breezy = candidate("c-2");
    const wf = workflow("c-2");
    const row = buildScoredWorkflowRow(breezy, wf);
    const readiness = buildRecruiterReplacementReadiness({
      candidates: [breezy],
      rows: [row],
      workflows: { "c-2": wf },
      jobsByPositionId: new Map(),
    });
    assert.equal(readiness.audit.recruiterAssigned, 0);
    assert.equal(readiness.paperworkEligible, 0);
    assert.equal(readiness.blockers.blockedBeforeAssignment, 1);
    assert.equal(readiness.readinessScore.paperworkReadinessPct, 0);
  });
});
