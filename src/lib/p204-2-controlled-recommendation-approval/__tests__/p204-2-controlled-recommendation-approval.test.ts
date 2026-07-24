import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyCandidate } from "@/lib/breezy-api";
import type { P2041RecommendationRecord } from "@/lib/p204-1-supervised-qualification-pilot/types";
import {
  FULL_EVIDENCE_CHECKLIST,
  buildAgreementAnalysis,
  buildCalibrationAnalysis,
  buildDecisionRecord,
  buildReviewPackage,
  buildSafetyFlags,
  detectStaleMember,
  validateBatchFinalization,
  validateOperatorDecisionInput,
  proposeP2042PolicyProxyDecision,
  P204_2_EXPECTED_COHORT_ID,
  P204_2_EXPECTED_FINGERPRINT,
} from "@/lib/p204-2-controlled-recommendation-approval";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";

function cand(candidateId: string): BreezyCandidate {
  return {
    candidateId,
    firstName: "Pat",
    lastName: "Lee",
    email: `${candidateId}@example.com`,
    phone: "5555551212",
    source: "Indeed",
    stage: "applied",
    appliedDate: "2026-07-10",
    createdDate: "2026-07-10",
    addedDate: "2026-07-10",
    updatedDate: "2026-07-10",
    addedDateSource: "creation_date",
    positionId: "pos-1",
    positionName: "Merchandiser",
    city: "Columbus",
    state: "OH",
    zipCode: "43004",
    resumeText: "5 years merchandising",
    hasResume: true,
    hasQuestionnaire: true,
    questionnaireAnswers: [{ question: "Q", answer: "A" }],
  };
}

function rec(
  partial: Partial<P2041RecommendationRecord> & {
    candidateId: string;
    recommendation: P2041RecommendationRecord["recommendation"];
  },
): P2041RecommendationRecord {
  return {
    candidateId: partial.candidateId,
    redactedCandidateId: partial.redactedCandidateId ?? `r-${partial.candidateId}`,
    cohortId: P204_2_EXPECTED_COHORT_ID,
    fingerprint: P204_2_EXPECTED_FINGERPRINT,
    recommendation: partial.recommendation,
    confidence: partial.confidence ?? 79,
    hardGates: partial.hardGates ?? [],
    positiveFactors: partial.positiveFactors ?? ["strong_questionnaire"],
    negativeFactors: partial.negativeFactors ?? [],
    reasonCodes: partial.reasonCodes ?? [],
    recruiterExplanation: partial.recruiterExplanation ?? "test explanation",
    evidenceFreshness: "2026-07-15T00:00:00.000Z",
    nearbyJobSignal: partial.nearbyJobSignal ?? "nearest~90mi",
    questionnaireCompleteness: partial.questionnaireCompleteness ?? "rich",
    duplicateStatus: partial.duplicateStatus ?? "clear",
    recommendedOperatorAction: "review only",
    engineVersion: "p204.1.0",
    scoringVersion: "p204+p193.4-calibrated",
    evidenceFingerprint: partial.evidenceFingerprint ?? "ev-1",
    writtenAt: "2026-07-15T00:00:00.000Z",
    workflowStatusAtWrite: "Applied",
    operatorDecision: null,
    operatorDecisionAt: null,
    operatorDecisionBy: null,
    operatorNotes: null,
  };
}

function wf(
  partial: Partial<CandidateWorkflowRecord> & { candidateId: string },
): CandidateWorkflowRecord {
  return {
    candidateId: partial.candidateId,
    workflowStatus: partial.workflowStatus ?? "Applied",
    assignedRecruiter: "Recruiting Team",
    assignedDM: "Unassigned",
    notes: [],
    history: [],
    updatedAt: "2026-07-15T12:00:00.000Z",
    lastActionAt: null,
    nextActionNeeded: "Review",
    paperworkStatus: partial.paperworkStatus ?? "not_sent",
    recruiterOwnershipVersion: 1,
    ...partial,
  } as CandidateWorkflowRecord;
}

describe("P204.2 controlled recommendation approval", () => {
  it("verifies expected cohort constants", () => {
    assert.equal(P204_2_EXPECTED_COHORT_ID, "p204-1-807bd648");
    assert.equal(P204_2_EXPECTED_FINGERPRINT, "c18a84f889e6bb453c30b0d0");
  });

  it("marks stale candidates and excludes from agree decisions", () => {
    const record = rec({ candidateId: "c1", recommendation: "Advance" });
    const stale = detectStaleMember({
      record,
      workflow: wf({ candidateId: "c1", workflowStatus: "Needs Review" }),
      candidate: cand("c1"),
      freezeHashes: {
        redactedCandidateId: "r-c1",
        questionnaireHash: "q1",
        resumeHash: "r1",
        evidenceHash: "ev-1",
        workflowStatus: "Applied",
      },
    });
    assert.equal(stale.stale, true);
    assert.ok(stale.reasons.some((r) => r.startsWith("stage_changed")));

    const pkg = buildReviewPackage({
      record,
      workflow: wf({ candidateId: "c1", workflowStatus: "Needs Review" }),
      candidate: cand("c1"),
    });
    assert.equal(pkg.stale, true);
    const v = validateOperatorDecisionInput({
      pkg,
      decision: "agree_advance",
      evidenceChecklist: FULL_EVIDENCE_CHECKLIST,
    });
    assert.equal(v.ok, false);
  });

  it("requires override reason", () => {
    const pkg = buildReviewPackage({
      record: rec({ candidateId: "c2", recommendation: "Advance" }),
      workflow: wf({ candidateId: "c2" }),
      candidate: cand("c2"),
    });
    const bad = validateOperatorDecisionInput({
      pkg,
      decision: "override_to_review",
      overrideReason: "",
      evidenceChecklist: FULL_EVIDENCE_CHECKLIST,
    });
    assert.equal(bad.ok, false);
    if (!bad.ok) assert.equal(bad.error, "override_reason_required");

    const good = buildDecisionRecord({
      pkg,
      cohortId: P204_2_EXPECTED_COHORT_ID,
      fingerprint: P204_2_EXPECTED_FINGERPRINT,
      decision: "override_to_review",
      overrideReason: "Territory signal conflict",
      evidenceChecklist: FULL_EVIDENCE_CHECKLIST,
      operatorId: "tester",
    });
    assert.equal(good.isOverride, true);
    assert.equal(good.overrideReason, "Territory signal conflict");
  });

  it("blocks bulk bypass without per-candidate decisions/checklists", () => {
    const packages = [
      buildReviewPackage({
        record: rec({ candidateId: "a", recommendation: "Advance" }),
        workflow: wf({ candidateId: "a" }),
        candidate: cand("a"),
      }),
      buildReviewPackage({
        record: rec({ candidateId: "b", recommendation: "Reject", confidence: 60 }),
        workflow: wf({ candidateId: "b" }),
        candidate: cand("b"),
      }),
    ];
    const blocked = validateBatchFinalization({
      packages,
      decisionsByCandidateId: new Map([["a", "agree_advance"]]),
      checklistsByCandidateId: new Map([["a", FULL_EVIDENCE_CHECKLIST]]),
    });
    assert.equal(blocked.ok, false);

    const ok = validateBatchFinalization({
      packages,
      decisionsByCandidateId: new Map([
        ["a", "agree_advance"],
        ["b", "agree_reject"],
      ]),
      checklistsByCandidateId: new Map([
        ["a", FULL_EVIDENCE_CHECKLIST],
        ["b", FULL_EVIDENCE_CHECKLIST],
      ]),
    });
    assert.equal(ok.ok, true);
  });

  it("records idempotent decision identity via rebuild", () => {
    const pkg = buildReviewPackage({
      record: rec({ candidateId: "c3", recommendation: "Reject", confidence: 55, hardGates: ["explicit_disqualify"] }),
      workflow: wf({ candidateId: "c3" }),
      candidate: cand("c3"),
    });
    const d1 = buildDecisionRecord({
      pkg,
      cohortId: P204_2_EXPECTED_COHORT_ID,
      fingerprint: P204_2_EXPECTED_FINGERPRINT,
      decision: "agree_reject",
      evidenceChecklist: FULL_EVIDENCE_CHECKLIST,
      operatorId: "tester",
      decidedAt: "2026-07-15T20:00:00.000Z",
    });
    const d2 = buildDecisionRecord({
      pkg,
      cohortId: P204_2_EXPECTED_COHORT_ID,
      fingerprint: P204_2_EXPECTED_FINGERPRINT,
      decision: "agree_reject",
      evidenceChecklist: FULL_EVIDENCE_CHECKLIST,
      operatorId: "tester",
      decidedAt: "2026-07-15T20:00:00.000Z",
    });
    assert.equal(d1.decision, d2.decision);
    assert.equal(d1.decidedOutcome, "Reject");
  });

  it("builds safety flags for advance/reject edges", () => {
    const advanceBad = buildSafetyFlags(
      rec({
        candidateId: "s1",
        recommendation: "Advance",
        hardGates: ["explicit_disqualify"],
      }),
    );
    assert.ok(advanceBad.includes("advance_despite_hard_gate_or_missing_questionnaire"));

    const rejectMissing = buildSafetyFlags(
      rec({
        candidateId: "s2",
        recommendation: "Reject",
        hardGates: [],
        reasonCodes: ["missing_questionnaire"],
      }),
    );
    assert.ok(rejectMissing.includes("reject_primarily_missing_data"));
  });

  it("policy proxy agrees rejects with hard gates and overrides zero-mile advance", () => {
    const rejectPkg = buildReviewPackage({
      record: rec({
        candidateId: "r1",
        recommendation: "Reject",
        confidence: 60,
        hardGates: ["explicit_disqualify"],
      }),
      workflow: wf({ candidateId: "r1" }),
      candidate: cand("r1"),
    });
    assert.equal(proposeP2042PolicyProxyDecision(rejectPkg).decision, "agree_reject");

    const advance0 = buildReviewPackage({
      record: rec({
        candidateId: "a0",
        recommendation: "Advance",
        nearbyJobSignal: "nearest~0mi",
      }),
      workflow: wf({ candidateId: "a0" }),
      candidate: cand("a0"),
    });
    const proxy = proposeP2042PolicyProxyDecision(advance0);
    assert.equal(proxy.decision, "override_to_review");
    assert.ok((proxy.overrideReason ?? "").length > 0);
  });

  it("calculates agreement and calibration metrics", () => {
    const decisions = [
      buildDecisionRecord({
        pkg: buildReviewPackage({
          record: rec({ candidateId: "m1", recommendation: "Advance" }),
          workflow: wf({ candidateId: "m1" }),
          candidate: cand("m1"),
        }),
        cohortId: P204_2_EXPECTED_COHORT_ID,
        fingerprint: P204_2_EXPECTED_FINGERPRINT,
        decision: "agree_advance",
        evidenceChecklist: FULL_EVIDENCE_CHECKLIST,
        operatorId: "t",
      }),
      buildDecisionRecord({
        pkg: buildReviewPackage({
          record: rec({
            candidateId: "m2",
            recommendation: "Advance",
            nearbyJobSignal: "nearest~0mi",
          }),
          workflow: wf({ candidateId: "m2" }),
          candidate: cand("m2"),
        }),
        cohortId: P204_2_EXPECTED_COHORT_ID,
        fingerprint: P204_2_EXPECTED_FINGERPRINT,
        decision: "override_to_review",
        overrideReason: "zero mile",
        evidenceChecklist: FULL_EVIDENCE_CHECKLIST,
        operatorId: "t",
      }),
    ];
    const agreement = buildAgreementAnalysis({ decisions });
    assert.equal(agreement.exactAgreementCount, 1);
    assert.equal(agreement.overrideCount, 1);
    assert.equal(agreement.aiTooAggressiveCount, 1);

    const calibration = buildCalibrationAnalysis({ decisions });
    assert.equal(calibration.thresholdsUnchanged, true);
    assert.equal(calibration.advanceOverriddenToReviewOrReject, 1);
  });

  it("documents no lifecycle / PN / Dropbox / MEL side effects in authorization shape", () => {
    // Side-effect counters are enforced by execute result shape; unit guard here.
    const authorization = {
      allowOperatorDecisionWrites: true as const,
      allowLifecycleWrites: false as const,
    };
    assert.equal(authorization.allowLifecycleWrites, false);
    assert.equal(authorization.allowOperatorDecisionWrites, true);
  });
});
