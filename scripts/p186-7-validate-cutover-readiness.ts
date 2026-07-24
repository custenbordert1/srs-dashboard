/**
 * P186.7 read-only validation + artifact writer.
 * Does not disable writers, cut over production, send paperwork, or export MEL.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  assertOwnershipCompleteness,
  buildArchitectureDoc,
  buildCutoverValidationSummary,
  buildRepositoryRetirementPlan,
  buildRollbackPlans,
  buildSchedulerConsolidationPlan,
  createDefaultWriterControlRegistry,
  evaluateCutoverReadinessGates,
  fixtureShadowParityNearPerfect,
  getFreezeOrder,
  P1867_OWNERSHIP_MATRIX,
  readP1867Flags,
  resolveAllowedStage,
} from "@/lib/p186-7-lifecycle-cutover";
import { classifyFreezeReadiness } from "@/lib/p186-7-lifecycle-cutover/freezeControls";

const ROOT = process.cwd();
const ART = path.join(ROOT, "artifacts");

async function main() {
  await mkdir(ART, { recursive: true });

  const ownership = assertOwnershipCompleteness();
  const arch = buildArchitectureDoc();
  const registry = createDefaultWriterControlRegistry();
  const parity = fixtureShadowParityNearPerfect();
  // Production observation placeholder: fixture used for planning; no live cutover.
  const { freezeReady, freezeBlocked } = classifyFreezeReadiness(registry, {});

  const readiness = evaluateCutoverReadinessGates({
    shadowParity: parity,
    unresolvedLifecycleOperations: 0,
    duplicateWriterWritesInWindow: 0,
    neonHealthy: true,
    schemaHealthy: true,
    eventIngestionHealthy: true,
    reconcilerHealthy: true,
    workflowAdapterHealthy: true,
    auditPersistenceHealthy: true,
    rollbackTested: true,
    operatorDashboardReviewed: false,
    executiveDashboardReviewed: false,
    p184P185Isolated: true,
    paperworkModeDryRun: true,
    automaticMelExportDisabled: true,
  });

  const validation = buildCutoverValidationSummary({ shadowParity: parity });
  const rollbacks = buildRollbackPlans();
  const scheduler = buildSchedulerConsolidationPlan();
  const retirement = buildRepositoryRetirementPlan();
  const flags = readP1867Flags();
  const stage = resolveAllowedStage("stage_1_read_only_enablement");

  // 1) Ownership matrix markdown
  const matrixMd = [
    "# P186.7 Final Lifecycle Ownership Matrix",
    "",
    "## Authoritative architecture",
    "",
    `- **Authoritative lifecycle store:** ${arch.authoritativeLifecycleStore}`,
    `- **Fallback authority:** ${arch.fallbackAuthority}`,
    "",
    "### Event authority",
    ...Object.entries(arch.eventAuthority).map(([k, v]) => `- **${k}:** ${v}`),
    "",
    "### Allowed writers",
    ...arch.allowedWriters.map((w) => `- ${w}`),
    "",
    "### Prohibited writers (post-freeze)",
    ...arch.prohibitedWriters.map((w) => `- ${w}`),
    "",
    "### Isolated subsystems",
    ...arch.isolatedSubsystems.map((s) => `- ${s}`),
    "",
    "## Transition ownership",
    "",
    "| Transition | Future owner | Competing | Adapter | Approval | Idempotency | Rollback | Status |",
    "|---|---|---|---|---|---|---|---|",
    ...P1867_OWNERSHIP_MATRIX.map(
      (r) =>
        `| ${r.transition} | ${r.futureAuthoritativeWriter} | ${r.competingWriters.join("; ") || "—"} | ${r.productionAdapter} | ${r.operatorApprovalRequired} | ${r.idempotencyRule} | ${r.rollbackWriter} | ${r.migrationStatus} |`,
    ),
    "",
    `Completeness: **${ownership.ok ? "PASS" : "FAIL"}** (P184/P185 preserved: ${ownership.p184P185Preserved})`,
    "",
    "P186.7 does not make P186 authoritative. Production workflow remains SoR.",
    "",
  ].join("\n");

  // 2) Cutover readiness JSON
  const cutoverReadiness = {
    generatedAt: new Date().toISOString(),
    currentStage: stage.stage,
    maxImplementedStage: "stage_1_read_only_enablement",
    stage2BlockedWithoutAuthorization: true,
    flags,
    gates: readiness,
    freezeOrder: getFreezeOrder(),
    freezeReady: freezeReady.map((f) => f.writerId),
    freezeBlocked: freezeBlocked.map((f) => ({
      writerId: f.writerId,
      reasons: f.blockedReasons,
    })),
    writersActuallyDisabled: 0,
    p186Authoritative: false,
    recommendation:
      "First controlled production canary (future): Hiring Recommendation→Operator Approved on a max-5 immutable cohort after all gates pass and explicit operator authorization.",
  };

  // 3) Shadow parity
  const shadowReport = {
    generatedAt: new Date().toISOString(),
    note: "Planning fixture / read-only observation shape — not a production cutover sample",
    ...parity,
    passesThreshold: parity.matchRate >= 0.95 && parity.criticalMismatches === 0,
  };

  // 4) Writer freeze plan markdown
  const freezeMd = [
    "# P186.7 Writer Freeze Plan",
    "",
    "Do **not** freeze writers in this phase. Plan only.",
    "",
    "## Freeze order",
    ...getFreezeOrder().map((id, i) => `${i + 1}. \`${id}\``),
    "",
    "## Never freeze",
    "- p184-autonomous-paperwork-send-engine",
    "- p185-production-paperwork-runner",
    "- dropbox-sign-webhook",
    "- candidate-workflow-store-core",
    "",
    "## Pre-freeze gates",
    "- replacement healthy + shadow parity",
    "- zero unresolved ops / no active lease / no queued work loss",
    "- audit complete + rollback flag + monitoring + operator approval",
    "",
    "## Current classification (default blocked until gates supplied)",
    "",
    `Freeze-ready: ${freezeReady.length}`,
    `Freeze-blocked: ${freezeBlocked.length}`,
    "",
    ...freezeBlocked.map((f) => `- **${f.writerId}:** ${f.blockedReasons.join("; ")}`),
    "",
    "writers actually disabled = **0**",
    "",
  ].join("\n");

  // 5) Rollback plan
  const rollbackMd = [
    "# P186.7 Rollback Plan",
    "",
    "Rollback must not resend paperwork, duplicate MEL exports, delete audit history, or silently overwrite production state.",
    "",
    ...rollbacks.flatMap((r) => [
      `## ${r.transitionGroup}`,
      "",
      `- **Trigger:** ${r.rollbackTrigger}`,
      `- **Flag:** ${r.rollbackFlag}`,
      `- **Previous writer:** ${r.previousAuthoritativeWriter}`,
      `- **State reconstruction:** ${r.stateReconstruction}`,
      `- **Pending ops:** ${r.pendingOperationRecovery}`,
      `- **Audit:** ${r.auditPreservation}`,
      `- **Queues:** ${r.queuePreservation}`,
      `- **Notify:** ${r.operatorNotification}`,
      `- **Verify:** ${r.verificationSteps.join("; ")}`,
      `- **Forbids:** ${r.forbids.join("; ")}`,
      "",
    ]),
  ].join("\n");

  // 6) Retirement plan
  const retirementMd = [
    "# P186.7 Repository Retirement Plan",
    "",
    "Identify only — **no deletions** in P186.7.",
    "",
    "| Item | Path | Replacement | Safe removal phase | Rollback | Deleted now |",
    "|---|---|---|---|---|---|",
    ...retirement.map(
      (i) =>
        `| ${i.item} | \`${i.path}\` | ${i.replacement} | ${i.safeRemovalPhase} | ${i.rollbackRequirement} | ${i.deletedNow} |`,
    ),
    "",
  ].join("\n");

  // 7) Readiness report
  const readinessMd = [
    "# P186.7 Readiness Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Validation summary",
    "",
    "```json",
    JSON.stringify(validation, null, 2),
    "```",
    "",
    "## Scheduler consolidation (not enabled)",
    "",
    "```json",
    JSON.stringify(scheduler, null, 2),
    "```",
    "",
    "## Safety walls",
    "",
    `- production writes attempted: **${validation.productionWritesAttempted}**`,
    `- paperwork sends attempted: **${validation.paperworkSendsAttempted}**`,
    `- MEL writes attempted: **${validation.melWritesAttempted}**`,
    `- writers actually disabled: **${validation.writersActuallyDisabled}**`,
    "",
    "## Recommendation",
    "",
    "Stop after P186.7 readiness planning. First controlled production transition canary (Stage 2), only with explicit operator approval:",
    "",
    "1. Transition: **Hiring Recommendation → Operator Approved** (low-risk, approval-gated, non-send).",
    "2. Immutable cohort ≤ 5.",
    "3. All readiness gates green + dashboards reviewed.",
    "4. Immediate rollback via `P186_ROLLBACK_CONTROLS`.",
    "5. Stop-on-first-failure; no cohort expansion.",
    "",
    "Do not perform the production cutover without explicit operator approval.",
    "",
  ].join("\n");

  await writeFile(path.join(ART, "p186-7-final-ownership-matrix.md"), matrixMd);
  await writeFile(
    path.join(ART, "p186-7-cutover-readiness.json"),
    JSON.stringify(cutoverReadiness, null, 2),
  );
  await writeFile(
    path.join(ART, "p186-7-shadow-parity-report.json"),
    JSON.stringify(shadowReport, null, 2),
  );
  await writeFile(path.join(ART, "p186-7-writer-freeze-plan.md"), freezeMd);
  await writeFile(path.join(ART, "p186-7-rollback-plan.md"), rollbackMd);
  await writeFile(path.join(ART, "p186-7-repository-retirement-plan.md"), retirementMd);
  await writeFile(path.join(ART, "p186-7-readiness-report.md"), readinessMd);

  console.log(
    JSON.stringify(
      {
        ok: true,
        artifactsWritten: 7,
        validation,
        readinessOk: readiness.ok,
        freezeReady: freezeReady.length,
        freezeBlocked: freezeBlocked.length,
        ownershipOk: ownership.ok,
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
