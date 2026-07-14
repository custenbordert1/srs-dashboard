import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertCohortImmutable,
  buildExactFlagsReport,
  buildFutureExecutionSequence,
  buildOperatorAuthorizationPackage,
  buildWriterContainmentPlan,
  determineReadinessVerdict,
  detectWriterCollision,
  evaluateCandidateEligibility,
  finalValidateMember,
  freezeImmutableCohortPreview,
  hashCandidateId,
  isAuthorizationExpired,
  isStale,
  P187_1_MAX_COHORT,
  redactCandidateId,
  runFinalCanaryDryRun,
  runProductionPreflight,
  selectEligibleCohort,
  type P1871EligibilityResult,
  type P1871ImmutableCohortPreview,
} from "@/lib/p187-1-canary-cohort-readiness";
import {
  authorizeCanary,
  buildP187CanaryPlan,
  executeP187ProductionCanary,
  type P187CanaryPlan,
} from "@/lib/p187-hr-to-oa-canary";

const NOW = "2026-07-13T17:00:00.000Z";
const NOW_MS = Date.parse(NOW);

function eligibleInput(id: string, patch: Record<string, unknown> = {}) {
  return {
    candidateId: id,
    workflowStatus: "Qualified",
    recommendedStage: "recommend_hire",
    assignedRecruiter: "Taylor",
    assignedDM: "Field Ops",
    jobAssignmentResolved: true,
    jobAssignmentRef: "job-alpha",
    identityResolved: true,
    shadowPresent: true,
    shadowState: "HIRING_RECOMMENDATION",
    lifecycleMismatch: false,
    withdrawn: false,
    archived: false,
    duplicateApprovalEvent: false,
    conflictingOperation: false,
    unresolvedAuditIssue: false,
    rollbackStateAvailable: true,
    updatedAt: NOW,
    lastActionAt: NOW,
    nowMs: NOW_MS,
    ...patch,
  };
}

function clearExecFlags() {
  delete process.env.P187_EXECUTE_PRODUCTION_CANARY;
  delete process.env.P187_TRANSITION_AUTHORITY_HR_TO_OA;
  delete process.env.P187_CANARY_FRAMEWORK;
}

describe("P187.1 canary cohort selection + authorization readiness", () => {
  it("production preflight passes when gates healthy and flags off", () => {
    clearExecFlags();
    const report = runProductionPreflight({
      productionCommit: "abc1234567890",
      neonHealthy: true,
      workflowStoreHealthy: true,
      p186ShadowHealthy: true,
      p187FrameworkHealthy: true,
      auditPersistenceHealthy: true,
      reconciliationHealthy: true,
      unresolvedLifecycleOperations: 0,
      criticalMismatches: 0,
      p184P185Isolated: true,
      p184DryRun: true,
      continuousAutomationDisabled: true,
      automaticMelExportDisabled: true,
    });
    assert.equal(report.aborted, false);
    assert.equal(report.allCriticalPassed, true);
    assert.equal(report.flagsCurrentlyOff.P187_EXECUTE_PRODUCTION_CANARY, true);
  });

  it("preflight aborts when critical mismatches present", () => {
    const report = runProductionPreflight({
      productionCommit: "abc1234567890",
      criticalMismatches: 2,
      neonHealthy: true,
      workflowStoreHealthy: true,
      p186ShadowHealthy: true,
      p187FrameworkHealthy: true,
      auditPersistenceHealthy: true,
      reconciliationHealthy: true,
      unresolvedLifecycleOperations: 0,
      p184P185Isolated: true,
      p184DryRun: true,
      continuousAutomationDisabled: true,
      automaticMelExportDisabled: true,
    });
    assert.equal(report.aborted, true);
    assert.ok(report.abortReasons.some((r) => /critical_mismatches/.test(r)));
  });

  it("production candidate eligibility requires HR state + evidence + owners", () => {
    const ok = evaluateCandidateEligibility(eligibleInput("cand-ok"));
    assert.equal(ok.eligible, true);
    assert.equal(ok.observation.lifecycleState, "HIRING_RECOMMENDATION");
  });

  it("stale-state exclusion", () => {
    assert.equal(isStale("2020-01-01T00:00:00.000Z", NOW_MS), true);
    const staleRow = evaluateCandidateEligibility(
      eligibleInput("stale", { updatedAt: "2020-01-01T00:00:00.000Z" }),
    );
    assert.equal(staleRow.eligible, false);
    assert.ok(staleRow.blockedReasons.some((r) => /stale/i.test(r)));
  });

  it("duplicate approval exclusion", () => {
    const row = evaluateCandidateEligibility(
      eligibleInput("dup", { duplicateApprovalEvent: true }),
    );
    assert.equal(row.eligible, false);
    assert.ok(row.blockedReasons.some((r) => /duplicate approval/i.test(r)));
  });

  it("hold exclusion", () => {
    const row = evaluateCandidateEligibility(
      eligibleInput("hold", { notes: ["[HOLD] executive hold"] }),
    );
    assert.equal(row.eligible, false);
    assert.ok(row.blockedReasons.some((r) => /hold/i.test(r)));
  });

  it("missing shadow exclusion", () => {
    const row = evaluateCandidateEligibility(
      eligibleInput("noshadow", { shadowPresent: false }),
    );
    assert.equal(row.eligible, false);
    assert.ok(row.blockedReasons.some((r) => /shadow/i.test(r)));
  });

  it("does not lower standards when fewer than 5 qualify", () => {
    const results = [
      evaluateCandidateEligibility(eligibleInput("a")),
      evaluateCandidateEligibility(eligibleInput("b", { recommendedStage: null })),
    ];
    const selected = selectEligibleCohort(results, P187_1_MAX_COHORT);
    assert.equal(selected.eligible.length, 1);
    assert.ok(selected.eligible.length < P187_1_MAX_COHORT);
  });

  it("immutable cohort freeze + fingerprint", () => {
    const eligible = ["c1", "c2", "c3"].map((id) =>
      evaluateCandidateEligibility(eligibleInput(id)),
    );
    const frozen = freezeImmutableCohortPreview({
      eligible,
      canaryId: "p187-1-test-canary",
      nowIso: NOW,
    });
    assert.ok(!("ok" in frozen && frozen.ok === false));
    const cohort = frozen as P1871ImmutableCohortPreview;
    assert.equal(cohort.members.length, 3);
    assert.equal(cohort.replacementsAllowed, false);
    assert.equal(cohort.authorityWritten, false);
    assert.equal(cohort.approvalsWritten, false);
    assert.equal(cohort.cohortFingerprint.length, 16);
    assert.equal(
      assertCohortImmutable(cohort, [
        ...cohort.members.map((m) => m.candidateIdHash),
        hashCandidateId("extra"),
      ]).ok,
      false,
    );
    assert.equal(redactCandidateId("abcdef123456").includes("…"), true);
  });

  it("final validation excludes blocked members before freeze", () => {
    const eligible = [
      evaluateCandidateEligibility(eligibleInput("good")),
      evaluateCandidateEligibility(eligibleInput("bad")),
    ];
    const frozen = freezeImmutableCohortPreview({
      eligible,
      canaryId: "p187-1-exclude",
      nowIso: NOW,
      memberExtras: {
        bad: { conflictingWriterActivity: true },
      },
    });
    assert.ok(!("ok" in frozen && frozen.ok === false));
    const cohort = frozen as P1871ImmutableCohortPreview;
    assert.equal(cohort.members.length, 1);
    assert.equal(cohort.excluded.length, 1);
  });

  it("writer-collision detection", () => {
    assert.equal(
      detectWriterCollision({
        candidateId: "x",
        competingWriterActiveForCandidate: true,
        legacyApprovalInFlight: false,
      }).collision,
      true,
    );
    assert.equal(
      detectWriterCollision({
        candidateId: "x",
        competingWriterActiveForCandidate: false,
        legacyApprovalInFlight: false,
      }).collision,
      false,
    );
    const plan = buildWriterContainmentPlan();
    assert.equal(plan.disabledNow, false);
    assert.ok(plan.competingWriters.length >= 2);
  });

  it("dry-run prediction matches expected zeros for sends/MEL and no real writes", async () => {
    const eligible = ["d1", "d2"].map((id) => evaluateCandidateEligibility(eligibleInput(id)));
    const frozen = freezeImmutableCohortPreview({
      eligible,
      canaryId: "p187-1-dry",
      nowIso: NOW,
    }) as P1871ImmutableCohortPreview;
    const byHash: Record<string, P1871EligibilityResult> = {};
    for (const row of eligible) byHash[hashCandidateId(row.candidateId)] = row;

    const pred = await runFinalCanaryDryRun({ cohort: frozen, eligibleByHash: byHash });
    assert.equal(pred.cohortSize, 2);
    assert.equal(pred.newlyBlockedCount, 0);
    assert.equal(pred.duplicateConflicts, 0);
    assert.equal(pred.paperworkSendsPredicted, 0);
    assert.equal(pred.melWritesPredicted, 0);
    assert.equal(pred.realProductionWrites, 0);
    assert.equal(pred.rollbackReady, true);
    assert.equal(pred.dryRunOk, true);
    assert.equal(pred.predictedProductionWrites, 2);
  });

  it("authorization expiration", () => {
    assert.equal(
      isAuthorizationExpired({
        authorizationTimestamp: "2026-07-13T10:00:00.000Z",
        expirationWindowHours: 4,
        nowMs: Date.parse("2026-07-13T15:00:00.000Z"),
      }),
      true,
    );
    assert.equal(
      isAuthorizationExpired({
        authorizationTimestamp: "2026-07-13T14:00:00.000Z",
        expirationWindowHours: 4,
        nowMs: Date.parse("2026-07-13T15:00:00.000Z"),
      }),
      false,
    );
  });

  it("execution refusal without flags", async () => {
    clearExecFlags();
    const plan = authorizeCanary({
      plan: buildP187CanaryPlan({
        cohortIds: ["x"],
        forceFlags: { canaryFramework: true },
      }) as P187CanaryPlan,
      actor: "op",
      reason: "test",
    }) as P187CanaryPlan;
    const run = await executeP187ProductionCanary({
      plan,
      snapshots: [
        {
          candidateId: "x",
          productionBefore: "Qualified",
          lifecycleBefore: "HIRING_RECOMMENDATION",
          expectedLifecycleAfter: "OPERATOR_APPROVED",
          maxAllowedProductionAfter: ["Qualified"],
        },
      ],
      forceFlags: { executeProductionCanary: false },
    });
    assert.equal(run.status, "refused");
    assert.equal(run.productionWritesAttempted, 0);
  });

  it("execution refusal without allowProductionExecution", async () => {
    const plan = authorizeCanary({
      plan: buildP187CanaryPlan({
        cohortIds: ["x"],
        forceFlags: { canaryFramework: true },
      }) as P187CanaryPlan,
      actor: "op",
      reason: "test",
    }) as P187CanaryPlan;
    const run = await executeP187ProductionCanary({
      plan,
      snapshots: [
        {
          candidateId: "x",
          productionBefore: "Qualified",
          lifecycleBefore: "HIRING_RECOMMENDATION",
          expectedLifecycleAfter: "OPERATOR_APPROVED",
          maxAllowedProductionAfter: ["Qualified"],
        },
      ],
      allowProductionExecution: false,
      forceFlags: {
        canaryFramework: true,
        transitionAuthorityHrToOa: true,
        executeProductionCanary: true,
      },
    });
    assert.equal(run.status, "refused");
    assert.equal(run.executedProduction, false);
  });

  it("rollback readiness and auth package do not fabricate approval", () => {
    const eligible = [evaluateCandidateEligibility(eligibleInput("r1"))];
    const frozen = freezeImmutableCohortPreview({
      eligible,
      canaryId: "p187-1-auth",
      nowIso: NOW,
    }) as P1871ImmutableCohortPreview;
    const pkg = buildOperatorAuthorizationPackage({
      cohort: frozen,
      productionCommit: "abc1234",
    });
    assert.equal(pkg.fabricatedApproval, false);
    assert.equal(pkg.flagsSet, false);
    assert.equal(pkg.operatorApprovalRecorded, false);
    assert.equal(pkg.actor, null);
    const flags = buildExactFlagsReport();
    assert.equal(flags.enableNow, false);
    assert.equal(flags.allowProductionExecutionRequired, true);
    assert.equal(flags.dashboardFlagOptional, true);
    assert.equal(flags.authorityMustExpireAfterCanary, true);
    assert.equal(buildFutureExecutionSequence().length, 16);
  });

  it("readiness verdict not_ready when cohort empty", () => {
    const pf = runProductionPreflight({
      productionCommit: "abc1234567890",
      neonHealthy: true,
      workflowStoreHealthy: true,
      p186ShadowHealthy: true,
      p187FrameworkHealthy: true,
      auditPersistenceHealthy: true,
      reconciliationHealthy: true,
      unresolvedLifecycleOperations: 0,
      criticalMismatches: 0,
      p184P185Isolated: true,
      p184DryRun: true,
      continuousAutomationDisabled: true,
      automaticMelExportDisabled: true,
    });
    assert.equal(
      determineReadinessVerdict({
        preflight: pf,
        cohortMemberCount: 0,
        dryRun: null,
        cohortFrozen: false,
      }),
      "not_ready",
    );
  });

  it("finalValidateMember and freeze refuse empty eligible set", () => {
    const bad = evaluateCandidateEligibility(
      eligibleInput("z", { recommendedStage: null, jobAssignmentResolved: false }),
    );
    assert.equal(finalValidateMember(bad).ready, false);
    const frozen = freezeImmutableCohortPreview({ eligible: [], nowIso: NOW });
    assert.equal("ok" in frozen && frozen.ok === false, true);
  });

  it("containment plan does not disable writers", () => {
    assert.equal(buildWriterContainmentPlan().disabledNow, false);
  });

  it("withdrawn and archive exclusions; no paperwork/MEL/production writes in readiness path", async () => {
    assert.equal(
      evaluateCandidateEligibility(eligibleInput("w", { withdrawn: true })).eligible,
      false,
    );
    assert.equal(
      evaluateCandidateEligibility(eligibleInput("a", { archived: true })).eligible,
      false,
    );
    const eligible = [evaluateCandidateEligibility(eligibleInput("safe"))];
    const frozen = freezeImmutableCohortPreview({
      eligible,
      canaryId: "p187-1-safe",
      nowIso: NOW,
    }) as P1871ImmutableCohortPreview;
    const byHash: Record<string, P1871EligibilityResult> = {
      [hashCandidateId("safe")]: eligible[0]!,
    };
    const pred = await runFinalCanaryDryRun({ cohort: frozen, eligibleByHash: byHash });
    assert.equal(pred.paperworkSendsPredicted, 0);
    assert.equal(pred.melWritesPredicted, 0);
    assert.equal(pred.realProductionWrites, 0);
  });
});
