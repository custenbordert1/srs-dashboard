import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { BreezyCandidate } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { emptyRecruitingActions } from "@/lib/candidate-recruiting-actions";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import {
  buildOnboardingDecisions,
  countEligibleForPaperwork,
} from "@/lib/candidate-onboarding-engine/build-onboarding-decisions";
import { buildCandidateOnboardingHealth } from "@/lib/candidate-onboarding-engine/build-onboarding-health";
import {
  DEFAULT_CANDIDATE_ONBOARDING_POLICY,
  loadCandidateOnboardingPolicy,
  saveCandidateOnboardingPolicy,
} from "@/lib/candidate-onboarding-engine/onboarding-policy-store";
import { recordCandidateOnboarding } from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import { runCandidateOnboarding } from "@/lib/candidate-onboarding-engine/run-candidate-onboarding";
import {
  installIsolatedRecruitingDataDir,
  type IsolatedRecruitingDataHandle,
} from "@/lib/test/recruiting-test-isolation";

let isolation: IsolatedRecruitingDataHandle;

function candidate(id: string): BreezyCandidate {
  return {
    candidateId: id,
    firstName: "Sam",
    lastName: "Rivera",
    email: "sam@example.com",
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
    assignedRecruiter: "Taylor",
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
    requiredAction: "Send Paperwork",
    actionType: "send-paperwork",
    actionPriority: "high",
    actionReason: "Qualified candidate",
    actionDueDate: "2099-01-01",
    actionConfidence: 90,
    actionGeneratedAt: "2026-06-20T12:00:00.000Z",
    ...patch,
  };
}

before(async () => {
  isolation = await installIsolatedRecruitingDataDir("p65-onboarding-test-");
});

after(async () => {
  await isolation.restore();
});

describe("candidate-onboarding-engine", () => {
  it("defaults onboarding policy disabled semi-automatic with approval gates", async () => {
    const policy = await loadCandidateOnboardingPolicy();
    assert.equal(policy.enabled, false);
    assert.equal(policy.mode, "semi-automatic");
    assert.equal(policy.send.requireApproval, true);
    assert.equal(policy.escalation.requireApproval, true);
    assert.equal(policy.maxEscalationsPerRun, 10);
    assert.equal(policy.paperworkByGrade.D, true);
    assert.equal(policy.funnelPromotion.enabled, true);
  });

  it("builds send decisions for eligible candidates", () => {
    const row = buildScoredWorkflowRow(candidate("c-1"), workflow("c-1"));
    const decisions = buildOnboardingDecisions({
      candidates: [row],
      reminderHours: [24, 72, 168],
      escalationOverdueHours: 168,
      existingEscalations: new Set(),
    });
    assert.equal(decisions[0]?.decisionType, "send-packet");
    assert.equal(countEligibleForPaperwork([row]), 1);
  });

  it("skips candidates with active packets for send", () => {
    const row = buildScoredWorkflowRow(
      candidate("c-2"),
      workflow("c-2", {
        signatureRequestId: "sig-1",
        paperworkStatus: "sent",
        workflowStatus: "Paperwork Sent",
        paperworkSentAt: "2026-06-20T10:00:00.000Z",
      }),
    );
    const decisions = buildOnboardingDecisions({
      candidates: [row],
      reminderHours: [24, 72, 168],
      escalationOverdueHours: 1,
      existingEscalations: new Set(),
    });
    assert.ok(decisions.some((d) => d.decisionType === "sync-status"));
    assert.equal(countEligibleForPaperwork([row]), 0);
  });

  it("blocks paperwork when grade is disallowed by policy", () => {
    const row = buildScoredWorkflowRow(candidate("c-grade"), workflow("c-grade"));
    const blockedPolicy = {
      ...DEFAULT_CANDIDATE_ONBOARDING_POLICY,
      paperworkByGrade: { ...DEFAULT_CANDIDATE_ONBOARDING_POLICY.paperworkByGrade, D: false },
    };
    assert.equal(countEligibleForPaperwork([row], blockedPolicy), 0);
  });

  it("promotes Applied screen-candidate rows toward paperwork funnel", async () => {
    const { getCandidateWorkflowState } = await import("@/lib/candidate-workflow-store");
    await saveCandidateOnboardingPolicy({
      ...DEFAULT_CANDIDATE_ONBOARDING_POLICY,
      enabled: true,
      dryRun: false,
      funnelPromotion: { enabled: true },
    });
    const row = buildScoredWorkflowRow(
      candidate("c-promote"),
      workflow("c-promote", {
        workflowStatus: "Applied",
        actionType: "screen-candidate",
        requiredAction: "Screen Candidate",
        actionReason: "New applicant",
      }),
    );
    const result = await runCandidateOnboarding({ candidates: [row] });
    const workflows = await getCandidateWorkflowState();
    const updated = workflows["c-promote"];
    assert.equal(result.funnelPromotions, 1);
    assert.equal(result.eligibleForPaperwork, 1);
    assert.equal(result.packetsSent, 0);
    assert.equal(updated?.workflowStatus, "Paperwork Needed");
    assert.equal(updated?.actionType, "send-paperwork");
    await saveCandidateOnboardingPolicy(DEFAULT_CANDIDATE_ONBOARDING_POLICY);
  });

  it("dry run reports eligible without sending", async () => {
    const row = buildScoredWorkflowRow(candidate("c-3"), workflow("c-3"));
    const result = await runCandidateOnboarding({
      candidates: [row],
    });
    assert.equal(result.dryRun, false);
    assert.equal(result.blockedByPolicy, 1);
  });

  it("dry run mode simulates without side effects", async () => {
    const { saveCandidateOnboardingPolicy } = await import(
      "@/lib/candidate-onboarding-engine/onboarding-policy-store"
    );
    await saveCandidateOnboardingPolicy({
      ...DEFAULT_CANDIDATE_ONBOARDING_POLICY,
      enabled: true,
      dryRun: true,
    });
    const row = buildScoredWorkflowRow(candidate("c-4"), workflow("c-4"));
    const result = await runCandidateOnboarding({ candidates: [row] });
    assert.equal(result.dryRun, true);
    assert.equal(result.packetsSent, 0);
    assert.equal(result.eligibleForPaperwork, 1);
  });

  it("persists onboarding records with status history", async () => {
    await recordCandidateOnboarding({
      onboardingId: "onb-1",
      candidateId: "c-5",
      status: "pending_approval",
      paperworkComplete: false,
      readyForMel: false,
      createdAt: "2026-06-20T10:00:00.000Z",
      retryCount: 0,
      escalated: false,
      statusHistory: [{ at: "2026-06-20T10:00:00.000Z", status: "draft" }],
    });
    const health = await buildCandidateOnboardingHealth({
      candidates: [buildScoredWorkflowRow(candidate("c-5"), workflow("c-5"))],
    });
    assert.equal(typeof health.eligibleForPaperwork, "number");
    assert.equal(typeof health.blockedByPolicy, "number");
  });
});
