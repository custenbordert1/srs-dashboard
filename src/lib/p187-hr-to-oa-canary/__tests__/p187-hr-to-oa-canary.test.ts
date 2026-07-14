import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import {
  assertAuthorizationMatchesPlan,
  assertCohortImmutable,
  assertRollbackSafety,
  assertSingleTransitionAuthority,
  authorizeCanary,
  buildArchitectureDocument,
  buildP187CanaryPlan,
  buildP187CutoverDashboard,
  buildReconciliationReport,
  detectInvalidAdvancement,
  dryRunProductionAdapter,
  evaluateCandidateOutcome,
  executeP187ProductionCanary,
  hasGlobalLifecycleAuthorityFlag,
  isEligibleForCanary,
  mapToLifecycleState,
  P187_CANARY_TRANSITION,
  P187_FORBIDDEN_AFTER_STATUSES,
  P187_MAX_COHORT,
  readP187Flags,
  rollbackP187Canary,
  runP187DryRun,
  type P187CandidateSnapshot,
  type P187CanaryPlan,
  type P187ProductionAdapter,
} from "@/lib/p187-hr-to-oa-canary";

const MOD_DIR = path.join(process.cwd(), "src/lib/p187-hr-to-oa-canary");

function clearFlags() {
  for (const k of [
    "P187_CANARY_DASHBOARD",
    "P187_CANARY_FRAMEWORK",
    "P187_TRANSITION_AUTHORITY_HR_TO_OA",
    "P187_RECONCILIATION",
    "P187_ROLLBACK",
    "P187_EXECUTE_PRODUCTION_CANARY",
    "P187_AUTHORITATIVE_ALL",
    "P187_ENABLE_ALL_TRANSITIONS",
    "P187_GLOBAL_CUTOVER",
  ]) {
    delete process.env[k];
  }
}

function snapshots(ids: string[]): P187CandidateSnapshot[] {
  return ids.map((candidateId) => ({
    candidateId,
    productionBefore: "Qualified",
    lifecycleBefore: "HIRING_RECOMMENDATION",
    expectedLifecycleAfter: "OPERATOR_APPROVED",
    maxAllowedProductionAfter: ["Qualified", "Needs Review", "Applied"],
  }));
}

async function authorizedPlan(ids: string[]): Promise<P187CanaryPlan> {
  const plan = buildP187CanaryPlan({
    cohortIds: ids,
    forceFlags: { canaryFramework: true },
  });
  assert.ok(!("ok" in plan && plan.ok === false));
  const auth = authorizeCanary({
    plan: plan as P187CanaryPlan,
    actor: "exec-1",
    reason: "P187 stage-1 canary authorization",
  });
  assert.ok(!("ok" in auth && auth.ok === false));
  return auth as P187CanaryPlan;
}

describe("P187 HR→OA controlled canary", () => {
  it("feature flags default off", () => {
    clearFlags();
    const f = readP187Flags();
    assert.equal(f.canaryDashboard, false);
    assert.equal(f.canaryFramework, false);
    assert.equal(f.transitionAuthorityHrToOa, false);
    assert.equal(f.reconciliation, false);
    assert.equal(f.rollback, false);
    assert.equal(f.executeProductionCanary, false);
  });

  it("no global lifecycle authority flag", () => {
    clearFlags();
    assert.equal(hasGlobalLifecycleAuthorityFlag(), false);
    process.env.P187_ENABLE_ALL_TRANSITIONS = "1";
    assert.equal(hasGlobalLifecycleAuthorityFlag(), true);
    delete process.env.P187_ENABLE_ALL_TRANSITIONS;
  });

  it("single transition authority only for HR→OA", () => {
    assert.equal(assertSingleTransitionAuthority(P187_CANARY_TRANSITION), true);
    assert.equal(assertSingleTransitionAuthority("Paperwork Needed→Paperwork Sent"), false);
    assert.equal(assertSingleTransitionAuthority("Operator Approved→Paperwork Needed"), false);
  });

  it("builds immutable cohort with max 5", () => {
    const ok = buildP187CanaryPlan({
      cohortIds: ["a", "b", "c"],
      forceFlags: { canaryFramework: true },
    });
    assert.ok(!("ok" in ok && ok.ok === false));
    const plan = ok as P187CanaryPlan;
    assert.equal(plan.immutable, true);
    assert.equal(plan.maxCohortSize, P187_MAX_COHORT);
    assert.equal(plan.stopOnFirstFailure, true);
    assert.equal(plan.executed, false);
    assert.equal(plan.transition, P187_CANARY_TRANSITION);

    const tooBig = buildP187CanaryPlan({
      cohortIds: ["1", "2", "3", "4", "5", "6"],
      forceFlags: { canaryFramework: true },
    });
    assert.equal("ok" in tooBig && tooBig.ok === false, true);
  });

  it("refuses cohort expansion", async () => {
    const plan = await authorizedPlan(["a", "b"]);
    assert.equal(assertCohortImmutable(plan, ["a", "b", "c"]).ok, false);
    assert.equal(assertCohortImmutable(plan, ["a", "b"]).ok, true);
  });

  it("requires explicit operator authorization", async () => {
    const raw = buildP187CanaryPlan({
      cohortIds: ["a"],
      forceFlags: { canaryFramework: true },
    }) as P187CanaryPlan;
    assert.equal(assertAuthorizationMatchesPlan(raw).ok, false);
    const auth = authorizeCanary({
      plan: raw,
      actor: "op",
      reason: "go",
    }) as P187CanaryPlan;
    assert.equal(assertAuthorizationMatchesPlan(auth).ok, true);
  });

  it("maps lifecycle and eligibility gates", () => {
    assert.equal(
      mapToLifecycleState({
        workflowStatus: "Qualified",
        recommendedStage: "hire",
      }),
      "HIRING_RECOMMENDATION",
    );
    assert.equal(
      mapToLifecycleState({
        workflowStatus: "Qualified",
        hasOperatorApprovalEvidence: true,
      }),
      "OPERATOR_APPROVED",
    );
    const snap = snapshots(["x"])[0]!;
    assert.equal(isEligibleForCanary(snap).ok, true);
    assert.equal(
      isEligibleForCanary({ ...snap, lifecycleBefore: "RECRUITER_REVIEW" }).ok,
      false,
    );
  });

  it("detects invalid advancement beyond Operator Approved", () => {
    for (const s of P187_FORBIDDEN_AFTER_STATUSES) {
      assert.equal(detectInvalidAdvancement(s), true);
    }
    assert.equal(detectInvalidAdvancement("Qualified"), false);
  });

  it("dry-run succeeds for eligible cohort", async () => {
    const plan = await authorizedPlan(["c1", "c2"]);
    const run = await runP187DryRun({
      plan,
      snapshots: snapshots(["c1", "c2"]),
      forceFlags: { canaryFramework: true, transitionAuthorityHrToOa: true },
    });
    assert.equal(run.ok, true);
    assert.equal(run.candidatesTransitioned, 2);
    assert.equal(run.executedProduction, false);
    assert.equal(run.productionWritesAttempted, 0);
    assert.equal(run.paperworkSendsAttempted, 0);
    assert.equal(run.melExportsAttempted, 0);
    assert.equal(run.dropboxSignChanges, 0);
  });

  it("stops immediately on first failure", async () => {
    const plan = await authorizedPlan(["ok", "bad", "never"]);
    const failingAdapter: P187ProductionAdapter = async (input) => {
      if (input.candidateId === "bad") {
        return {
          ok: false,
          productionAfter: input.productionBefore,
          lifecycleAfter: "OPERATOR_APPROVED",
          auditId: "a",
          detail: "forced failure",
        };
      }
      return dryRunProductionAdapter(input);
    };
    const run = await runP187DryRun({
      plan,
      snapshots: snapshots(["ok", "bad", "never"]),
      adapter: failingAdapter,
      forceFlags: { canaryFramework: true, transitionAuthorityHrToOa: true },
    });
    assert.equal(run.ok, false);
    assert.equal(run.status, "stopped_on_failure");
    assert.equal(run.results.length, 2); // ok + bad; never not processed
    assert.equal(run.results[1]!.ok, false);
    assert.ok(run.audit.some((a) => a.action === "stop_on_failure"));
  });

  it("refuses production canary execution by default", async () => {
    clearFlags();
    const plan = await authorizedPlan(["c1"]);
    const run = await executeP187ProductionCanary({
      plan,
      snapshots: snapshots(["c1"]),
      forceFlags: {
        canaryFramework: true,
        transitionAuthorityHrToOa: true,
        executeProductionCanary: false,
      },
    });
    assert.equal(run.status, "refused");
    assert.equal(run.executedProduction, false);
    assert.equal(run.productionWritesAttempted, 0);
  });

  it("refuses production even when execute flag on without allowProductionExecution", async () => {
    const plan = await authorizedPlan(["c1"]);
    const run = await executeP187ProductionCanary({
      plan,
      snapshots: snapshots(["c1"]),
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

  it("reconciliation detects mismatches, duplicates, skips, invalid states", () => {
    const report = buildReconciliationReport({
      forceFlags: { reconciliation: true },
      results: [
        {
          candidateId: "m1",
          ok: true,
          productionBefore: "Qualified",
          productionAfter: "Qualified",
          lifecycleBefore: "HIRING_RECOMMENDATION",
          lifecycleAfter: "OPERATOR_APPROVED",
          p186Expected: "OPERATOR_APPROVED",
          mismatch: false,
          duplicateTransition: false,
          skippedTransition: false,
          invalidStateChange: false,
          auditId: "a1",
          detail: "ok",
        },
        {
          candidateId: "m2",
          ok: false,
          productionBefore: "Qualified",
          productionAfter: "Paperwork Needed",
          lifecycleBefore: "HIRING_RECOMMENDATION",
          lifecycleAfter: "PAPERWORK_NEEDED",
          p186Expected: "OPERATOR_APPROVED",
          mismatch: true,
          duplicateTransition: true,
          skippedTransition: false,
          invalidStateChange: true,
          auditId: null,
          detail: "bad",
        },
        {
          candidateId: "m3",
          ok: false,
          productionBefore: "Qualified",
          productionAfter: null,
          lifecycleBefore: "HIRING_RECOMMENDATION",
          lifecycleAfter: "HIRING_RECOMMENDATION",
          p186Expected: "OPERATOR_APPROVED",
          mismatch: true,
          duplicateTransition: false,
          skippedTransition: true,
          invalidStateChange: false,
          auditId: null,
          detail: "skip",
        },
      ],
    });
    assert.ok(!("ok" in report && report.ok === false));
    const r = report as Exclude<typeof report, { ok: false }>;
    assert.ok(r.mismatches >= 1);
    assert.ok(r.duplicateTransitions >= 1);
    assert.ok(r.skippedTransitions >= 1);
    assert.ok(r.invalidStateChanges >= 1);
    assert.ok(r.auditGaps >= 1);
    assert.ok(r.findings.some((f) => f.kind === "match"));
  });

  it("evaluateCandidateOutcome flags invalid Paperwork Needed advancement", () => {
    const outcome = evaluateCandidateOutcome({
      snapshot: snapshots(["z"])[0]!,
      productionAfter: "Paperwork Needed",
      lifecycleAfter: "PAPERWORK_NEEDED",
    });
    assert.equal(outcome.invalidStateChange, true);
    assert.equal(outcome.mismatch, true);
  });

  it("rollback restores legacy ownership and preserves audit", async () => {
    const plan = await authorizedPlan(["c1"]);
    const run = await runP187DryRun({
      plan,
      snapshots: snapshots(["c1"]),
      forceFlags: { canaryFramework: true, transitionAuthorityHrToOa: true },
    });
    const rb = rollbackP187Canary({
      plan,
      results: run.results,
      auditLog: run.audit,
      forceFlags: { rollback: true },
      executeRestore: true,
    });
    assert.equal(rb.ok, true);
    assert.equal(rb.restoredLegacyOwnership, true);
    assert.equal(rb.auditPreserved, true);
    assert.equal(rb.dataLoss, false);
    assert.equal(rb.duplicateWorkflowEntries, false);
    assert.equal(rb.paperworkSends, 0);
    assert.equal(rb.melExports, 0);
    assert.equal(assertRollbackSafety(rb), true);
    assert.ok(rb.audit.some((a) => a.action === "rollback" && a.preserved));
  });

  it("rollback refused when flag off", async () => {
    const plan = await authorizedPlan(["c1"]);
    const rb = rollbackP187Canary({
      plan,
      results: [],
      forceFlags: { rollback: false },
    });
    assert.equal(rb.ok, false);
    assert.equal(rb.executed, false);
  });

  it("dashboard exposes required executive fields", () => {
    const dash = buildP187CutoverDashboard({
      forceFlags: { canaryDashboard: true },
      canaryStatus: "planned",
      rollbackReadiness: true,
    });
    assert.ok(!("enabled" in dash && dash.enabled === false));
    const d = dash as Exclude<typeof dash, { enabled: false }>;
    assert.equal(d.transition, P187_CANARY_TRANSITION);
    assert.ok(typeof d.candidatesEvaluated === "number");
    assert.ok(typeof d.candidatesTransitioned === "number");
    assert.ok(typeof d.successRate === "number");
    assert.equal(d.rollbackReadiness, true);
    assert.ok(d.legacyOwner.length > 0);
    assert.ok(d.p186Owner.includes("p187"));
    assert.ok(typeof d.mismatches === "number");
    assert.ok("stopReason" in d);
    assert.ok(["complete", "gaps", "not_started"].includes(d.auditStatus));
    assert.equal(d.safety.paperworkSendsAttempted, 0);
    assert.equal(d.safety.melExportsAttempted, 0);
    assert.equal(d.safety.productionCanaryExecuted, false);
    assert.equal(d.safety.otherTransitionsCutover, false);
    assert.equal(d.safety.continuousAutomationEnabled, false);
    assert.equal(d.safety.schedulerChanged, false);
  });

  it("architecture document scopes only HR→OA", () => {
    const arch = buildArchitectureDocument();
    assert.equal(arch.transition, P187_CANARY_TRANSITION);
    assert.ok(arch.outOfScope.some((s) => /Paperwork/i.test(s)));
    assert.ok(arch.outOfScope.some((s) => /MEL/i.test(s)));
    assert.ok(arch.safetyWalls.some((s) => /Production canary execute flag default OFF/i.test(s)));
  });

  it("authorization fingerprint blocks cohort swap", async () => {
    const plan = await authorizedPlan(["a", "b"]);
    const swapped = {
      ...plan,
      cohortIds: Object.freeze(["a", "c"]) as unknown as readonly string[],
    };
    assert.equal(assertAuthorizationMatchesPlan(swapped).ok, false);
  });

  it("dry-run refuses without authority flag", async () => {
    const plan = await authorizedPlan(["c1"]);
    const run = await runP187DryRun({
      plan,
      snapshots: snapshots(["c1"]),
      forceFlags: { canaryFramework: true, transitionAuthorityHrToOa: false },
    });
    assert.equal(run.status, "refused");
  });

  it("no paperwork/MEL/P184/P185 imports or scheduler activation in module", async () => {
    const files = (await readdir(MOD_DIR)).filter(
      (f) => f.endsWith(".ts") && !f.includes(".test."),
    );
    const joined = (
      await Promise.all(files.map((f) => readFile(path.join(MOD_DIR, f), "utf8")))
    ).join("\n");
    assert.equal(
      /from\s+["']@\/lib\/p184|from\s+["']@\/lib\/p185-production|import\s+.*executeOnboardingSend|import\s+.*sendPaperwork|exportToMelApi|callMelApi/i.test(
        joined,
      ),
      false,
    );
    assert.equal(/cron\.schedule|setInterval\(|enableScheduler\(/i.test(joined), false);
    assert.equal(/upsertCandidateWorkflow/i.test(joined), false);
  });

  it("framework flag required to build plan", () => {
    clearFlags();
    const plan = buildP187CanaryPlan({ cohortIds: ["a"] });
    assert.equal("ok" in plan && plan.ok === false, true);
  });

  it("duplicate transition detection via prior count", () => {
    const outcome = evaluateCandidateOutcome({
      snapshot: snapshots(["d"])[0]!,
      productionAfter: "Qualified",
      lifecycleAfter: "OPERATOR_APPROVED",
      priorTransitionCount: 1,
    });
    assert.equal(outcome.duplicateTransition, true);
    assert.equal(outcome.mismatch, true);
  });
});
