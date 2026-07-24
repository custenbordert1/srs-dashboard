import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import {
  assertCanaryImmutable,
  assertNothingDeleted,
  assertOwnershipCompleteness,
  assertRollbackForbids,
  assertSchedulerNotActivated,
  buildArchitectureDoc,
  buildCutoverDashboard,
  buildCutoverValidationSummary,
  buildRepositoryRetirementPlan,
  buildRollbackPlans,
  buildSchedulerConsolidationPlan,
  buildShadowParityReport,
  buildTransitionCanaryPlan,
  classifyFreezeReadiness,
  createDefaultWriterControlRegistry,
  evaluateCutoverReadinessGates,
  evaluateFreezeGates,
  executeRollback,
  executeTransitionCanary,
  fixtureShadowParityNearPerfect,
  fixtureShadowParityWithCritical,
  getFreezeOrder,
  hasGlobalAuthoritativeFlag,
  P1867_FREEZE_ORDER,
  P1867_OWNERSHIP_MATRIX,
  P1867_TRANSITIONS,
  readP1867Flags,
  requestWriterFreeze,
  resolveAllowedStage,
  shadowParityPassesThreshold,
  simulateCanaryStopOnFailure,
  simulateRollbackRestoration,
  WriterControlRegistry,
} from "@/lib/p186-7-lifecycle-cutover";

const MOD_DIR = path.join(
  process.cwd(),
  "src/lib/p186-7-lifecycle-cutover",
);

async function collectModuleSources(): Promise<string[]> {
  const files = await readdir(MOD_DIR);
  const ts = files.filter((f) => f.endsWith(".ts") && !f.includes(".test."));
  return Promise.all(ts.map((f) => readFile(path.join(MOD_DIR, f), "utf8")));
}

const PASSING_GATES = {
  replacementHealthy: true,
  shadowParityOk: true,
  unresolvedOperations: 0,
  activeLease: false,
  queuedWorkAtRisk: false,
  auditHistoryComplete: true,
  rollbackFlagExists: true,
  monitoringActive: true,
  operatorApprovalRecorded: true,
} as const;

describe("P186.7 controlled lifecycle cutover", () => {
  it("feature flags default off", () => {
    for (const k of [
      "P186_CUTOVER_DASHBOARD",
      "P186_WRITER_FREEZE_CONTROLS",
      "P186_TRANSITION_CANARY_FRAMEWORK",
      "P186_ROLLBACK_CONTROLS",
      "P186_LIFECYCLE_AUTHORITY_BY_TRANSITION_GROUP",
      "P186_RECONCILER_SCHEDULER",
    ]) {
      delete process.env[k];
    }
    const flags = readP1867Flags();
    assert.equal(flags.cutoverDashboard, false);
    assert.equal(flags.writerFreezeControls, false);
    assert.equal(flags.transitionCanaryFramework, false);
    assert.equal(flags.rollbackControls, false);
    assert.equal(flags.lifecycleAuthorityByTransitionGroup, false);
    assert.equal(flags.reconcilerScheduler, false);
  });

  it("no global authoritative flag", () => {
    delete process.env.P186_AUTHORITATIVE;
    delete process.env.P186_ENABLE_ALL_AUTHORITY;
    delete process.env.P186_GLOBAL_AUTHORITY;
    delete process.env.P186_CUTOVER_ALL;
    assert.equal(hasGlobalAuthoritativeFlag(), false);
    process.env.P186_ENABLE_ALL_AUTHORITY = "1";
    assert.equal(hasGlobalAuthoritativeFlag(), true);
    delete process.env.P186_ENABLE_ALL_AUTHORITY;
  });

  it("ownership matrix completeness and exactly one future owner", () => {
    assert.equal(P1867_OWNERSHIP_MATRIX.length, P1867_TRANSITIONS.length);
    const result = assertOwnershipCompleteness();
    assert.equal(result.ok, true);
    assert.deepEqual(result.missing, []);
    const owners = new Set(P1867_OWNERSHIP_MATRIX.map((r) => r.transition));
    assert.equal(owners.size, P1867_TRANSITIONS.length);
    for (const row of P1867_OWNERSHIP_MATRIX) {
      assert.ok(row.futureAuthoritativeWriter.length > 0);
      assert.equal(typeof row.futureAuthoritativeWriter, "string");
    }
  });

  it("P184/P185 ownership preservation", () => {
    const result = assertOwnershipCompleteness();
    assert.equal(result.p184P185Preserved, true);
    const send = P1867_OWNERSHIP_MATRIX.find(
      (r) => r.transition === "Paperwork Needed→Paperwork Sent",
    );
    assert.ok(send);
    assert.ok(send!.futureAuthoritativeWriter.includes("p184"));
    assert.ok(send!.futureAuthoritativeWriter.includes("p185"));
    assert.equal(send!.p184P185Preserved, true);
  });

  it("writer registry persistence", () => {
    const reg = createDefaultWriterControlRegistry();
    const json = reg.toJSON();
    assert.ok(json.length >= 8);
    const restored = WriterControlRegistry.fromJSON(json);
    assert.equal(restored.list().length, json.length);
    assert.equal(restored.get("p1547-continuous-recruiting-runner")?.freezeOrder, 1);
    assert.equal(restored.get("p184-autonomous-paperwork-send-engine")?.neverFreeze, true);
  });

  it("freeze order matches requirements", () => {
    const order = getFreezeOrder();
    assert.deepEqual([...order], [...P1867_FREEZE_ORDER]);
    assert.equal(order[0], "p1547-continuous-recruiting-runner");
    assert.equal(order[7], "p183-final-scoped-operator-send");
    assert.ok(!order.some((id) => id.startsWith("p184") || id.startsWith("p185")));
  });

  it("freeze gate validation and refusal when replacement unhealthy", () => {
    const unhealthy = evaluateFreezeGates({
      writerId: "p169-recruiting-orchestrator",
      ...PASSING_GATES,
      replacementHealthy: false,
    });
    assert.equal(unhealthy.ready, false);
    assert.ok(unhealthy.blockedReasons.some((r) => /Replacement path unhealthy/i.test(r)));
    assert.equal(unhealthy.wouldDisableNow, false);
  });

  it("freeze refusal with unresolved operations", () => {
    const blocked = evaluateFreezeGates({
      writerId: "p171-lifecycle-manager",
      ...PASSING_GATES,
      unresolvedOperations: 3,
    });
    assert.equal(blocked.ready, false);
    assert.ok(blocked.blockedReasons.some((r) => /unresolved/i.test(r)));
  });

  it("never freezes P184/P185 even with passing gates", () => {
    const p184 = evaluateFreezeGates({
      writerId: "p184-autonomous-paperwork-send-engine",
      ...PASSING_GATES,
    });
    assert.equal(p184.ready, false);
  });

  it("requestWriterFreeze never disables writers", () => {
    const reg = createDefaultWriterControlRegistry();
    const result = requestWriterFreeze({
      registry: reg,
      ctx: { writerId: "p1547-continuous-recruiting-runner", ...PASSING_GATES },
      forceFlags: { writerFreezeControls: true },
    });
    assert.equal(result.writersActuallyDisabled, 0);
    assert.equal(reg.get("p1547-continuous-recruiting-runner")?.disabledTimestamp, null);
    assert.notEqual(reg.get("p1547-continuous-recruiting-runner")?.currentStatus, "frozen");
  });

  it("shadow parity threshold and critical mismatch block", () => {
    const good = fixtureShadowParityNearPerfect();
    assert.ok(good.matchRate >= 0.95);
    assert.equal(good.criticalMismatches, 0);
    assert.equal(shadowParityPassesThreshold(good), true);

    const bad = fixtureShadowParityWithCritical();
    assert.ok(bad.criticalMismatches > 0);
    assert.equal(shadowParityPassesThreshold(bad), false);

    const gates = evaluateCutoverReadinessGates({
      shadowParity: bad,
      unresolvedLifecycleOperations: 0,
      duplicateWriterWritesInWindow: 0,
      neonHealthy: true,
      schemaHealthy: true,
      eventIngestionHealthy: true,
      reconcilerHealthy: true,
      workflowAdapterHealthy: true,
      auditPersistenceHealthy: true,
      rollbackTested: true,
      operatorDashboardReviewed: true,
      executiveDashboardReviewed: true,
      p184P185Isolated: true,
      paperworkModeDryRun: true,
      automaticMelExportDisabled: true,
    });
    assert.equal(gates.ok, false);
    assert.ok(gates.gates.some((g) => g.gateId === "zero_critical_mismatches" && !g.ok));
  });

  it("canary cohort immutability and stop-on-failure", () => {
    const plan = buildTransitionCanaryPlan({
      transition: "Hiring Recommendation→Operator Approved",
      cohortIds: ["a", "b", "c"],
    });
    assert.ok(!("ok" in plan && plan.ok === false));
    const p = plan as Exclude<typeof plan, { ok: false }>;
    assert.equal(p.immutable, true);
    assert.equal(p.executed, false);
    assert.equal(assertCanaryImmutable(p, ["a", "b", "c", "d"]).ok, false);
    assert.equal(assertCanaryImmutable(p, ["a", "b", "c"]).ok, true);

    const stop = simulateCanaryStopOnFailure([{ ok: true }, { ok: false }, { ok: true }]);
    assert.equal(stop.stopped, true);
    assert.equal(stop.processed, 2);
    assert.equal(stop.executedProduction, false);
  });

  it("canary and rollback execution refused in P186.7", () => {
    const plan = buildTransitionCanaryPlan({
      transition: "Signed→Onboarding Complete",
      cohortIds: ["x"],
    }) as Exclude<ReturnType<typeof buildTransitionCanaryPlan>, { ok: false }>;
    const canary = executeTransitionCanary({
      plan,
      forceFlags: { transitionCanaryFramework: true },
      operatorAuthorized: true,
    });
    assert.equal(canary.executed, false);
    assert.equal(canary.productionWritesAttempted, 0);

    const rb = executeRollback({
      transitionGroup: "operator_approval",
      forceFlags: { rollbackControls: true },
    });
    assert.equal(rb.executed, false);
    assert.equal(rb.productionWritesAttempted, 0);
  });

  it("rollback restoration preserves audit and queues; no resend/MEL", () => {
    assert.equal(assertRollbackForbids(), true);
    const sim = simulateRollbackRestoration({
      transitionGroup: "post_sign_mel",
      productionStateBefore: "Signed",
      productionStateAfterFailedCutover: "Onboarding Complete",
    });
    assert.equal(sim.restoredState, "Signed");
    assert.equal(sim.auditPreserved, true);
    assert.equal(sim.queuePreserved, true);
    assert.equal(sim.paperworkResent, false);
    assert.equal(sim.melDuplicated, false);
    assert.equal(sim.silentOverwrite, false);
    assert.equal(sim.productionWritesAttempted, 0);
    assert.ok(buildRollbackPlans().length >= 4);
  });

  it("duplicate prevention and transition-scoped authority", () => {
    const report = buildShadowParityReport([
      {
        candidateId: "c1",
        productionState: "A",
        shadowState: "A",
        match: true,
        missingShadow: false,
        impossibleTransition: false,
        staleEvent: false,
        duplicateWriterEvent: true,
        auditGap: false,
        ownershipConflict: true,
        critical: false,
      },
    ]);
    assert.equal(report.duplicateWriterEvents, 1);
    assert.equal(report.ownershipConflicts, 1);

    // Authority is per transition group flag — never global
    delete process.env.P186_LIFECYCLE_AUTHORITY_BY_TRANSITION_GROUP;
    assert.equal(readP1867Flags().lifecycleAuthorityByTransitionGroup, false);
    assert.equal(hasGlobalAuthoritativeFlag({} as NodeJS.ProcessEnv), false);
  });

  it("stage engine stops before Stage 2", () => {
    assert.equal(resolveAllowedStage("stage_0_shadow_only").allowed, true);
    assert.equal(resolveAllowedStage("stage_1_read_only_enablement").allowed, true);
    const blocked = resolveAllowedStage("stage_2_single_transition_canary");
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.stage, "stage_1_read_only_enablement");
  });

  it("scheduler not activated; retirement deletes nothing", () => {
    const plan = buildSchedulerConsolidationPlan();
    assert.equal(plan.schedulerActivatedNow, false);
    assert.equal(plan.reconciliationJob.enabledNow, false);
    assert.equal(assertSchedulerNotActivated(true).activated, false);
    const retirement = buildRepositoryRetirementPlan();
    assert.equal(assertNothingDeleted(retirement), true);
    assert.ok(retirement.length >= 8);
  });

  it("architecture + cutover dashboard safety walls", () => {
    const arch = buildArchitectureDoc();
    assert.ok(arch.authoritativeLifecycleStore.includes("candidate-workflow-store"));
    assert.ok(arch.isolatedSubsystems.some((s) => /P184\/P185/i.test(s)));

    const dash = buildCutoverDashboard({
      forceFlags: { cutoverDashboard: true },
      shadowParity: fixtureShadowParityNearPerfect(),
      gateByWriter: Object.fromEntries(
        getFreezeOrder().map((id) => [id, { ...PASSING_GATES }]),
      ),
      readinessOverrides: {
        operatorDashboardReviewed: true,
        executiveDashboardReviewed: true,
      },
    });
    assert.ok(!("enabled" in dash && dash.enabled === false));
    const d = dash as Exclude<typeof dash, { enabled: false }>;
    assert.equal(d.safety.productionWritesAttempted, 0);
    assert.equal(d.safety.paperworkSendsAttempted, 0);
    assert.equal(d.safety.melWritesAttempted, 0);
    assert.equal(d.safety.writersActuallyDisabled, 0);
    assert.equal(d.safety.schedulerActivated, false);
    assert.equal(d.safety.p186Authoritative, false);
    assert.equal(d.destructiveControlsEnabled, false);
    assert.equal(d.writersFrozen.length, 0);
  });

  it("validation summary expected zeros", () => {
    const summary = buildCutoverValidationSummary({
      shadowParity: fixtureShadowParityNearPerfect(),
    });
    assert.equal(summary.productionWritesAttempted, 0);
    assert.equal(summary.paperworkSendsAttempted, 0);
    assert.equal(summary.melWritesAttempted, 0);
    assert.equal(summary.writersActuallyDisabled, 0);
    assert.equal(summary.nothingDeleted, true);
    assert.equal(summary.lifecycleTransitionsMapped, 11);
  });

  it("freeze-ready classification with default blocked gates", () => {
    const reg = createDefaultWriterControlRegistry();
    const { freezeReady, freezeBlocked } = classifyFreezeReadiness(reg, {});
    assert.equal(freezeReady.length, 0);
    assert.equal(freezeBlocked.length, getFreezeOrder().length);
  });

  it("no paperwork-send imports or MEL write execution; no scheduler activation; no production cutover", async () => {
    const sources = await collectModuleSources();
    const joined = sources.join("\n");
    assert.equal(
      /from\s+["']@\/lib\/p184|from\s+["']@\/lib\/p185-production|from\s+["']@\/lib\/p185-3|import\s+.*executeOnboardingSend|import\s+.*sendPaperwork|exportToMelApi|callMelApi/i.test(
        joined,
      ),
      false,
    );
    assert.equal(/cron\.schedule|setInterval\(|enableScheduler\(/i.test(joined), false);
    assert.equal(/writersActuallyDisabled:\s*[1-9]/i.test(joined), false);
    assert.ok(/P186\.7 does not execute production transition canaries/i.test(joined));
  });
});
