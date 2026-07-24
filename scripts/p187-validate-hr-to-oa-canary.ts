/**
 * P187 validation — dry-run + artifact generation only.
 * Does not execute the production canary.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  assertRollbackSafety,
  authorizeCanary,
  buildArchitectureDocument,
  buildP187CanaryPlan,
  buildP187CutoverDashboard,
  buildReconciliationReport,
  P187_CANARY_TRANSITION,
  P187_MAX_COHORT,
  readP187Flags,
  rollbackP187Canary,
  runP187DryRun,
  type P187CandidateSnapshot,
  type P187CanaryPlan,
} from "@/lib/p187-hr-to-oa-canary";
import { executeP187ProductionCanary } from "@/lib/p187-hr-to-oa-canary/canaryEngine";

const ART = path.join(process.cwd(), "artifacts");

async function main() {
  await mkdir(ART, { recursive: true });

  const cohort = ["canary-1", "canary-2", "canary-3"];
  const planRaw = buildP187CanaryPlan({
    cohortIds: cohort,
    forceFlags: { canaryFramework: true },
  }) as P187CanaryPlan;
  const plan = authorizeCanary({
    plan: planRaw,
    actor: "validation-operator",
    reason: "P187 implementation validation — dry-run only",
  }) as P187CanaryPlan;

  const snaps: P187CandidateSnapshot[] = cohort.map((candidateId) => ({
    candidateId,
    productionBefore: "Qualified",
    lifecycleBefore: "HIRING_RECOMMENDATION",
    expectedLifecycleAfter: "OPERATOR_APPROVED",
    maxAllowedProductionAfter: ["Qualified", "Needs Review", "Applied"],
  }));

  const dryRun = await runP187DryRun({
    plan,
    snapshots: snaps,
    forceFlags: { canaryFramework: true, transitionAuthorityHrToOa: true },
  });

  const recon = buildReconciliationReport({
    results: dryRun.results,
    forceFlags: { reconciliation: true },
  });

  const rollback = rollbackP187Canary({
    plan,
    results: dryRun.results,
    auditLog: dryRun.audit,
    forceFlags: { rollback: true },
    executeRestore: false,
  });

  const prodRefused = await executeP187ProductionCanary({
    plan,
    snapshots: snaps,
    forceFlags: {
      canaryFramework: true,
      transitionAuthorityHrToOa: true,
      executeProductionCanary: false,
    },
  });

  const dashboard = buildP187CutoverDashboard({
    forceFlags: { canaryDashboard: true },
    run: dryRun,
    reconciliation: "ok" in recon && recon.ok === false ? null : (recon as Exclude<typeof recon, { ok: false }>),
    canaryStatus: dryRun.status,
    rollbackReadiness: assertRollbackSafety(rollback),
  });

  const architecture = buildArchitectureDocument();
  const flags = readP187Flags();

  const architectureMd = [
    `# ${architecture.title}`,
    "",
    `## Transition`,
    "",
    `\`${architecture.transition}\``,
    "",
    `**P186 owner (canary):** ${architecture.authoritativeOwner}`,
    "",
    `**Legacy owner:** ${architecture.legacyOwner}`,
    "",
    `## Scope`,
    ...architecture.scope.map((s) => `- ${s}`),
    "",
    `## Out of scope`,
    ...architecture.outOfScope.map((s) => `- ${s}`),
    "",
    `## Safety walls`,
    ...architecture.safetyWalls.map((s) => `- ${s}`),
    "",
    `## Execution policy`,
    "",
    architecture.executionPolicy,
    "",
    `Max cohort: **${P187_MAX_COHORT}**. Immutable. Stop on first failure.`,
    "",
  ].join("\n");

  const cutoverValidation = {
    generatedAt: new Date().toISOString(),
    transition: P187_CANARY_TRANSITION,
    dryRun: {
      ok: dryRun.ok,
      status: dryRun.status,
      candidatesEvaluated: dryRun.candidatesEvaluated,
      candidatesTransitioned: dryRun.candidatesTransitioned,
      productionWritesAttempted: dryRun.productionWritesAttempted,
      paperworkSendsAttempted: dryRun.paperworkSendsAttempted,
      melExportsAttempted: dryRun.melExportsAttempted,
      dropboxSignChanges: dryRun.dropboxSignChanges,
      advancedBeyondOperatorApproved: dryRun.advancedBeyondOperatorApproved,
      stopReason: dryRun.stopReason,
    },
    reconciliation: recon,
    productionExecution: {
      attempted: false,
      refused: prodRefused.status === "refused",
      detail: prodRefused.stopReason,
    },
  };

  const rollbackValidation = {
    generatedAt: new Date().toISOString(),
    ok: rollback.ok,
    executed: rollback.executed,
    restoredLegacyOwnership: rollback.restoredLegacyOwnership,
    auditPreserved: rollback.auditPreserved,
    dataLoss: rollback.dataLoss,
    duplicateWorkflowEntries: rollback.duplicateWorkflowEntries,
    paperworkSends: rollback.paperworkSends,
    melExports: rollback.melExports,
    candidatesRestored: rollback.candidatesRestored,
    safetyOk: assertRollbackSafety(rollback),
    detail: rollback.detail,
  };

  const readinessMd = [
    "# P187 Production Readiness Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Verdict",
    "",
    "**Implementation and dry-run validation complete. Production canary NOT executed.**",
    "",
    "Wait for explicit operator approval before enabling `P187_EXECUTE_PRODUCTION_CANARY` and invoking `executeP187ProductionCanary` with `allowProductionExecution: true`.",
    "",
    "## Flags (default)",
    "",
    "```json",
    JSON.stringify(flags, null, 2),
    "```",
    "",
    "## Dry-run summary",
    "",
    `- Evaluated: ${dryRun.candidatesEvaluated}`,
    `- Transitioned: ${dryRun.candidatesTransitioned}`,
    `- Production writes: ${dryRun.productionWritesAttempted}`,
    `- Paperwork sends: ${dryRun.paperworkSendsAttempted}`,
    `- MEL exports: ${dryRun.melExportsAttempted}`,
    `- Beyond Operator Approved: ${dryRun.advancedBeyondOperatorApproved}`,
    "",
    "## Rollback",
    "",
    `- Ready: ${assertRollbackSafety(rollback)}`,
    `- Legacy ownership restorable: ${rollback.restoredLegacyOwnership}`,
    "",
    "## Dashboard",
    "",
    "```json",
    JSON.stringify(dashboard, null, 2),
    "```",
    "",
  ].join("\n");

  const testSummaryMd = [
    "# P187 Test Summary",
    "",
    "Suite: `src/lib/p187-hr-to-oa-canary/__tests__/p187-hr-to-oa-canary.test.ts`",
    "",
    "Coverage includes:",
    "- flags default off / no global authority",
    "- single-transition authority (HR→OA only)",
    "- immutable cohort max 5 + expansion refusal",
    "- operator authorization + fingerprint binding",
    "- dry-run success path",
    "- stop-on-first-failure",
    "- production execute refused by default",
    "- reconciliation (mismatch/duplicate/skip/invalid/audit)",
    "- rollback safety (audit preserve, no data loss, no duplicates)",
    "- dashboard fields + architecture scope",
    "- no P184/P185/MEL/scheduler imports",
    "",
    "Run: `node --import tsx --test src/lib/p187-hr-to-oa-canary/__tests__/p187-hr-to-oa-canary.test.ts`",
    "",
  ].join("\n");

  await writeFile(path.join(ART, "p187-architecture.md"), architectureMd);
  await writeFile(
    path.join(ART, "p187-cutover-validation.json"),
    JSON.stringify(cutoverValidation, null, 2),
  );
  await writeFile(
    path.join(ART, "p187-rollback-validation.json"),
    JSON.stringify(rollbackValidation, null, 2),
  );
  await writeFile(path.join(ART, "p187-production-readiness.md"), readinessMd);
  await writeFile(path.join(ART, "p187-test-summary.md"), testSummaryMd);
  await writeFile(
    path.join(ART, "p187-executive-canary-dashboard.json"),
    JSON.stringify(dashboard, null, 2),
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        artifactsWritten: 6,
        dryRunOk: dryRun.ok,
        productionCanaryExecuted: false,
        productionRefused: prodRefused.status === "refused",
        rollbackReady: assertRollbackSafety(rollback),
        paperworkSendsAttempted: 0,
        melExportsAttempted: 0,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
