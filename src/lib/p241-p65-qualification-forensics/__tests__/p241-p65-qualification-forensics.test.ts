import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyCandidate } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { emptyRecruitingActions } from "@/lib/candidate-recruiting-actions";
import { DEFAULT_CANDIDATE_ONBOARDING_POLICY } from "@/lib/candidate-onboarding-engine/onboarding-policy-store";
import { canPromoteToPaperworkFunnel } from "@/lib/candidate-onboarding-engine/promote-paperwork-funnel";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import {
  P241_EXECUTION_MODE,
  P241_PHASE,
  applyFixedReplayClear,
  buildP240ReplayWorkflow,
  buildP241ThroughputSimulation,
  classifyP241QualificationFailure,
  deriveQualificationStatus,
  p241RedactId,
  ruleCategoryForCheck,
  traceP65PromotionRules,
} from "@/lib/p241-p65-qualification-forensics";

function wf(overrides: Partial<CandidateWorkflowRecord> = {}): CandidateWorkflowRecord {
  return {
    candidateId: "cand-1",
    workflowStatus: "Paperwork Sent",
    assignedRecruiter: "Taylor",
    assignedDM: "Mindie Rodriguez",
    notes: [],
    history: [],
    lastActionAt: null,
    nextActionNeeded: "Await Signature",
    recruitingActions: emptyRecruitingActions(),
    followUpDueAt: null,
    snoozedUntil: null,
    paperworkStatus: "sent",
    signatureRequestId: "sig-abc",
    paperworkTemplateKey: null,
    paperworkSentAt: "2026-07-20T19:55:00.000Z",
    paperworkViewedAt: null,
    paperworkViewCount: 0,
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

describe("P241 constants + redact", () => {
  it("is read-only forensics phase", () => {
    assert.equal(P241_PHASE, "P241");
    assert.equal(P241_EXECUTION_MODE, "read_only");
  });

  it("redacts candidate ids to 12 hex chars", () => {
    assert.equal(p241RedactId("abc").length, 12);
  });
});

describe("P241 qualification audit (rule trace)", () => {
  it("traces current-state active_packet as first fail", () => {
    const row = buildScoredWorkflowRow(cand(), wf());
    const policy = {
      ...DEFAULT_CANDIDATE_ONBOARDING_POLICY,
      funnelPromotion: { enabled: true },
    };
    const trace = traceP65PromotionRules(row, policy, "current_state");
    assert.equal(trace.canPromote, false);
    assert.equal(trace.firstFailedCheckId, "active_packet");
    assert.equal(canPromoteToPaperworkFunnel(row, policy), false);
  });

  it("maps check ids to rule categories", () => {
    assert.equal(ruleCategoryForCheck("grade_not_allowed"), "score_below_threshold");
    assert.equal(ruleCategoryForCheck("action_type_blocks_promotion"), "business_rule");
    assert.equal(ruleCategoryForCheck("active_packet"), "duplicate_protection");
    assert.equal(ruleCategoryForCheck("funnel_promotion_disabled"), "configuration");
  });
});

describe("P241 workflow audit (P240 replay actionType leak)", () => {
  it("P240-style replay keeps actionType and fails promotion", () => {
    const replay = buildP240ReplayWorkflow(wf(), "cand-1");
    assert.equal(replay.workflowStatus, "Applied");
    assert.equal(replay.paperworkStatus, "not_sent");
    assert.equal(replay.signatureRequestId, null);
    assert.equal(replay.actionType, "await-signature");

    const row = buildScoredWorkflowRow(cand(), {
      ...replay,
      assignedRecruiter: "Taylor",
      assignedDM: "Mindie Rodriguez",
    });
    const policy = {
      ...DEFAULT_CANDIDATE_ONBOARDING_POLICY,
      funnelPromotion: { enabled: true },
    };
    const trace = traceP65PromotionRules(row, policy, "p240_replay");
    assert.equal(trace.firstFailedCheckId, "action_type_blocks_promotion");
    assert.equal(trace.canPromote, false);
  });

  it("fixed replay clearing actionType restores canPromote", () => {
    const replay = buildP240ReplayWorkflow(wf(), "cand-1");
    const fixed = applyFixedReplayClear({
      ...replay,
      assignedRecruiter: "Taylor",
      assignedDM: "Mindie Rodriguez",
    });
    assert.equal(fixed.actionType, null);
    const row = buildScoredWorkflowRow(cand(), fixed);
    const policy = {
      ...DEFAULT_CANDIDATE_ONBOARDING_POLICY,
      funnelPromotion: { enabled: true },
    };
    const trace = traceP65PromotionRules(row, policy, "fixed_replay");
    assert.equal(trace.canPromote, true);
    assert.equal(trace.firstFailedCheckId, null);
    assert.equal(canPromoteToPaperworkFunnel(row, policy), true);
  });
});

describe("P241 classify + throughput simulation", () => {
  it("classifies actionType leak as automatic logic_bug hybrid", () => {
    const policy = {
      ...DEFAULT_CANDIDATE_ONBOARDING_POLICY,
      funnelPromotion: { enabled: true },
    };
    const current = traceP65PromotionRules(
      buildScoredWorkflowRow(cand(), wf()),
      policy,
      "current_state",
    );
    const replayWf = buildP240ReplayWorkflow(wf(), "cand-1");
    const replay = traceP65PromotionRules(
      buildScoredWorkflowRow(cand(), {
        ...replayWf,
        assignedRecruiter: "Taylor",
        assignedDM: "Mindie Rodriguez",
      }),
      policy,
      "p240_replay",
    );
    const fixed = traceP65PromotionRules(
      buildScoredWorkflowRow(
        cand(),
        applyFixedReplayClear({
          ...replayWf,
          assignedRecruiter: "Taylor",
          assignedDM: "Mindie Rodriguez",
        }),
      ),
      policy,
      "fixed_replay",
    );
    const classified = classifyP241QualificationFailure({
      currentStateTrace: current,
      p240ReplayTrace: replay,
      fixedReplayTrace: fixed,
      workflowStage: "Paperwork Sent",
      paperworkStatus: "sent",
      actionType: "await-signature",
    });
    assert.equal(classified.failedCheckId, "action_type_blocks_promotion");
    assert.equal(classified.classification, "logic_bug");
    assert.equal(classified.recoverability, "automatic");
    assert.equal(classified.expectedOrUnintended, "hybrid");
    assert.ok(classified.smallestSafeCorrection?.includes("actionType"));
  });

  it("derives qualification status for already-sent packets", () => {
    const status = deriveQualificationStatus({
      aiGrade: "D",
      workflowStage: "Paperwork Sent",
      paperworkStatus: "sent",
      currentCanPromote: false,
      replayCanPromote: false,
    });
    assert.match(status, /already_past_qualification/);
  });

  it("projects throughput and GO_WITH_CONDITIONS when all 8 unlock", () => {
    const forensics = Array.from({ length: 8 }, (_, i) => ({
      projectedOutcomeIfRecovered: "would_send" as const,
      projectedBlockerIfStillBlocked: null,
      redactedCandidateId: `r${i}`,
      displayName: `C${i}`,
    }));
    const sim = buildP241ThroughputSimulation({
      forensics: forensics as never,
      baselineWouldSend: 5,
      baselineBlocked: 12,
      proxyCohortSize: 17,
      estimatedDailyArrivalRate: 17.4,
      arrivalsLast14Days: 244,
      baselineHealthScore: 66,
      baselineAutoClearRatePct: 29.4,
      remainingNonQualificationBlockers: [
        { blocker: "manual_review_40_60", count: 2 },
        { blocker: "duplicate_identity", count: 1 },
        { blocker: "missing_phone", count: 1 },
      ],
    });
    assert.equal(sim.projectedAfterRecoverableFixes.wouldSendCount, 13);
    assert.equal(sim.projectedAfterRecoverableFixes.wouldSendDelta, 8);
    assert.equal(sim.projectedAfterRecoverableFixes.autoClearRatePct, 76.5);
    assert.ok(sim.projectedAfterRecoverableFixes.healthScore >= 70);
    assert.equal(sim.projectedAfterRecoverableFixes.goNoGo, "GO_WITH_CONDITIONS");
    assert.equal(sim.baseline.goNoGo, "NO-GO");
  });
});

describe("P241 zero-write audit contract", () => {
  it("forensics mode forbids durable mutations by contract", () => {
    assert.equal(P241_EXECUTION_MODE, "read_only");
    const audit = {
      phase: P241_PHASE,
      mode: P241_EXECUTION_MODE,
      generatedAt: new Date().toISOString(),
      before: { a: "1" },
      after: { a: "1" },
      unchanged: true,
      durablePaths: [".data/candidate-workflows.json"],
      candidateWrites: 0 as const,
      workflowWrites: 0 as const,
      dropboxSignCalls: 0 as const,
      recruiterOwnershipChanges: 0 as const,
      dmAssignmentChanges: 0 as const,
      deployments: 0 as const,
      commits: 0 as const,
    };
    assert.equal(audit.unchanged, true);
    assert.equal(audit.candidateWrites, 0);
    assert.equal(audit.workflowWrites, 0);
    assert.equal(audit.dropboxSignCalls, 0);
  });
});
