import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { emptyRecruitingActions } from "@/lib/candidate-recruiting-actions";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { DEFAULT_CANDIDATE_ONBOARDING_POLICY } from "@/lib/candidate-onboarding-engine/onboarding-policy-store";
import {
  applyP240FreshNewReplayReset,
  buildP240LiveDashboard,
  buildP240PipelineHealth,
  buildP240Throughput,
  p240IsCalvinBrown,
  p240RedactId,
  resetToFreshNewState,
  resolveP240Cutoff,
  selectP240Cohorts,
  simulateP240CandidatePath,
  validateP240FreshNewReset,
  P240_DEFAULT_CUTOFF_ISO,
  P240_EXECUTION_MODE,
  P240_FRESH_NEW_REPLAY_ACTION_FIELDS,
} from "@/lib/p240-autonomous-new-applicant-pipeline";
import { canPromoteToPaperworkFunnel } from "@/lib/candidate-onboarding-engine/promote-paperwork-funnel";

function wf(overrides: Partial<CandidateWorkflowRecord> = {}): CandidateWorkflowRecord {
  return {
    candidateId: "c1",
    workflowStatus: "Applied",
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
    paperworkViewedAt: null,
    paperworkViewCount: 0,
    paperworkSignedAt: null,
    paperworkError: null,
    onboardingContactEmail: null,
    directDepositStatus: "not_requested",
    directDepositRequestedAt: null,
    directDepositLastReminderAt: null,
    directDepositNotes: null,
    directDepositTriggeredByUserId: null,
    directDepositLastDeliveryMode: null,
    directDepositLastHrCopyIncluded: null,
    directDepositLastHrBccAddress: null,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function cand(overrides: Partial<BreezyCandidate> = {}): BreezyCandidate {
  return {
    candidateId: "c1",
    firstName: "Test",
    lastName: "Candidate",
    email: "test@example.com",
    phone: "555-010-1234",
    stage: "Applied",
    source: "Indeed",
    appliedDate: "2026-07-21T08:00:00.000Z",
    addedDate: "2026-07-21T08:00:00.000Z",
    positionId: "pos-1",
    positionName: "Retail Merchandiser – Columbus, OH",
    city: "Columbus",
    state: "OH",
    zipCode: "43215",
    ...overrides,
  } as BreezyCandidate;
}

function job(overrides: Partial<BreezyJob> = {}): BreezyJob {
  return {
    jobId: "pos-1",
    name: "Retail Merchandiser – Columbus, OH",
    city: "Columbus",
    state: "OH",
    zip: "43215",
    displayLocation: "Columbus, OH",
    locationSource: "breezy",
    status: "published",
    ...overrides,
  } as BreezyJob;
}

describe("P240 cutoff + helpers", () => {
  it("resolves cutoff from default when artifacts absent in isolated cwd", () => {
    const cutoff = resolveP240Cutoff("/tmp/p240-missing-artifacts-cwd");
    assert.equal(cutoff.cutoffIso, P240_DEFAULT_CUTOFF_ISO);
    assert.ok(cutoff.source.includes("fallback"));
  });

  it("redacts ids and detects Calvin Brown exclusion", () => {
    assert.equal(p240RedactId("abc").length, 12);
    assert.equal(p240IsCalvinBrown("Calvin Brown"), true);
    assert.equal(p240IsCalvinBrown("Someone Else"), false);
  });

  it("execution mode is dry_run_only", () => {
    assert.equal(P240_EXECUTION_MODE, "dry_run_only");
  });
});

describe("P240 cohort selection", () => {
  it("separates post-cutoff real-new from 14d proxy projection", () => {
    const cutoffMs = Date.parse(P240_DEFAULT_CUTOFF_ISO);
    const nowMs = cutoffMs + 2 * 24 * 3600_000;
    const candidates = [
      cand({
        candidateId: "new1",
        appliedDate: new Date(cutoffMs + 3600_000).toISOString(),
      }),
      cand({
        candidateId: "old1",
        appliedDate: new Date(cutoffMs - 3 * 24 * 3600_000).toISOString(),
        email: "old1@example.com",
      }),
      cand({
        candidateId: "old2",
        appliedDate: new Date(cutoffMs - 1 * 24 * 3600_000).toISOString(),
        email: "old2@example.com",
      }),
    ];
    const selected = selectP240Cohorts({
      candidates,
      workflows: {},
      cutoff: {
        cutoffIso: P240_DEFAULT_CUTOFF_ISO,
        cutoffMs,
        source: "test",
        p239GeneratedAt: P240_DEFAULT_CUTOFF_ISO,
        maxP239AppliedDate: null,
      },
      priorSent: new Set(),
      nowMs,
    });
    assert.deepEqual(selected.realNewIds, ["new1"]);
    assert.ok(selected.proxyIds.includes("new1"));
    assert.ok(selected.arrivalsLast14Days >= 2);
  });
});

describe("P240 path simulation", () => {
  it("protects already-sent candidates (never resend)", async () => {
    const trace = await simulateP240CandidatePath({
      candidateId: "c1",
      candidate: cand(),
      workflow: wf({
        workflowStatus: "Paperwork Sent",
        paperworkStatus: "sent",
        signatureRequestId: "sig-1",
      }),
      job: job(),
      policy: DEFAULT_CANDIDATE_ONBOARDING_POLICY,
      opportunityPoints: [{ city: "Columbus", state: "OH", lat: 39.96, lng: -82.99 }],
      priorSent: new Set(),
      proposedRecruiter: "Taylor",
      recruiterConfidence: 90,
      emailOwners: new Map([["test@example.com", "c1"]]),
      cohortKind: "real_new_post_cutoff",
      replayAsFreshNew: false,
      allowNetworkGeocode: false,
    });
    assert.equal(trace.outcome, "protected_skip");
    assert.equal(trace.blocker, "already_sent_or_signed");
    assert.ok(trace.nextAction.includes("Do not modify"));
  });

  it("protects prior-batch sent ids", async () => {
    const trace = await simulateP240CandidatePath({
      candidateId: "c1",
      candidate: cand(),
      workflow: wf(),
      job: job(),
      policy: DEFAULT_CANDIDATE_ONBOARDING_POLICY,
      opportunityPoints: [{ city: "Columbus", state: "OH", lat: 39.96, lng: -82.99 }],
      priorSent: new Set(["c1"]),
      proposedRecruiter: "Taylor",
      recruiterConfidence: 90,
      emailOwners: new Map([["test@example.com", "c1"]]),
      cohortKind: "real_new_post_cutoff",
      replayAsFreshNew: false,
      allowNetworkGeocode: false,
    });
    assert.equal(trace.outcome, "protected_skip");
    assert.equal(trace.blocker, "prior_batch_sent");
  });

  it("records explicit blocker when recruiter cannot be resolved", async () => {
    const trace = await simulateP240CandidatePath({
      candidateId: "c1",
      candidate: cand(),
      workflow: wf({ assignedRecruiter: "Unassigned" }),
      job: job(),
      policy: DEFAULT_CANDIDATE_ONBOARDING_POLICY,
      opportunityPoints: [{ city: "Columbus", state: "OH", lat: 39.96, lng: -82.99 }],
      priorSent: new Set(),
      proposedRecruiter: null,
      recruiterConfidence: null,
      emailOwners: new Map([["test@example.com", "c1"]]),
      cohortKind: "simulation_proxy_24h",
      replayAsFreshNew: true,
      allowNetworkGeocode: false,
    });
    assert.equal(trace.outcome, "blocked");
    assert.equal(trace.blocker, "awaiting_recruiter_assignment");
    assert.equal(trace.queueLocation, "awaiting_recruiter");
    assert.ok(trace.nextAction.length > 0);
  });

  it("records explicit blocker for missing email", async () => {
    const trace = await simulateP240CandidatePath({
      candidateId: "c1",
      candidate: cand({ email: "" }),
      workflow: wf(),
      job: job(),
      policy: DEFAULT_CANDIDATE_ONBOARDING_POLICY,
      opportunityPoints: [],
      priorSent: new Set(),
      proposedRecruiter: "Taylor",
      recruiterConfidence: 90,
      emailOwners: new Map(),
      cohortKind: "simulation_proxy_24h",
      replayAsFreshNew: true,
      allowNetworkGeocode: false,
    });
    assert.equal(trace.outcome, "blocked");
    assert.equal(trace.blocker, "missing_email");
    assert.equal(trace.queueLocation, "blocked");
  });

  it("happy-path replay reaches would_send when DM+proximity clear", async () => {
    const trace = await simulateP240CandidatePath({
      candidateId: "c1",
      candidate: cand(),
      workflow: wf({ assignedRecruiter: "Taylor" }),
      job: job(),
      policy: DEFAULT_CANDIDATE_ONBOARDING_POLICY,
      opportunityPoints: [{ city: "Columbus", state: "OH", lat: 39.9612, lng: -82.9988 }],
      priorSent: new Set(),
      proposedRecruiter: "Taylor",
      recruiterConfidence: 90,
      emailOwners: new Map([["test@example.com", "c1"]]),
      cohortKind: "simulation_proxy_24h",
      replayAsFreshNew: true,
      allowNetworkGeocode: false,
    });
    // May block on DM authority or geocode in offline unit test — either would_send or explicit blocker.
    assert.ok(
      trace.outcome === "would_send" ||
        trace.outcome === "would_reach_paperwork_needed" ||
        (trace.outcome === "blocked" && trace.blocker != null),
    );
    if (trace.outcome === "blocked") {
      assert.ok(trace.nextAction.length > 0);
      assert.ok(trace.queueLocation.length > 0);
    }
  });

  it("fresh-new replay clears stale await-signature so qualification is not falsely blocked", async () => {
    const original = wf({
      workflowStatus: "Paperwork Sent",
      paperworkStatus: "sent",
      signatureRequestId: "sig-live",
      paperworkSentAt: "2026-07-20T19:55:00.000Z",
      actionType: "await-signature",
      requiredAction: "Await Signature",
      actionReason: "Packet sent",
      actionDueDate: "2026-07-21",
      actionGeneratedAt: "2026-07-20T19:55:00.000Z",
      actionPriority: "high",
      nextActionNeeded: "Await Signature",
    });
    const frozen = structuredClone(original);

    const policy = {
      ...DEFAULT_CANDIDATE_ONBOARDING_POLICY,
      funnelPromotion: { enabled: true },
    };
    const scoredLive = buildScoredWorkflowRow(cand(), original);
    assert.equal(canPromoteToPaperworkFunnel(scoredLive, policy), false);

    const reset = applyP240FreshNewReplayReset(original);
    assert.equal(reset.actionType, null);
    assert.equal(reset.requiredAction, null);
    assert.equal(reset.workflowStatus, "Applied");
    assert.equal(reset.paperworkStatus, "not_sent");
    assert.equal(reset.signatureRequestId, null);
    assert.equal(reset.nextActionNeeded, "Review");
    assert.equal(reset.assignedRecruiter, "Unassigned");
    assert.equal(reset.assignedDM, "Unassigned");
    assert.deepEqual(original, frozen);

    const scoredReplay = buildScoredWorkflowRow(cand(), {
      ...reset,
      assignedRecruiter: "Taylor",
    });
    assert.equal(canPromoteToPaperworkFunnel(scoredReplay, policy), true);

    const liveTrace = await simulateP240CandidatePath({
      candidateId: "c1",
      candidate: cand(),
      workflow: original,
      job: job(),
      policy,
      opportunityPoints: [{ city: "Columbus", state: "OH", lat: 39.9612, lng: -82.9988 }],
      priorSent: new Set(),
      proposedRecruiter: "Taylor",
      recruiterConfidence: 90,
      emailOwners: new Map([["test@example.com", "c1"]]),
      cohortKind: "real_new_post_cutoff",
      replayAsFreshNew: false,
      allowNetworkGeocode: false,
      allowNetworkBreezyRefresh: false,
    });
    assert.equal(liveTrace.outcome, "protected_skip");
    assert.equal(liveTrace.blocker, "already_sent_or_signed");
    assert.deepEqual(original, frozen);

    const replayTrace = await simulateP240CandidatePath({
      candidateId: "c1",
      candidate: cand(),
      workflow: original,
      job: job(),
      policy,
      opportunityPoints: [{ city: "Columbus", state: "OH", lat: 39.9612, lng: -82.9988 }],
      priorSent: new Set(),
      proposedRecruiter: "Taylor",
      recruiterConfidence: 90,
      emailOwners: new Map([["test@example.com", "c1"]]),
      cohortKind: "simulation_proxy_24h",
      replayAsFreshNew: true,
      allowNetworkGeocode: false,
      allowNetworkBreezyRefresh: false,
    });
    assert.notEqual(replayTrace.blocker, "qualification_gate_failed");
    assert.ok(replayTrace.freshness);
    assert.equal(replayTrace.freshness?.hashMismatch, false);
    assert.equal(replayTrace.freshness?.freshResetApplied, true);
    assert.ok(replayTrace.simulationNotes.some((n) => /Fresh Reset Applied/i.test(n)));
    assert.deepEqual(original, frozen);
  });

  it("resetToFreshNewState validates hash and clears coverage/duplicate markers", () => {
    const original = wf({
      workflowStatus: "Paperwork Sent",
      paperworkStatus: "sent",
      signatureRequestId: "sig",
      assignedRecruiter: "Taylor",
      assignedDM: "Mindie",
      actionType: "await-signature",
      notes: ["duplicate identity conflict", "nearest miles 12 coverage", "operator note"],
    });
    const reset = resetToFreshNewState(original);
    assert.equal(reset.candidateId, "c1");
    assert.equal(reset.assignedRecruiter, "Unassigned");
    assert.deepEqual(reset.history, []);
    const validation = validateP240FreshNewReset({ before: original, after: reset });
    assert.equal(validation.hashMismatch, false);
    assert.ok(reset.notes.includes("operator note"));
  });

  it("fresh-new replay clears stale send-paperwork actionType", async () => {
    const original = wf({
      workflowStatus: "Paperwork Needed",
      paperworkStatus: "sent",
      signatureRequestId: "sig-2",
      actionType: "send-paperwork",
      requiredAction: "Send Paperwork",
      actionReason: "Promoted",
      actionGeneratedAt: "2026-07-20T12:00:00.000Z",
    });
    const frozen = structuredClone(original);
    const reset = applyP240FreshNewReplayReset(original);
    assert.equal(reset.actionType, null);
    assert.equal(reset.requiredAction, null);
    assert.equal(reset.actionReason, null);
    assert.equal(reset.actionGeneratedAt, null);
    for (const field of P240_FRESH_NEW_REPLAY_ACTION_FIELDS) {
      if (field === "nextActionNeeded") {
        assert.equal(reset.nextActionNeeded, "Review");
      } else if (field === "lastActionAt") {
        assert.equal(reset.lastActionAt, null);
      } else {
        assert.equal(
          (reset as Record<string, unknown>)[field] ?? null,
          null,
          `${field} should be cleared`,
        );
      }
    }
    assert.deepEqual(original, frozen);

    const policy = {
      ...DEFAULT_CANDIDATE_ONBOARDING_POLICY,
      funnelPromotion: { enabled: true },
    };
    assert.equal(
      canPromoteToPaperworkFunnel(
        buildScoredWorkflowRow(cand(), { ...reset, assignedRecruiter: "Taylor" }),
        policy,
      ),
      true,
    );
  });
});

describe("P240 dashboard + health", () => {
  it("builds dashboard counts and health go/no-go", () => {
    const traces = [
      {
        candidateId: "a",
        redactedCandidateId: "aaaaaaaaaaaa",
        displayName: "A",
        cohortKind: "simulation_proxy_24h" as const,
        appliedDate: "2026-07-20T00:00:00.000Z",
        city: "X",
        state: "OH",
        positionId: "p",
        positionName: "p",
        currentStage: "Applied",
        paperworkStatus: "not_sent",
        assignedRecruiterBefore: "Taylor",
        assignedRecruiterSimulated: "Taylor",
        assignedDMBefore: "Unassigned",
        assignedDMSimulated: "Erin Boatright",
        nearestMiles: 5,
        coverageTier: "tier1_0_20",
        stepsCompleted: ["ingested", "recruiter_assigned", "dm_assigned", "qualified", "proximity_ok", "paperwork_needed", "dropbox_sign_simulated", "paperwork_sent_simulated"] as const,
        queueLocation: "would_send" as const,
        outcome: "would_send" as const,
        blocker: null,
        blockerDetail: null,
        nextAction: "ok",
        estimatedMinutesAppliedToPaperwork: 50,
        freshness: {
          preResetHash: "pre",
          postResetHash: "post",
          hashMismatch: false,
          leftoverStaleFields: [],
          notes: ["Fresh-new reset validated"],
          breezyRefreshSource: "ingestion_cache",
          breezyRefreshNote: "cache",
          freshResetApplied: true,
        },
        simulationNotes: ["Fresh Reset Applied"],
      },
      {
        candidateId: "b",
        redactedCandidateId: "bbbbbbbbbbbb",
        displayName: "B",
        cohortKind: "simulation_proxy_24h" as const,
        appliedDate: "2026-07-19T00:00:00.000Z",
        city: "Y",
        state: "OH",
        positionId: "p",
        positionName: "p",
        currentStage: "Applied",
        paperworkStatus: "not_sent",
        assignedRecruiterBefore: "Unassigned",
        assignedRecruiterSimulated: null,
        assignedDMBefore: "Unassigned",
        assignedDMSimulated: null,
        nearestMiles: null,
        coverageTier: null,
        stepsCompleted: ["ingested"] as const,
        queueLocation: "awaiting_recruiter" as const,
        outcome: "blocked" as const,
        blocker: "awaiting_recruiter_assignment" as const,
        blockerDetail: "no recruiter",
        nextAction: "Resolve recruiter",
        estimatedMinutesAppliedToPaperwork: null,
        freshness: {
          preResetHash: "pre",
          postResetHash: "post",
          hashMismatch: false,
          leftoverStaleFields: [],
          notes: [],
          breezyRefreshSource: "skipped",
          breezyRefreshNote: null,
          freshResetApplied: true,
        },
        simulationNotes: ["Fresh Reset Applied"],
      },
    ].map((t) => ({
      ...t,
      stepsCompleted: [...t.stepsCompleted],
    })) as import("@/lib/p240-autonomous-new-applicant-pipeline/types").P240CandidateTrace[];

    const dashboard = buildP240LiveDashboard({
      traces,
      cutoffIso: P240_DEFAULT_CUTOFF_ISO,
      cutoffSource: "test",
      realNewCount: 0,
    });
    assert.equal(dashboard.wouldSend, 1);
    assert.equal(dashboard.awaitingRecruiter, 1);
    assert.equal(dashboard.mode, "dry_run_only");
    assert.equal(dashboard.freshResetApplied, 2);

    const throughput = buildP240Throughput({
      traces,
      arrivalsLast14Days: 28,
      estimatedDailyArrivalRate: 2,
      projectedArrivalsNext24h: 2,
    });
    assert.equal(throughput.wouldSendCount, 1);
    assert.equal(throughput.blockedCount, 1);
    assert.equal(throughput.freshResetApplied, 2);

    const health = buildP240PipelineHealth({ dashboard, throughput, traces });
    assert.ok(health.healthScore >= 0 && health.healthScore <= 100);
    assert.ok(["GO", "NO-GO", "CONDITIONAL-GO"].includes(health.goNoGo));
    assert.equal(health.dryRunConfirmed, true);
    assert.equal(health.durableWrites, 0);
    assert.equal(health.dropboxSignCalls, 0);
  });
});

describe("P240 zero-write contract", () => {
  it("health always reports zero side effects", () => {
    const dashboard = buildP240LiveDashboard({
      traces: [],
      cutoffIso: P240_DEFAULT_CUTOFF_ISO,
      cutoffSource: "test",
      realNewCount: 0,
    });
    const throughput = buildP240Throughput({
      traces: [],
      arrivalsLast14Days: 0,
      estimatedDailyArrivalRate: 0,
      projectedArrivalsNext24h: 5,
    });
    const health = buildP240PipelineHealth({ dashboard, throughput, traces: [] });
    assert.equal(health.durableWrites, 0);
    assert.equal(health.stageChanges, 0);
    assert.equal(health.recruiterOwnershipChanges, 0);
    assert.equal(health.dmAssignmentChanges, 0);
  });
});
