import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyCandidate } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { emptyRecruitingActions } from "@/lib/candidate-recruiting-actions";
import { DEFAULT_CANDIDATE_ONBOARDING_POLICY } from "@/lib/candidate-onboarding-engine/onboarding-policy-store";
import { canPromoteToPaperworkFunnel } from "@/lib/candidate-onboarding-engine/promote-paperwork-funnel";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import {
  P240_FRESH_NEW_REPLAY_ACTION_FIELDS,
  applyP240FreshNewReplayReset,
  resetToFreshNewState,
  validateP240FreshNewReset,
  simulateP240CandidatePath,
} from "@/lib/p240-autonomous-new-applicant-pipeline";
import { traceP65PromotionRules } from "@/lib/p241-p65-qualification-forensics";
import {
  P241_RECOVERABLE_REDACTED_IDS,
  P242_BASELINE_P240,
  P242_EXECUTION_MODE,
  P242_EXPECTED,
  P242_PHASE,
  buildP242CorrectedThroughput,
  buildP242Disposition,
  buildP242LiveProtectionCases,
  buildP242P241CaseValidations,
  p242RedactId,
} from "@/lib/p242-fresh-new-replay-reset";
import type { P240CandidateTrace, P240PipelineHealth, P240Throughput } from "@/lib/p240-autonomous-new-applicant-pipeline/types";

function wf(overrides: Partial<CandidateWorkflowRecord> = {}): CandidateWorkflowRecord {
  return {
    candidateId: "cand-1",
    workflowStatus: "Paperwork Sent",
    assignedRecruiter: "Taylor",
    assignedDM: "Mindie Rodriguez",
    notes: [],
    history: [],
    lastActionAt: "2026-07-20T19:55:00.000Z",
    nextActionNeeded: "Await Signature",
    recruitingActions: emptyRecruitingActions(),
    followUpDueAt: null,
    snoozedUntil: null,
    paperworkStatus: "sent",
    signatureRequestId: "sig-abc",
    paperworkTemplateKey: "tmpl",
    paperworkSentAt: "2026-07-20T19:55:00.000Z",
    paperworkViewedAt: null,
    paperworkViewCount: 1,
    paperworkSignedAt: null,
    paperworkError: null,
    onboardingContactEmail: "a@example.com",
    directDepositStatus: "not_requested",
    directDepositRequestedAt: null,
    directDepositLastReminderAt: null,
    directDepositNotes: null,
    directDepositTriggeredByUserId: null,
    directDepositLastDeliveryMode: null,
    directDepositLastHrCopyIncluded: null,
    directDepositLastHrBccAddress: null,
    updatedAt: "2026-07-20T19:55:00.000Z",
    actionType: "await-signature",
    requiredAction: "Await Signature",
    actionReason: "sent",
    actionDueDate: "2026-07-21",
    actionPriority: "high",
    actionConfidence: 90,
    actionGeneratedAt: "2026-07-20T19:55:00.000Z",
    recommendedStage: "Paperwork Sent",
    progressionReason: "packet",
    progressionConfidence: 80,
    progressionPriority: "high",
    progressionGeneratedAt: "2026-07-20T19:55:00.000Z",
    ...overrides,
  };
}

function cand(overrides: Partial<BreezyCandidate> = {}): BreezyCandidate {
  return {
    candidateId: "cand-1",
    firstName: "Test",
    lastName: "Applicant",
    email: "test@example.com",
    phone: "5550101234",
    stage: "Applied",
    source: "Indeed",
    appliedDate: "2026-07-20T12:00:00.000Z",
    addedDate: "2026-07-20T12:00:00.000Z",
    positionId: "pos-1",
    positionName: "Retail Merchandiser – Columbus, OH",
    city: "Columbus",
    state: "OH",
    zipCode: "43215",
    ...overrides,
  } as BreezyCandidate;
}

function stubTrace(overrides: Partial<P240CandidateTrace> = {}): P240CandidateTrace {
  return {
    candidateId: "cand-1",
    redactedCandidateId: "61244a24ba7e",
    displayName: "TOMMY EDWARD HARPER JR",
    cohortKind: "simulation_proxy_24h",
    appliedDate: "2026-07-20T17:41:59.315Z",
    city: "X",
    state: "OH",
    positionId: "p",
    positionName: "p",
    currentStage: "Paperwork Sent",
    paperworkStatus: "sent",
    assignedRecruiterBefore: "Taylor",
    assignedRecruiterSimulated: "Taylor",
    assignedDMBefore: "Trista Thomas",
    assignedDMSimulated: "Trista Thomas",
    nearestMiles: 0,
    coverageTier: "tier1_0_20",
    stepsCompleted: [
      "ingested",
      "recruiter_assigned",
      "dm_assigned",
      "qualified",
      "proximity_ok",
      "paperwork_needed",
      "dropbox_sign_simulated",
      "paperwork_sent_simulated",
    ],
    queueLocation: "would_send",
    outcome: "would_send",
    blocker: null,
    blockerDetail: null,
    nextAction: "ok",
    estimatedMinutesAppliedToPaperwork: 50,
    freshness: null,
    simulationNotes: [],
    ...overrides,
  };
}

describe("P242 constants", () => {
  it("is read-only dry-run validation phase", () => {
    assert.equal(P242_PHASE, "P242");
    assert.equal(P242_EXECUTION_MODE, "read_only_dry_run");
    assert.equal(P241_RECOVERABLE_REDACTED_IDS.size, 8);
    assert.equal(P242_EXPECTED.wouldSendCount, 13);
    assert.equal(P242_BASELINE_P240.wouldSendCount, 5);
  });

  it("redacts ids", () => {
    assert.equal(p242RedactId("abc").length, 12);
  });
});

describe("P242 replay reset action state", () => {
  it("replayed previously-sent candidate has fresh-arrival action state", () => {
    const original = wf();
    const frozen = structuredClone(original);
    const reset = applyP240FreshNewReplayReset(original);
    assert.equal(reset.workflowStatus, "Applied");
    assert.equal(reset.paperworkStatus, "not_sent");
    assert.equal(reset.signatureRequestId, null);
    assert.equal(reset.actionType, null);
    assert.equal(reset.requiredAction, null);
    assert.equal(reset.nextActionNeeded, "Review");
    assert.equal(reset.lastActionAt, null);
    assert.equal(reset.recommendedStage, null);
    assert.deepEqual(original, frozen);
  });

  it("stale await-signature does not survive replay", () => {
    const reset = applyP240FreshNewReplayReset(wf({ actionType: "await-signature" }));
    assert.notEqual(reset.actionType, "await-signature");
    assert.equal(reset.actionType, null);
  });

  it("stale send-paperwork does not survive replay", () => {
    const reset = applyP240FreshNewReplayReset(
      wf({
        workflowStatus: "Paperwork Needed",
        actionType: "send-paperwork",
        requiredAction: "Send Paperwork",
      }),
    );
    assert.notEqual(reset.actionType, "send-paperwork");
    assert.equal(reset.actionType, null);
    assert.equal(reset.requiredAction, null);
  });

  it("clears all documented action-related fields", () => {
    const reset = applyP240FreshNewReplayReset(wf());
    for (const field of P240_FRESH_NEW_REPLAY_ACTION_FIELDS) {
      if (field === "nextActionNeeded") {
        assert.equal(reset.nextActionNeeded, "Review");
      } else {
        assert.equal((reset as Record<string, unknown>)[field] ?? null, null, field);
      }
    }
  });

  it("comprehensive reset clears assignments and preserves Breezy id", () => {
    const original = wf({
      assignedRecruiter: "Taylor",
      assignedDM: "Mindie Rodriguez",
      recruiterAssignmentSource: "manual",
      notes: ["duplicate of cand-x", "coverage tier1 12 miles", "keep this note"],
    });
    const reset = resetToFreshNewState(original);
    assert.equal(reset.candidateId, original.candidateId);
    assert.equal(reset.assignedRecruiter, "Unassigned");
    assert.equal(reset.assignedDM, "Unassigned");
    assert.equal(reset.recruiterAssignmentSource, null);
    assert.ok(!reset.notes.some((n) => /duplicate/i.test(n)));
    assert.ok(!reset.notes.some((n) => /coverage/i.test(n)));
    assert.ok(reset.notes.includes("keep this note"));
    const validation = validateP240FreshNewReset({ before: original, after: reset });
    assert.equal(validation.hashMismatch, false);
    assert.deepEqual(validation.leftoverStaleFields, []);
  });

  it("live current-state evaluation still blocks active packet", () => {
    const row = buildScoredWorkflowRow(cand(), wf());
    const policy = {
      ...DEFAULT_CANDIDATE_ONBOARDING_POLICY,
      funnelPromotion: { enabled: true },
    };
    assert.equal(canPromoteToPaperworkFunnel(row, policy), false);
    const trace = traceP65PromotionRules(row, policy, "current_state");
    assert.equal(trace.firstFailedCheckId, "active_packet");
  });

  it("replay evaluation does not alter underlying candidate", async () => {
    const original = wf();
    const frozen = structuredClone(original);
    await simulateP240CandidatePath({
      candidateId: "cand-1",
      candidate: cand(),
      workflow: original,
      job: null,
      policy: { ...DEFAULT_CANDIDATE_ONBOARDING_POLICY, funnelPromotion: { enabled: true } },
      opportunityPoints: [],
      priorSent: new Set(),
      proposedRecruiter: "Taylor",
      recruiterConfidence: 90,
      emailOwners: new Map([["test@example.com", "cand-1"]]),
      cohortKind: "simulation_proxy_24h",
      replayAsFreshNew: true,
      allowNetworkGeocode: false,
      allowNetworkBreezyRefresh: false,
    });
    assert.deepEqual(original, frozen);
  });

  it("unrelated blockers are not removed by action clear alone", () => {
    // Missing phone remains a blocker even after action reset.
    const reset = applyP240FreshNewReplayReset(wf());
    assert.equal(reset.actionType, null);
    // Data-quality blockers are evaluated on the candidate record, not action fields.
    assert.ok(!canPromoteToPaperworkFunnel(
      // unassigned recruiter still blocks
      buildScoredWorkflowRow(cand(), { ...reset, assignedRecruiter: "Unassigned" }),
      { ...DEFAULT_CANDIDATE_ONBOARDING_POLICY, funnelPromotion: { enabled: true } },
    ));
  });
});

describe("P242 disposition + throughput helpers", () => {
  it("classifies dispositions and validates eight P241 cases clear", () => {
    const dispositions = [...P241_RECOVERABLE_REDACTED_IDS].map((id, i) =>
      buildP242Disposition({
        trace: stubTrace({
          candidateId: `id-${i}`,
          redactedCandidateId: id,
          displayName: `C${i}`,
          outcome: "would_send",
          blocker: null,
          queueLocation: "would_send",
        }),
        workflow: wf({ actionType: i % 2 === 0 ? "await-signature" : "send-paperwork" }),
      }),
    );
    const validations = buildP242P241CaseValidations(dispositions);
    assert.equal(validations.length, 8);
    assert.ok(validations.every((v) => v.actionTypeBlocksPromotionCleared));
    assert.ok(validations.every((v) => v.unlocksWouldSend));
    assert.equal(dispositions.filter((d) => d.wasP241QualificationFailure).length, 8);
  });

  it("projects corrected throughput vs P241 expected", () => {
    const throughput = {
      phase: "P240",
      generatedAt: new Date().toISOString(),
      lookbackDays: 14,
      simulationHorizonHours: 24,
      arrivalsLast14Days: 244,
      estimatedDailyArrivalRate: 17.4,
      projectedArrivalsNext24h: 17,
      proxyCohortSize: 17,
      wouldReachPnCount: 13,
      wouldSendCount: 13,
      blockedCount: 4,
      protectedSkipCount: 0,
      autoClearRatePct: 76.5,
      estimatedDailyThroughputToPn: 13.3,
      estimatedDailyThroughputToSent: 13.3,
      averageMinutesAppliedToPaperwork: 50,
      averageHoursAppliedToPaperwork: 0.83,
      bottleneckBreakdown: [
        { blocker: "manual_review_40_60", count: 2, pct: 50 },
        { blocker: "duplicate_identity", count: 1, pct: 25 },
        { blocker: "missing_phone", count: 1, pct: 25 },
      ],
    } as P240Throughput;
    const health = {
      phase: "P240",
      generatedAt: throughput.generatedAt,
      healthScore: 83,
      grade: "B",
      goNoGo: "CONDITIONAL-GO",
      goNoGoReason: "conditions",
      dryRunConfirmed: true,
      durableWrites: 0,
      dropboxSignCalls: 0,
      stageChanges: 0,
      recruiterOwnershipChanges: 0,
      dmAssignmentChanges: 0,
      strengths: [],
      risks: [],
      recommendedNextSteps: [],
    } as P240PipelineHealth;
    const corrected = buildP242CorrectedThroughput({ throughput, health });
    assert.equal(corrected.matchesExpected, true);
    assert.equal(corrected.corrected.wouldSendCount, 13);
    assert.equal(corrected.corrected.goNoGo, "GO_WITH_CONDITIONS");
  });

  it("live protection cases all pass when flags true", () => {
    const cases = buildP242LiveProtectionCases({
      liveActivePacketStillBlocks: true,
      liveAlreadySentStillProtected: true,
      replayDoesNotMutateSource: true,
      canPromoteStillChecksActionType: true,
      activePacketPredicateUnchanged: true,
    });
    assert.equal(cases.length, 5);
    assert.ok(cases.every((c) => c.passed));
  });
});
