import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyCandidate } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { emptyRecruitingActions } from "@/lib/candidate-recruiting-actions";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import {
  isP158TransitionProductionReady,
  isP158WorkflowTransitionEnabled,
} from "@/lib/p158-post-assignment-workflow-transition/transition-config";
import { evaluateTransitionEligibility } from "@/lib/p158-post-assignment-workflow-transition/transition-rules";

function sample(): BreezyCandidate {
  return {
    candidateId: "c1",
    firstName: "Sam",
    lastName: "Chen",
    email: "sam@example.com",
    phone: "",
    source: "Indeed",
    stage: "Applied",
    appliedDate: "2026-06-10",
    createdDate: "2026-06-10",
    addedDate: "2026-06-10",
    updatedDate: "2026-06-10",
    addedDateSource: "creation_date",
    positionId: "job-1",
    positionName: "Merchandiser",
    city: "Austin",
    state: "TX",
    zipCode: "78701",
    resumeText: "resume",
    hasResume: true,
  };
}

function wf(patch: Partial<CandidateWorkflowRecord> = {}): CandidateWorkflowRecord {
  return {
    candidateId: "c1",
    workflowStatus: patch.workflowStatus ?? "Applied",
    assignedRecruiter: patch.assignedRecruiter ?? "Alex",
    assignedDM: patch.assignedDM ?? "DM Texas",
    notes: patch.notes ?? [],
    history: patch.history ?? [],
    lastActionAt: patch.lastActionAt ?? null,
    nextActionNeeded: patch.nextActionNeeded ?? "Review",
    recruitingActions: patch.recruitingActions ?? emptyRecruitingActions(),
    followUpDueAt: patch.followUpDueAt ?? null,
    snoozedUntil: patch.snoozedUntil ?? null,
    paperworkStatus: patch.paperworkStatus ?? "not_sent",
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
    updatedAt: new Date().toISOString(),
    actionType: patch.actionType ?? "screen-candidate",
  };
}

describe("P158.3 transition config", () => {
  it("disables transition by default", () => {
    assert.equal(isP158WorkflowTransitionEnabled({}), false);
    assert.equal(
      isP158TransitionProductionReady({
        confirmAssignment: true,
        confirmTransition: true,
        env: { P158_AUTOMATIC_ASSIGNMENTS_ENABLED: "false", P158_WORKFLOW_TRANSITION_ENABLED: "false" },
      }),
      false,
    );
  });

  it("requires all production confirmations", () => {
    assert.equal(
      isP158TransitionProductionReady({
        confirmAssignment: true,
        confirmTransition: true,
        env: {
          P158_AUTOMATIC_ASSIGNMENTS_ENABLED: "true",
          P158_WORKFLOW_TRANSITION_ENABLED: "true",
        },
      }),
      true,
    );
    assert.equal(
      isP158TransitionProductionReady({
        confirmAssignment: true,
        confirmTransition: false,
        env: {
          P158_AUTOMATIC_ASSIGNMENTS_ENABLED: "true",
          P158_WORKFLOW_TRANSITION_ENABLED: "true",
        },
      }),
      false,
    );
  });
});

describe("P158.3 transition rules", () => {
  it("allows transition when recruiter, DM, and safety checks pass", () => {
    const row = buildScoredWorkflowRow(sample(), wf());
    const result = evaluateTransitionEligibility({
      row,
      candidate: sample(),
      workflow: wf(),
      onboarding: null,
      auditEvents: [],
    });
    assert.equal(result.eligible, true);
    assert.equal(result.blocked, false);
  });

  it("blocks unassigned recruiter", () => {
    const row = buildScoredWorkflowRow(sample(), wf({ assignedRecruiter: "Unassigned" }));
    const result = evaluateTransitionEligibility({
      row,
      candidate: sample(),
      workflow: wf({ assignedRecruiter: "Unassigned" }),
      onboarding: null,
      auditEvents: [],
    });
    assert.equal(result.eligible, false);
    assert.ok(result.blockers.some((b) => /recruiter/i.test(b)));
  });

  it("never overwrites paperwork sent state", () => {
    const row = buildScoredWorkflowRow(
      sample(),
      wf({ workflowStatus: "Paperwork Sent", paperworkStatus: "sent" }),
    );
    const result = evaluateTransitionEligibility({
      row,
      candidate: sample(),
      workflow: wf({ workflowStatus: "Paperwork Sent", paperworkStatus: "sent" }),
      onboarding: null,
      auditEvents: [],
    });
    assert.equal(result.eligible, false);
    assert.equal(result.blocked, true);
  });

  it("blocks explicit manual review flag", () => {
    const row = buildScoredWorkflowRow(sample(), wf({ workflowStatus: "Needs Review" }));
    const result = evaluateTransitionEligibility({
      row,
      candidate: sample(),
      workflow: wf({ workflowStatus: "Needs Review" }),
      onboarding: null,
      auditEvents: [],
    });
    assert.equal(result.eligible, false);
    assert.ok(result.blockers.some((b) => /manual review/i.test(b)));
  });

  it("skips already transitioned candidates", () => {
    const row = buildScoredWorkflowRow(
      sample(),
      wf({ workflowStatus: "Paperwork Needed", actionType: "send-paperwork" }),
    );
    const result = evaluateTransitionEligibility({
      row,
      candidate: sample(),
      workflow: wf({ workflowStatus: "Paperwork Needed", actionType: "send-paperwork" }),
      onboarding: null,
      auditEvents: [],
    });
    assert.equal(result.alreadyTransitioned, true);
    assert.equal(result.eligible, false);
  });
});
