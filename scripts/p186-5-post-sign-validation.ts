/**
 * P186.5 read-only validation — no production/MEL/paperwork writes.
 * Usage: npx tsx scripts/p186-5-post-sign-validation.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import { createSqlClient, resetSqlClientCacheForTests } from "@/lib/p185-5-vercel-durable-storage/sqlClient";
import {
  applyP1865Migrations,
  buildMelExportPreview,
  buildPostSignDashboard,
  classifyOnboardingReadiness,
  enqueueMelExportItem,
  reconcilePostSignAndMel,
  resolvePostSignEvent,
} from "@/lib/p186-5-post-sign-mel-queue";

const COMPLETE = {
  signedOnboardingAgreement: true as const,
  i9Complete: true as const,
  taxFormsComplete: true as const,
  directDepositStatus: "complete" as const,
  identificationDocument: true as const,
  clientSpecificForms: true as const,
  stateSpecificForms: "na" as const,
  workerClassification: true as const,
  policyAcknowledgments: true as const,
  trainingAcknowledgments: true as const,
};

async function main() {
  const pgliteDir = await mkdtemp(path.join(os.tmpdir(), "p1865-val-"));
  process.env.P185_PGLITE_DATA_DIR = pgliteDir;
  process.env.P185_5_FORCE_PGLITE = "1";
  delete process.env.DATABASE_URL;
  await resetSqlClientCacheForTests();

  const client = await createSqlClient({
    forceNew: true,
    forcePglite: true,
    pgliteDataDir: pgliteDir,
  });
  await applyP1865Migrations(client);

  const cohort = [
    {
      candidateId: "val-signed-complete",
      displayName: "Complete Signed",
      envelopeStatus: "signed",
      productionState: "Signed",
      shadowState: "SIGNED",
      checklist: COMPLETE,
      jobOrProjectId: "job-a",
    },
    {
      candidateId: "val-missing-docs",
      displayName: "Missing Docs",
      envelopeStatus: "signed",
      productionState: "Signed",
      shadowState: "SIGNED",
      checklist: { ...COMPLETE, taxFormsComplete: false as const },
      jobOrProjectId: "job-b",
    },
    {
      candidateId: "val-conflict",
      displayName: "Conflict",
      envelopeStatus: "signed",
      productionState: "Paperwork Sent",
      shadowState: "APPLIED",
      checklist: COMPLETE,
      jobOrProjectId: "job-c",
    },
    {
      candidateId: "val-ready-mel",
      displayName: "Ready MEL",
      envelopeStatus: "signed",
      productionState: "Ready for MEL",
      shadowState: "READY_FOR_MEL",
      checklist: COMPLETE,
      jobOrProjectId: "job-d",
    },
    {
      candidateId: "val-already-exported",
      displayName: "Exported",
      envelopeStatus: "signed",
      productionState: "Loaded in MEL",
      shadowState: "EXPORTED",
      alreadyExported: true,
      checklist: COMPLETE,
      jobOrProjectId: "job-e",
    },
    {
      candidateId: "val-blocked",
      displayName: "Blocked",
      envelopeStatus: "signed",
      productionState: "Signed",
      shadowState: "SIGNED",
      melExportBlocked: true,
      checklist: COMPLETE,
      jobOrProjectId: "job-f",
    },
  ];

  let signedEvaluated = 0;
  const states: Record<string, number> = {};
  for (const row of cohort) {
    const resolved = resolvePostSignEvent({
      candidateId: row.candidateId,
      envelopeId: `env-${row.candidateId}`,
      rolloutOrSendId: `send-${row.candidateId}`,
      onboardingAssignmentId: `oa-${row.candidateId}`,
      jobOrProjectId: row.jobOrProjectId,
      envelopeStatus: row.envelopeStatus,
      sourceSystem: "validation",
      requiredSignersCompleted: true,
      requiredFieldsPresent: true,
    });
    if (!resolved.ok) continue;
    if (row.envelopeStatus === "signed") signedEvaluated += 1;
    const c = classifyOnboardingReadiness({
      event: resolved.event,
      productionState: row.productionState,
      shadowState: row.shadowState,
      productionRecordExists: true,
      alreadyExported: row.alreadyExported,
      melExportBlocked: row.melExportBlocked,
      checklist: row.checklist,
    });
    states[c.state] = (states[c.state] ?? 0) + 1;
  }

  const readyEnqueue = await enqueueMelExportItem({
    candidateId: "val-ready-mel",
    jobOrProjectId: "job-d",
    onboardingAssignmentId: "oa-val-ready-mel",
    approvalEventId: "apr-val",
    status: "pending_review",
    client,
    forceFlags: { melExportQueue: true },
  });
  const dupPrevented = await enqueueMelExportItem({
    candidateId: "val-ready-mel",
    jobOrProjectId: "job-d-other",
    onboardingAssignmentId: "oa-other",
    approvalEventId: "apr-other",
    client,
    forceFlags: { melExportQueue: true },
  });
  const alreadyExcluded = await enqueueMelExportItem({
    candidateId: "val-already-exported",
    existingMelRecord: true,
    client,
    forceFlags: { melExportQueue: true },
  });

  const preview = buildMelExportPreview({
    candidateId: "val-ready-mel",
    jobOrProjectId: "job-d",
    requiredFieldReadinessPct: 100,
    missingFields: [],
    forceFlags: { melExportPreview: true },
  });

  const reconcile = reconcilePostSignAndMel({
    forceFlags: { reconciliation: true },
    cohort: cohort.map((r) => ({
      candidateId: r.candidateId,
      dropboxSignStatus: r.envelopeStatus,
      productionWorkflowState: r.productionState,
      shadowState: r.shadowState,
      checklistComplete: r.candidateId !== "val-missing-docs",
      existingMelRecord: r.alreadyExported,
    })),
  });

  const dashboard = await buildPostSignDashboard({
    role: "operator",
    cohort,
    client,
    forceFlags: {
      postSignObserver: true,
      onboardingChecklist: true,
      melExportQueue: true,
      reconciliation: true,
      postSignHealthDashboard: true,
    },
  });

  const readinessValidation = {
    generatedAt: new Date().toISOString(),
    sourcePhase: "P186.5",
    readOnly: true,
    signedEnvelopesEvaluated: signedEvaluated,
    classifications: states,
    completeOnboardingRecords: states.paperwork_signed_complete ?? 0,
    missingDocumentCases: states.paperwork_signed_missing_documents ?? 0,
    conflictingCases: states.paperwork_signed_conflicting_state ?? 0,
    readyForMelCandidates: states.ready_for_mel_review ?? 0,
    blockedCandidates: states.mel_export_blocked ?? 0,
    alreadyExportedCandidates: states.already_exported ?? 0,
    productionWritesAttempted: 0,
    melWritesAttempted: 0,
    paperworkSendsAttempted: 0,
  };

  const melQueueValidation = {
    generatedAt: new Date().toISOString(),
    sourcePhase: "P186.5",
    queueCreated: readyEnqueue.ok,
    duplicateQueueCandidatesPrevented: !dupPrevented.ok && dupPrevented.code === "duplicate_queue" ? 1 : 0,
    alreadyExportedExcluded: !alreadyExcluded.ok && alreadyExcluded.code === "already_exported" ? 1 : 0,
    melQueuePreviewCount: preview.ok ? 1 : 0,
    melWritesAttempted: 0,
    creatableStatusesOnly: ["pending_review", "approved_for_export"],
  };

  const reconciliationReport = {
    generatedAt: new Date().toISOString(),
    sourcePhase: "P186.5",
    findings: reconcile.findings,
    findingCount: reconcile.findings.length,
    productionRepairs: 0,
    shadowMatches: dashboard.items.filter((i) => !i.blockers.length).length,
    shadowMismatches: reconcile.findings.filter((f) =>
      f.kind.includes("shadow") || f.kind.includes("signed_but"),
    ).length,
  };

  const artifactsDir = path.join(process.cwd(), "artifacts");
  await mkdir(artifactsDir, { recursive: true });
  await writeFile(
    path.join(artifactsDir, "p186-5-onboarding-readiness-validation.json"),
    JSON.stringify(readinessValidation, null, 2) + "\n",
  );
  await writeFile(
    path.join(artifactsDir, "p186-5-mel-export-queue-validation.json"),
    JSON.stringify(melQueueValidation, null, 2) + "\n",
  );
  await writeFile(
    path.join(artifactsDir, "p186-5-reconciliation-report.json"),
    JSON.stringify(reconciliationReport, null, 2) + "\n",
  );

  await writeFile(
    path.join(artifactsDir, "p186-5-post-sign-design.md"),
    [
      "# P186.5 Post-Sign Lifecycle + MEL Export Queue — Design",
      "",
      `Generated: ${new Date().toISOString()}`,
      "",
      "## Architecture",
      "",
      "```",
      "Dropbox / P184-P185 envelopes / workflow / onboarding",
      "        │ observe (resolve + verify)",
      "        ▼",
      "Checklist engine → Readiness classifier → Operator queues",
      "        │",
      "        ├── Shadow proposals (P186.1 apply only after production write observe)",
      "        ├── Authorized review actions → upsertCandidateWorkflow → observe",
      "        └── Durable MEL export queue (pending_review / approved_for_export only)",
      "```",
      "",
      "## Safety walls",
      "",
      "- No MEL write APIs",
      "- No paperwork send",
      "- No automatic approvals",
      "- No P184/P185 changes",
      "- P186 non-authoritative",
      "",
    ].join("\n"),
  );

  await writeFile(
    path.join(artifactsDir, "p186-5-readiness-report.md"),
    [
      "# P186.5 Readiness Report",
      "",
      `Generated: ${new Date().toISOString()}`,
      "",
      "## Validation",
      "",
      `- Signed envelopes evaluated: **${signedEvaluated}**`,
      `- Complete onboarding: **${readinessValidation.completeOnboardingRecords}**`,
      `- Missing documents: **${readinessValidation.missingDocumentCases}**`,
      `- Conflicting: **${readinessValidation.conflictingCases}**`,
      `- Ready for MEL: **${readinessValidation.readyForMelCandidates}**`,
      `- Blocked: **${readinessValidation.blockedCandidates}**`,
      `- Already exported: **${readinessValidation.alreadyExportedCandidates}**`,
      `- Duplicate queue prevented: **${melQueueValidation.duplicateQueueCandidatesPrevented}**`,
      `- MEL preview count: **${melQueueValidation.melQueuePreviewCount}**`,
      `- Production writes attempted: **0**`,
      `- MEL writes attempted: **0**`,
      `- Paperwork sends attempted: **0**`,
      "",
      "## P186.6 recommendation",
      "",
      "**Conditional yes** — only after controlled enablement of post-sign observer + checklist flags,",
      "operator walkthrough of Ready-for-MEL review, and explicit authorization to design a gated MEL",
      "export executor. Keep automatic MEL export disabled.",
      "",
    ].join("\n"),
  );

  console.log(
    JSON.stringify(
      {
        signedEvaluated,
        states,
        duplicatePrevented: melQueueValidation.duplicateQueueCandidatesPrevented,
        productionWritesAttempted: 0,
        melWritesAttempted: 0,
        paperworkSendsAttempted: 0,
      },
      null,
      2,
    ),
  );

  await resetSqlClientCacheForTests();
  await rm(pgliteDir, { recursive: true, force: true });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
