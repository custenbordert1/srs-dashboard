import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyCandidate } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { emptyRecruitingActions } from "@/lib/candidate-recruiting-actions";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import {
  compareRecruiterActionPriority,
  scoreApprovalQueuePriority,
  scoreInboxPriority,
  scoreQueuePriority,
  scoreRecruiterWorkItemPriority,
} from "@/lib/recruiter-priority";
import { buildCandidateSlaSnapshot } from "@/lib/candidate-action-sla";

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
    workflowStatus: "Applied",
    assignedRecruiter: "Jordan Lee",
    assignedDM: "DM South",
    notes: [],
    history: [],
    lastActionAt: null,
    nextActionNeeded: "Screen candidate",
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

describe("recruiter-priority", () => {
  const ref = Date.parse("2026-06-25T12:00:00.000Z");

  it("scoreQueuePriority matches legacy computePriorityScore shape", () => {
    const row = buildScoredWorkflowRow(candidate("c1"), workflow("c1", { workflowStatus: "Needs Review" }));
    const sla = buildCandidateSlaSnapshot({
      appliedDate: row.appliedDate,
      workflowStatus: row.workflowStatus,
      lastActionAt: row.lastActionAt,
      recruitingActions: row.recruitingActions,
      followUpDueAt: row.followUpDueAt,
      snoozedUntil: row.snoozedUntil,
      referenceMs: ref,
    });
    const result = scoreQueuePriority({ row, sla });
    assert.ok(result.priorityScore > 0);
    assert.ok(result.priorityReasons.length > 0);
    assert.ok(["high", "medium", "low"].includes(result.priorityLevel));
  });

  it("scoreApprovalQueuePriority uses approval thresholds", () => {
    const row = buildScoredWorkflowRow(
      candidate("c2", { stage: "Paperwork Needed" }),
      workflow("c2", { workflowStatus: "Paperwork Needed" }),
    );
    const result = scoreApprovalQueuePriority({
      row,
      queueAgeHours: 80,
      positionUrgency: "Critical",
      recruiterQueueCount: 60,
    });
    assert.equal(result.priorityLevel, "high");
    assert.ok(result.priorityReasons.some((reason) => reason.includes("Critical")));
  });

  it("scoreInboxPriority boosts paperwork-ready candidates", () => {
    const row = buildScoredWorkflowRow(candidate("c3"), workflow("c3"));
    const withPaperwork = scoreInboxPriority({ sectionScore: 5, row: { ...row, candidateGrade: { ...row.candidateGrade, paperworkReady: true } } });
    const without = scoreInboxPriority({ sectionScore: 5, row });
    assert.ok(withPaperwork > without);
  });

  it("compareRecruiterActionPriority orders overdue before today before low", () => {
    const overdue = compareRecruiterActionPriority(
      { actionDueDate: "2026-06-20", actionPriority: "low", candidateId: "a" },
      { actionDueDate: "2026-06-25", actionPriority: "high", candidateId: "b" },
      ref,
    );
    assert.ok(overdue < 0);
  });

  it("scoreRecruiterWorkItemPriority is deterministic for same inputs", () => {
    const row = buildScoredWorkflowRow(candidate("c4"), workflow("c4", { workflowStatus: "Qualified" }));
    const sla = buildCandidateSlaSnapshot({
      appliedDate: row.appliedDate,
      workflowStatus: row.workflowStatus,
      lastActionAt: row.lastActionAt,
      recruitingActions: row.recruitingActions,
      followUpDueAt: row.followUpDueAt,
      snoozedUntil: row.snoozedUntil,
      referenceMs: ref,
    });
    const a = scoreRecruiterWorkItemPriority({
      row,
      sla,
      queueAgeHours: 30,
      positionUrgency: "At Risk",
      recruiterQueueCount: 25,
      actionDueDate: "2026-06-25",
      actionPriority: "high",
      referenceMs: ref,
    });
    const b = scoreRecruiterWorkItemPriority({
      row,
      sla,
      queueAgeHours: 30,
      positionUrgency: "At Risk",
      recruiterQueueCount: 25,
      actionDueDate: "2026-06-25",
      actionPriority: "high",
      referenceMs: ref,
    });
    assert.deepEqual(a, b);
  });
});
