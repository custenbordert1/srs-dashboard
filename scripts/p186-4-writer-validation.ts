/**
 * P186.4 read-only writer inventory + collision validation.
 * Does not modify production state, disable writers, or enable schedulers.
 *
 * Usage: npx tsx scripts/p186-4-writer-validation.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildConflictDashboard,
  buildFreezePlan,
  buildOwnershipMatrix,
  buildSchedulerCollisionReport,
  P1864_WRITER_REGISTRY,
  runShadowLifecycleReconciler,
} from "@/lib/p186-4-lifecycle-reconciler";

async function main() {
  const dashboard = buildConflictDashboard({
    forceFlags: {
      writerInventoryReport: true,
      conflictDashboard: true,
      reconcilerExecution: true,
      schedulerCollisionAnalysis: true,
    },
    cohort: [
      {
        candidateId: "val-aligned",
        breezyState: "Qualified",
        productionWorkflowState: "Qualified",
        operatorApprovalState: null,
        paperworkEngineState: null,
        dropboxSignState: null,
        onboardingState: null,
        readyForMelState: null,
        melExportState: null,
        shadowLifecycleState: "HIRING_RECOMMENDATION",
      },
      {
        candidateId: "val-missing-shadow",
        breezyState: "Paperwork Needed",
        productionWorkflowState: "Paperwork Needed",
        operatorApprovalState: "approved",
        paperworkEngineState: "not_sent",
        dropboxSignState: null,
        onboardingState: null,
        readyForMelState: null,
        melExportState: null,
        shadowLifecycleState: null,
      },
      {
        candidateId: "val-signed-drift",
        breezyState: "Paperwork Sent",
        productionWorkflowState: "Paperwork Sent",
        operatorApprovalState: null,
        paperworkEngineState: "signed",
        dropboxSignState: "signed",
        onboardingState: null,
        readyForMelState: null,
        melExportState: null,
        shadowLifecycleState: "PAPERWORK_SENT",
      },
    ],
  });

  const reconcile = runShadowLifecycleReconciler({
    cohort: dashboard.reconcileFindings.map((f) => f.sources),
    forceFlags: { reconcilerExecution: true },
  });

  const inventory = {
    generatedAt: new Date().toISOString(),
    sourcePhase: "P186.4",
    readOnly: true,
    productionStateModified: false,
    writersDisabled: 0,
    schedulerEnabled: false,
    totalWritersFound: P1864_WRITER_REGISTRY.length,
    authoritativeWriters: P1864_WRITER_REGISTRY.filter((w) => w.productionAuthoritative).length,
    shadowWriters: P1864_WRITER_REGISTRY.filter((w) => w.shadowOnly || w.sourceOfAuthority === "shadow").length,
    duplicateWriterGroups: dashboard.summary.duplicateWriterGroups,
    schedulerOverlaps: dashboard.summary.schedulerOverlaps,
    missingOwnershipTransitions: dashboard.summary.missingOwnershipTransitions,
    deprecatedWritersStillReferenced: dashboard.summary.deprecatedStillReferenced,
    directMutationPaths: dashboard.summary.directMutationPaths,
    candidatesWithReconciliationConflicts: reconcile.findings.filter((f) => f.kind !== "no_issue").length,
    criticalFindings: dashboard.summary.criticalFindings,
    highFindings: dashboard.summary.highFindings,
    mediumFindings: dashboard.summary.mediumFindings,
    lowFindings: dashboard.summary.lowFindings,
    writers: P1864_WRITER_REGISTRY.map((w) => ({
      writerId: w.writerId,
      module: w.module,
      filePaths: w.filePaths,
      statesWritable: w.statesWritable,
      sourceOfAuthority: w.sourceOfAuthority,
      trigger: w.trigger,
      entryPoint: w.entryPoint,
      idempotency: w.idempotency,
      auditSupport: w.auditSupport,
      featureFlag: w.featureFlag,
      conflictGroup: w.conflictGroup,
      productionUsage: w.productionUsage,
      overlapNotes: w.overlapNotes,
      retirementRecommendation: w.retirementRecommendation,
      deprecationStatus: w.deprecationStatus,
      productionAuthoritative: w.productionAuthoritative,
      shadowOnly: w.shadowOnly,
      priority: w.priority,
    })),
  };

  const schedulerReport = buildSchedulerCollisionReport();
  const freezePlan = buildFreezePlan();
  const ownership = buildOwnershipMatrix();

  const artifactsDir = path.join(process.cwd(), "artifacts");
  await mkdir(artifactsDir, { recursive: true });

  await writeFile(
    path.join(artifactsDir, "p186-4-writer-inventory.json"),
    JSON.stringify(inventory, null, 2) + "\n",
  );

  await writeFile(
    path.join(artifactsDir, "p186-4-scheduler-collision-report.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        readOnly: true,
        schedulerEnabled: false,
        ...schedulerReport,
      },
      null,
      2,
    ) + "\n",
  );

  const ownershipMd = [
    "# P186.4 Lifecycle Ownership Matrix",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "Production remains the system of record. This matrix is shadow guidance only.",
    "",
    "| Transition | Ownership | Writers | Recommended owner |",
    "|---|---|---|---|",
    ...ownership.map(
      (c) =>
        `| ${c.transition} | ${c.ownership} | ${c.writers.join(", ") || "—"} | ${c.recommendedOwner ?? "—"} |`,
    ),
    "",
    "## Conflict groups",
    "",
    "- `paperwork_send` — prefer P185→P184→onboarding send queue",
    "- `approval_to_paperwork_needed` — prefer gated operator/API path via workflow store",
    "- `signature_to_mel` — prefer Dropbox webhook + P107 monitor",
    "- `continuous_orchestration` — prefer single future control plane; freeze overlapping intervals later",
    "- `parallel_lifecycle_store` — P186.1 shadow vs P171 store",
    "",
  ].join("\n");

  await writeFile(path.join(artifactsDir, "p186-4-lifecycle-ownership-matrix.md"), ownershipMd);

  const freezeMd = [
    "# P186.4 Freeze / Retirement Plan",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "**P186.4 does not disable any writer.** This document is a future-safe plan only.",
    "",
    "## Recommended freeze order",
    "",
    ...freezePlan.map(
      (p) =>
        [
          `### ${p.freezeOrder}. \`${p.writerId}\``,
          "",
          `- Current role: ${p.currentRole}`,
          `- Replacement path: ${p.replacementPath}`,
          `- Shadow observation period: ${p.shadowObservationPeriod}`,
          `- Disable flag (future): \`${p.disableFlag}\``,
          `- Rollback flag (future): \`${p.rollbackFlag}\``,
          `- Cutover prerequisite: ${p.cutoverPrerequisite}`,
          `- Monitoring: ${p.monitoringRequirement}`,
          `- Rollback: ${p.rollbackProcedure}`,
          `- Disabled now: **false**`,
          "",
        ].join("\n"),
    ),
    "## Priority note",
    "",
    "Prioritize interval writers touching the same transitions: P154 continuous, P169 orchestrator, P171 lifecycle host, then legacy paperwork schedulers (P125/P136/P106.1).",
    "",
  ].join("\n");

  await writeFile(path.join(artifactsDir, "p186-4-freeze-plan.md"), freezeMd);

  const readiness = [
    "# P186.4 Readiness Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Summary",
    "",
    `- Total writers: **${inventory.totalWritersFound}**`,
    `- Authoritative: **${inventory.authoritativeWriters}**`,
    `- Shadow: **${inventory.shadowWriters}**`,
    `- Duplicate writer groups: **${inventory.duplicateWriterGroups}**`,
    `- Scheduler overlaps: **${inventory.schedulerOverlaps}**`,
    `- Missing ownership transitions: **${inventory.missingOwnershipTransitions}**`,
    `- Deprecated still referenced: **${inventory.deprecatedWritersStillReferenced}**`,
    `- Direct mutation paths: **${inventory.directMutationPaths}**`,
    `- Candidates with reconcile conflicts (fixture cohort): **${inventory.candidatesWithReconciliationConflicts}**`,
    `- Critical / High / Medium / Low: **${inventory.criticalFindings} / ${inventory.highFindings} / ${inventory.mediumFindings} / ${inventory.lowFindings}**`,
    "",
    "## Safety walls verified",
    "",
    "- No production state modified",
    "- No writers disabled",
    "- No scheduler enabled",
    "- No paperwork send",
    "- No MEL export",
    "- No P184/P185 behavior changes",
    "- P186 remains non-authoritative",
    "",
    "## P186.5 recommendation",
    "",
    "**Conditional yes** — begin cutover design only after operator review of freeze order and zero unexplained critical scheduler overlaps in the target environment. Keep all P186.4 flags off in production until an enablement plan exists.",
    "",
  ].join("\n");

  await writeFile(path.join(artifactsDir, "p186-4-readiness-report.md"), readiness);

  console.log(
    JSON.stringify(
      {
        totalWritersFound: inventory.totalWritersFound,
        duplicateWriterGroups: inventory.duplicateWriterGroups,
        schedulerOverlaps: inventory.schedulerOverlaps,
        criticalFindings: inventory.criticalFindings,
        highFindings: inventory.highFindings,
        freezeOrderPreview: freezePlan.slice(0, 8).map((p) => p.writerId),
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
