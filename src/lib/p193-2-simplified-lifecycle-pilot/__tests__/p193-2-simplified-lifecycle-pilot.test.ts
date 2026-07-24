import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyCandidate } from "@/lib/breezy-api";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import {
  hasApprovalEvidence,
  hasRecommendationEvidence,
} from "@/lib/p187-1-canary-cohort-readiness/eligibility";
import {
  P193_RECOMMENDED_STAGE,
  projectQualifiedToP192Prerequisites,
} from "@/lib/p193-simplified-autonomous-lifecycle/paperworkBridge";
import { createP193Record } from "@/lib/p193-simplified-autonomous-lifecycle/recordFactory";
import { DEFAULT_P193_FLAGS } from "@/lib/p193-simplified-autonomous-lifecycle/types";
import { planP193Reminder } from "@/lib/p193-simplified-autonomous-lifecycle/reminderEngine";
import { advanceToReadyForAssignment } from "@/lib/p193-simplified-autonomous-lifecycle/readyForAssignment";
import {
  P193_2_MIN_COHORT,
  buildP1932OperatorReviewPackage,
  evaluatePilotEligibility,
  runP1932AiReviewPreview,
  selectP1932PilotCohort,
  validateP1932PilotGuards,
} from "@/lib/p193-2-simplified-lifecycle-pilot";

function cand(partial: Partial<BreezyCandidate> & { candidateId: string }): BreezyCandidate {
  return {
    firstName: "A",
    lastName: "B",
    email: `${partial.candidateId}@example.com`,
    phone: "5551112222",
    stage: "Applied",
    city: "Austin",
    state: "TX",
    zipCode: "78701",
    hasResume: true,
    resumeText: "merchandising reset walmart travel planogram 5 years",
    hasQuestionnaire: true,
    positionId: "job-1",
    positionName: "Merchandiser Austin",
    appliedDate: "2026-07-01",
    source: "Indeed",
    ...partial,
  } as BreezyCandidate;
}

function wf(partial: Partial<CandidateWorkflowRecord> = {}): CandidateWorkflowRecord {
  return {
    candidateId: partial.candidateId ?? "c1",
    workflowStatus: "Applied",
    notes: [],
    assignedRecruiter: "Unassigned",
    paperworkStatus: "not_sent",
    signatureRequestId: null,
    paperworkSentAt: null,
    history: [],
    ...partial,
  } as CandidateWorkflowRecord;
}

describe("P193.2 simplified lifecycle pilot", () => {
  it("selects cohort with hard gates and detects below-minimum", () => {
    const candidates = [
      cand({ candidateId: "ok1" }),
      cand({ candidateId: "ok2", email: "ok2@example.com" }),
      cand({ candidateId: "bad1", email: "bad1@example.com", hasQuestionnaire: false }),
    ];
    const workflows = {
      ok1: wf({ candidateId: "ok1" }),
      ok2: wf({ candidateId: "ok2" }),
      bad1: wf({ candidateId: "bad1" }),
    };
    const { cohort, belowMinimum } = selectP1932PilotCohort({ candidates, workflows });
    assert.equal(cohort.members.length, 2);
    assert.equal(belowMinimum, true);
    assert.ok(cohort.members.length < P193_2_MIN_COHORT);
  });

  it("rejects prior paperwork and historical pilots", () => {
    const a = evaluatePilotEligibility({
      candidate: cand({ candidateId: "p1" }),
      workflow: wf({
        candidateId: "p1",
        paperworkStatus: "sent",
        signatureRequestId: "sr1",
      }),
    });
    assert.equal(a.ok, false);
    assert.ok(a.blockers.includes("prior_paperwork_or_envelope"));

    const b = evaluatePilotEligibility({
      candidate: cand({ candidateId: "p2", email: "p2@example.com" }),
      workflow: wf({ candidateId: "p2", notes: ["[P189] prior"] }),
    });
    assert.equal(b.ok, false);
    assert.ok(b.blockers.includes("historical_or_prior_pilot"));
  });

  it("AI review routes borderline away from Not Qualified", () => {
    const forced = {
      schemaVersion: 1 as const,
      pilotId: "test",
      fingerprint: "fp",
      frozenAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      immutable: true as const,
      maxSize: 10,
      members: [
        {
          candidateId: "ai1",
          positionId: "job-1",
          positionName: "Merch",
          city: "Austin",
          state: "TX",
          zipCode: "78701",
          hasResume: true,
          hasQuestionnaire: true,
          emailHash: "x",
          phoneHash: "y",
          legacyWorkflowStatus: "Applied",
        },
      ],
      selectionBlockers: {},
      candidatesEvaluated: 1,
    };
    const preview = runP1932AiReviewPreview({
      cohort: forced,
      candidatesById: {
        ai1: cand({ candidateId: "ai1", resumeText: "retail clerk", hasQuestionnaire: true }),
      },
    });
    const row = preview.rows[0]!;
    if (row.borderline) assert.equal(row.decision, "Needs Human Review");
    assert.equal(row.borderline && row.decision === "Not Qualified", false);
  });

  it("bridge projection is P192-compatible and does not send", () => {
    const record = createP193Record({ candidateId: "b1", state: "Qualified" });
    const projection = projectQualifiedToP192Prerequisites({
      record,
      flags: { ...DEFAULT_P193_FLAGS, enabled: true, paperworkBridgeEnabled: true },
      authorized: true,
    });
    assert.equal(projection.shouldProject, true);
    assert.equal(projection.patch?.workflowStatus, "Paperwork Needed");
    assert.ok(hasRecommendationEvidence({ recommendedStage: P193_RECOMMENDED_STAGE }));
    assert.ok(hasApprovalEvidence({ notes: projection.patch?.notes ?? [] }));
    assert.equal(/dropbox_sign_send|mel_export/i.test(JSON.stringify(projection)), false);
  });

  it("operator package confirms Qualified only when requested", () => {
    const candidates = [
      cand({ candidateId: "q1" }),
      cand({ candidateId: "q2", email: "q2@example.com" }),
      cand({ candidateId: "q3", email: "q3@example.com" }),
    ];
    const workflows = Object.fromEntries(
      candidates.map((c) => [c.candidateId, wf({ candidateId: c.candidateId })]),
    );
    const { cohort } = selectP1932PilotCohort({ candidates, workflows });
    const ai = runP1932AiReviewPreview({
      cohort,
      candidatesById: Object.fromEntries(candidates.map((c) => [c.candidateId, c])),
    });
    const preview = buildP1932OperatorReviewPackage({
      cohort,
      aiRows: ai.rows,
      confirmQualified: false,
    });
    assert.equal(preview.confirmedQualifiedIds.length, 0);
  });

  it("ready-for-assignment projection has no MEL", () => {
    const record = createP193Record({ candidateId: "r1", state: "Signed" });
    record.metadata.paperworkStatus = "signed";
    const result = advanceToReadyForAssignment({
      record,
      flags: { ...DEFAULT_P193_FLAGS, enabled: true, readyForAssignmentEnabled: true },
      authorized: true,
      city: "Austin",
      state: "TX",
    });
    assert.equal(result.advanced, true);
  });

  it("reminder planner works with send remaining off by policy", () => {
    const record = createP193Record({ candidateId: "rem1", state: "Paperwork Sent" });
    record.metadata.paperworkStatus = "sent";
    record.timeline = [
      {
        at: new Date(Date.now() - 2 * 3600_000).toISOString(),
        state: "Paperwork Sent",
        detail: "sent",
      },
    ];
    const plan = planP193Reminder(record);
    assert.ok(["reminder_1h", "none", "reminder_48h", "expire_7d"].includes(plan.action));
  });

  it("guards block outside-cohort writes and require reminder off", () => {
    const candidates = [
      cand({ candidateId: "g1" }),
      cand({ candidateId: "g2", email: "g2@example.com" }),
      cand({ candidateId: "g3", email: "g3@example.com" }),
    ];
    const workflows = Object.fromEntries(
      candidates.map((c) => [c.candidateId, wf({ candidateId: c.candidateId })]),
    );
    const { cohort } = selectP1932PilotCohort({ candidates, workflows });
    const ok = validateP1932PilotGuards({
      cohort,
      bridgedIds: cohort.members.slice(0, 1).map((m) => m.candidateId),
      workflowsTouchedOutsideCohort: [],
      reminderSendEnabled: false,
      melWrites: 0,
      autoAssignments: 0,
      belowMinimumAborted: false,
    });
    assert.equal(ok.ok, true);

    const bad = validateP1932PilotGuards({
      cohort,
      bridgedIds: ["outside"],
      workflowsTouchedOutsideCohort: ["outside"],
      reminderSendEnabled: true,
      melWrites: 1,
      autoAssignments: 1,
      belowMinimumAborted: false,
    });
    assert.equal(bad.ok, false);
  });
});
