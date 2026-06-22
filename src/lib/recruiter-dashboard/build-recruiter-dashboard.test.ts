import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyCandidate } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { emptyRecruitingActions } from "@/lib/candidate-recruiting-actions";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { buildRecruiterDashboardSnapshot } from "@/lib/recruiter-dashboard";

const REF = Date.parse("2026-05-21T12:00:00.000Z");

function sample(id: string): BreezyCandidate {
  return {
    candidateId: id,
    firstName: "Pat",
    lastName: "Lee",
    email: "pat@example.com",
    phone: "",
    source: "Indeed",
    stage: "Applied",
    appliedDate: "2026-05-20",
    createdDate: "2026-05-20",
    addedDate: "2026-05-20",
    updatedDate: "2026-05-20",
    addedDateSource: "creation_date",
    positionId: "p1",
    positionName: "Merchandiser",
    city: "Austin",
    state: "TX",
    zipCode: "78701",
    resumeText: "",
    hasResume: false,
  };
}

function wf(id: string, patch: Partial<CandidateWorkflowRecord> = {}): CandidateWorkflowRecord {
  return {
    candidateId: id,
    workflowStatus: patch.workflowStatus ?? "Applied",
    assignedRecruiter: patch.assignedRecruiter ?? "Taylor Custenborder",
    assignedDM: patch.assignedDM ?? "Unassigned",
    notes: patch.notes ?? [],
    history: patch.history ?? [],
    lastActionAt: patch.lastActionAt ?? null,
    nextActionNeeded: patch.nextActionNeeded ?? "Review",
    recruitingActions: patch.recruitingActions ?? emptyRecruitingActions(),
    followUpDueAt: patch.followUpDueAt ?? null,
    snoozedUntil: patch.snoozedUntil ?? null,
    paperworkStatus: patch.paperworkStatus ?? "none",
    signatureRequestId: patch.signatureRequestId ?? null,
    paperworkTemplateKey: patch.paperworkTemplateKey ?? null,
    paperworkSentAt: patch.paperworkSentAt ?? null,
    paperworkSignedAt: patch.paperworkSignedAt ?? null,
    paperworkError: patch.paperworkError ?? null,
    directDepositStatus: patch.directDepositStatus ?? "not_requested",
    directDepositRequestedAt: patch.directDepositRequestedAt ?? null,
    directDepositLastReminderAt: patch.directDepositLastReminderAt ?? null,
    directDepositNotes: patch.directDepositNotes ?? null,
    directDepositTriggeredByUserId: patch.directDepositTriggeredByUserId ?? null,
    directDepositLastDeliveryMode: patch.directDepositLastDeliveryMode ?? null,
    directDepositLastHrCopyIncluded: patch.directDepositLastHrCopyIncluded ?? null,
    directDepositLastHrBccAddress: patch.directDepositLastHrBccAddress ?? null,
    updatedAt: patch.updatedAt ?? new Date(REF).toISOString(),
  };
}

describe("recruiter-dashboard", () => {
  it("builds today must-do items for owned overdue candidates", () => {
    const overdue = buildScoredWorkflowRow(
      sample("od"),
      wf("od", {
        followUpDueAt: "2026-05-19T00:00:00.000Z",
        recruitingActions: {
          ...emptyRecruitingActions(),
          needsFollowUp: true,
          updatedAt: new Date(REF).toISOString(),
        },
      }),
    );
    const other = buildScoredWorkflowRow(
      sample("other"),
      wf("other", { assignedRecruiter: "Someone Else" }),
    );

    const snapshot = buildRecruiterDashboardSnapshot({
      candidates: [overdue, other],
      actingRecruiter: "Taylor Custenborder",
      referenceMs: REF,
    });

    const overdueItem = snapshot.today.find((item) => item.id === "overdue-follow-ups");
    assert.equal(overdueItem?.count, 1);
    assert.ok(snapshot.pipeline.length, 6);
    assert.equal(snapshot.dailyPlan.length > 0, true);
  });
});
