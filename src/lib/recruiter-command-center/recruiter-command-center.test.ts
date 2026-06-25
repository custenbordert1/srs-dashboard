import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyCandidate } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { emptyRecruitingActions, markNeedsFollowUp } from "@/lib/candidate-recruiting-actions";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { buildRecruiterCommandCenter } from "@/lib/recruiter-command-center/build-recruiter-command-center";
import { assignRecruiterWorkCategory } from "@/lib/recruiter-command-center/score-recruiter-work-item";

const REFERENCE_MS = Date.parse("2026-06-25T12:00:00.000Z");
const FETCHED_AT = new Date(REFERENCE_MS).toISOString();

function breezy(id: string, patch: Partial<BreezyCandidate> = {}): BreezyCandidate {
  return {
    candidateId: id,
    firstName: "Sam",
    lastName: "Rivera",
    email: "sam@example.com",
    phone: "555-0100",
    source: "Indeed",
    stage: "Applied",
    appliedDate: "2026-06-24T10:00:00.000Z",
    createdDate: "2026-06-24T10:00:00.000Z",
    addedDate: "2026-06-24T10:00:00.000Z",
    updatedDate: "2026-06-24T10:00:00.000Z",
    addedDateSource: "creation_date",
    positionName: "Merchandiser",
    positionId: "pos-1",
    city: "Dallas",
    state: "TX",
    zipCode: "75001",
    hasResume: true,
    resumeText: "merchandising reset",
    ...patch,
  };
}

function wf(id: string, patch: Partial<CandidateWorkflowRecord> = {}): CandidateWorkflowRecord {
  return {
    candidateId: id,
    workflowStatus: "Applied",
    assignedRecruiter: "Taylor Custenborder",
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

describe("recruiter-command-center", () => {
  it("assigns exactly one category per candidate", () => {
    const row = buildScoredWorkflowRow(breezy("c1"), wf("c1", { workflowStatus: "Qualified" }));
    const category = assignRecruiterWorkCategory(row, null, false, REFERENCE_MS);
    assert.equal(category, "ready-for-interview");
  });

  it("buildRecruiterCommandCenter returns one row per active candidate", () => {
    const rows = [
      buildScoredWorkflowRow(breezy("c1"), wf("c1", { workflowStatus: "Applied" })),
      buildScoredWorkflowRow(breezy("c2"), wf("c2", { workflowStatus: "Qualified" })),
      buildScoredWorkflowRow(
        breezy("c3"),
        wf("c3", {
          workflowStatus: "Applied",
          recruitingActions: markNeedsFollowUp(emptyRecruitingActions(), REFERENCE_MS),
          followUpDueAt: "2026-06-20T12:00:00.000Z",
        }),
      ),
      buildScoredWorkflowRow(breezy("c4"), wf("c4", { workflowStatus: "Active Rep" })),
    ];

    const center = buildRecruiterCommandCenter({
      candidates: rows,
      fetchedAt: FETCHED_AT,
    });

    assert.equal(center.readOnly, true);
    assert.equal(center.workQueue.length, 3);
    assert.equal(new Set(center.workQueue.map((item) => item.candidateId)).size, 3);
    assert.ok(center.topPriorities.length <= 25);
    assert.equal(center.queueCounts.total, 3);
  });

  it("sorts deterministically by action urgency then priority score", () => {
    const rows = [
      buildScoredWorkflowRow(breezy("late"), wf("late", { workflowStatus: "Qualified" })),
      buildScoredWorkflowRow(
        breezy("overdue"),
        wf("overdue", {
          workflowStatus: "Applied",
          recruitingActions: markNeedsFollowUp(emptyRecruitingActions(), REFERENCE_MS),
          followUpDueAt: "2026-06-20T12:00:00.000Z",
        }),
      ),
    ];

    const first = buildRecruiterCommandCenter({ candidates: rows, fetchedAt: FETCHED_AT });
    const second = buildRecruiterCommandCenter({ candidates: rows, fetchedAt: FETCHED_AT });

    assert.deepEqual(
      first.workQueue.map((item) => item.candidateId),
      second.workQueue.map((item) => item.candidateId),
    );
    assert.equal(first.workQueue.length, 2);
  });

  it("filters by recruiter when requested", () => {
    const rows = [
      buildScoredWorkflowRow(breezy("a"), wf("a", { assignedRecruiter: "Jordan Lee" })),
      buildScoredWorkflowRow(breezy("b"), wf("b", { assignedRecruiter: "Taylor Custenborder" })),
    ];
    const center = buildRecruiterCommandCenter({
      candidates: rows,
      recruiterFilter: "Jordan Lee",
      fetchedAt: FETCHED_AT,
    });
    assert.equal(center.workQueue.length, 1);
    assert.equal(center.workQueue[0]?.recruiter, "Jordan Lee");
  });
});
