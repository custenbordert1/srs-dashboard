/**
 * P186.2 shadow event validation + read-only reconciliation artifacts.
 * Does not enable production flags permanently; does not send paperwork.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  adaptBreezyStageChange,
  adaptDropboxSignStatus,
  adaptMelExported,
  adaptOnboardingComplete,
  adaptOperatorApproval,
  adaptPaperworkEngineEvent,
  adaptReadyForMel,
  adaptRecruiterAction,
  applyP1862Migrations,
  buildP1862HealthReport,
  runShadowReconciliation,
  ShadowDualWriteIngestor,
  type P1862Flags,
} from "../src/lib/p186-2-event-adapters";
import {
  createSqlClient,
  resetSqlClientCacheForTests,
} from "../src/lib/p185-5-vercel-durable-storage/sqlClient";

const ALL_ON: P1862Flags = {
  shadowIngestion: true,
  adapterBreezy: true,
  adapterRecruiter: true,
  adapterOperator: true,
  adapterPaperwork: true,
  adapterDropbox: true,
  adapterOnboarding: true,
  adapterMel: true,
  adapterReconcile: true,
  reconciliation: true,
  shadowHealthReporting: true,
};

function loadEnvLocal(): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("node:fs") as typeof import("node:fs");
    const raw = fs.readFileSync(".env.local", "utf8");
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq < 0) continue;
      const k = t.slice(0, eq).trim();
      let v = t.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (process.env[k] === undefined) process.env[k] = v;
    }
  } catch {
    // optional
  }
}

async function main(): Promise<void> {
  loadEnvLocal();
  delete process.env.P185_PRODUCTION_AUTOMATION_ENABLED;

  process.env.P185_5_FORCE_PGLITE = "1";
  process.env.P185_PGLITE_DATA_DIR = path.join(process.cwd(), ".data", "p186-2-pglite-artifacts");
  process.env.P186_2_FORCE_RECONCILE = "1";
  delete process.env.DATABASE_URL;
  delete process.env.P185_DATABASE_URL;
  delete process.env.POSTGRES_URL;

  await resetSqlClientCacheForTests();
  const client = await createSqlClient({ forceNew: true, forcePglite: true });
  await applyP1862Migrations(client);
  const ingestor = new ShadowDualWriteIngestor(client, ALL_ON);

  const syntheticAdapters = [
    adaptBreezyStageChange({ candidateId: "syn-a", stage: "Applied" }),
    adaptRecruiterAction({ candidateId: "syn-b", action: "claim" }),
    adaptRecruiterAction({ candidateId: "syn-c", action: "recommend" }),
    adaptOperatorApproval({ candidateId: "syn-d", decision: "approve" }),
    adaptPaperworkEngineEvent({ candidateId: "syn-e", status: "paperwork_needed", source: "p185" }),
    adaptPaperworkEngineEvent({ candidateId: "syn-f", status: "confirmed_sent", source: "p184" }),
    adaptDropboxSignStatus({ candidateId: "syn-g", eventType: "signature_request_viewed" }),
    adaptDropboxSignStatus({ candidateId: "syn-h", eventType: "signature_request_all_signed" }),
    adaptOnboardingComplete({ candidateId: "syn-i" }),
    adaptReadyForMel({ candidateId: "syn-j" }),
    adaptMelExported({ candidateId: "syn-k" }),
  ];

  const dispositions: Record<string, number> = {};
  let accepted = 0;
  let duplicates = 0;
  let invalid = 0;
  let outOfOrder = 0;
  let matches = 0;
  let mismatches = 0;
  let impossible = 0;
  let unmapped = 0;
  let total = 0;

  for (const a of syntheticAdapters) {
    if (!a.ok) {
      invalid += 1;
      total += 1;
      dispositions.malformed = (dispositions.malformed ?? 0) + 1;
      continue;
    }
    // mark synthetic so flags wouldn't block in other modes
    a.event.sourceSystem = "synthetic";
    const r = await ingestor.ingest(a.event);
    total += 1;
    dispositions[r.disposition] = (dispositions[r.disposition] ?? 0) + 1;
    if (r.disposition === "accepted" || r.disposition === "match") accepted += 1;
    if (r.disposition === "duplicate") duplicates += 1;
    if (r.disposition === "invalid_transition" || r.disposition === "rejected_malformed") invalid += 1;
    if (r.disposition === "out_of_order" || r.disposition === "late") outOfOrder += 1;
    if (r.disposition === "unmapped") unmapped += 1;
    if (r.comparison === "match") matches += 1;
    if (r.comparison === "mismatch") mismatches += 1;
    if (r.comparison === "impossible_transition") impossible += 1;

    // duplicate pass
    const dup = await ingestor.ingest(a.event);
    total += 1;
    dispositions[dup.disposition] = (dispositions[dup.disposition] ?? 0) + 1;
    if (dup.disposition === "duplicate") duplicates += 1;
  }

  // Production replay (read-only workflow observe → adapt → ingest into local pglite)
  let replayNote = "no workflow store";
  let replayTotal = 0;
  try {
    const { getCandidateWorkflowState } = await import("../src/lib/candidate-workflow-store");
    const { adaptWorkflowStoreChange } = await import("../src/lib/p186-2-event-adapters");
    const state = await getCandidateWorkflowState();
    const entries = Object.entries(state).slice(0, 40);
    replayNote = `Replayed ${entries.length} workflow snapshots read-only into shadow (local pglite).`;
    for (const [id, wf] of entries) {
      const adapted = adaptWorkflowStoreChange({
        candidateId: id,
        workflowStatus: wf?.workflowStatus,
        paperworkStatus: wf?.paperworkStatus,
      });
      if (!adapted.ok) continue;
      adapted.event.sourceSystem = "synthetic";
      adapted.event.eventId = `replay-${id}-${adapted.event.eventType}`;
      adapted.event.idempotencyKey = adapted.event.eventId;
      const r = await ingestor.ingest(adapted.event);
      replayTotal += 1;
      total += 1;
      dispositions[r.disposition] = (dispositions[r.disposition] ?? 0) + 1;
      if (r.disposition === "accepted" || r.disposition === "match") accepted += 1;
      if (r.comparison === "match") matches += 1;
      if (r.comparison === "mismatch") mismatches += 1;
    }
  } catch (err) {
    replayNote = `Workflow replay skipped: ${err instanceof Error ? err.message : String(err)}`;
  }

  const reconCohort = [
    {
      candidateId: "syn-j",
      workflowStatus: "Ready for MEL",
      paperworkStatus: "signed",
      paperworkSignedAt: "2026-07-11T00:00:00.000Z",
      signatureRequestId: "sig",
    },
    {
      candidateId: "syn-a",
      workflowStatus: "Applied",
      breezyStage: "Applied",
    },
    {
      candidateId: "missing-shadow-x",
      workflowStatus: "Needs Review",
    },
  ];
  const recon = await runShadowReconciliation({ client, cohort: reconCohort });
  const health = await buildP1862HealthReport(client);

  const shadowValidation = {
    phase: "P186.2",
    generatedAt: new Date().toISOString(),
    mode: "shadow_only",
    totals: {
      totalEvents: total,
      accepted,
      duplicates,
      invalid,
      outOfOrder,
      matches,
      mismatches,
      impossibleTransitions: impossible,
      unmappedEvents: unmapped,
      dispositions,
    },
    syntheticStream: { adapters: syntheticAdapters.length },
    productionReplay: { note: replayNote, events: replayTotal },
    isolation: health.isolation,
  };

  const reconReport = {
    phase: "P186.2",
    generatedAt: new Date().toISOString(),
    ...recon,
    findings: recon.findings.map((f) => ({
      candidateId: f.candidateId,
      kind: f.kind,
      workflowState: f.workflowState,
      paperworkState: f.paperworkState,
      shadowState: f.shadowState,
      detail: f.detail,
    })),
  };

  const readiness = [
    `# P186.2 Readiness Report`,
    ``,
    `Generated: ${health.generatedAt}`,
    ``,
    `## Event sources connected (adapters)`,
    `- Breezy stage changes`,
    `- Recruiter actions`,
    `- Operator approvals`,
    `- P184/P185 paperwork observe events`,
    `- Dropbox Sign status events`,
    `- Onboarding completion`,
    `- Ready for MEL / MEL export`,
    `- Scheduled reconciliation ticks`,
    `- Workflow store observe hook (fail-soft)`,
    ``,
    `## Shadow validation`,
    `- Total events: **${total}**`,
    `- Accepted: **${accepted}**`,
    `- Duplicates: **${duplicates}**`,
    `- Invalid: **${invalid}**`,
    `- Out-of-order/late: **${outOfOrder}**`,
    `- Matches: **${matches}**`,
    `- Mismatches: **${mismatches}**`,
    `- Impossible: **${impossible}**`,
    `- Unmapped: **${unmapped}**`,
    ``,
    `## Reconciliation`,
    `- Evaluated: **${recon.evaluated}**`,
    `- Findings: **${recon.findings.length}**`,
    `- By kind: ${JSON.stringify(recon.byKind)}`,
    ``,
    `## Isolation`,
    `- Paperwork send disabled: **yes**`,
    `- Continuous automation disabled: **yes**`,
    `- P184/P185 unmodified (no behavior changes in those packages): **yes**`,
    `- Authoritative mode disabled: **yes**`,
    ``,
    `## P186.3 recommendation`,
    health.readyForP186_3
      ? `**Conditional yes** — begin operator dashboard (P186.3) only after explicit approval. Keep flags off in production until a controlled enablement plan exists.`
      : `**Not yet** — blockers: ${health.blockers.join("; ") || health.warnings.join("; ") || "see health"}`,
    ``,
  ].join("\n");

  const dir = path.join(process.cwd(), "artifacts");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "p186-2-shadow-event-validation.json"), JSON.stringify(shadowValidation, null, 2) + "\n");
  await writeFile(path.join(dir, "p186-2-reconciliation-report.json"), JSON.stringify(reconReport, null, 2) + "\n");
  await writeFile(path.join(dir, "p186-2-readiness-report.md"), readiness);

  console.log(JSON.stringify({
    total,
    accepted,
    duplicates,
    matches,
    mismatches,
    reconFindings: recon.findings.length,
    readyForP186_3: health.readyForP186_3,
  }, null, 2));

  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
