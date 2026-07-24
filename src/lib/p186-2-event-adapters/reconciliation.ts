import { LifecycleRecordStore } from "@/lib/p186-1-lifecycle-state-machine";
import { deriveExpectedLifecycleState } from "@/lib/p186-1-lifecycle-state-machine/states";
import { readP1862Flags } from "@/lib/p186-2-event-adapters/flags";
import { applyP1862Migrations } from "@/lib/p186-2-event-adapters/migrate";
import type { P186ReconciliationFinding } from "@/lib/p186-2-event-adapters/types";
import { createSqlClient } from "@/lib/p185-5-vercel-durable-storage/sqlClient";
import type { SqlClient } from "@/lib/p185-5-vercel-durable-storage/types";

export type ReconciliationCohortRow = {
  candidateId: string;
  breezyStage?: string | null;
  workflowStatus?: string | null;
  paperworkStatus?: string | null;
  paperworkSentAt?: string | null;
  paperworkViewedAt?: string | null;
  paperworkSignedAt?: string | null;
  signatureRequestId?: string | null;
  recommendedStage?: string | null;
  directDepositStatus?: string | null;
  dropboxLifecycle?: string | null;
  p184QueueStatus?: string | null;
  p185EnvelopeState?: string | null;
};

/**
 * Read-only reconciliation — never repairs production data.
 */
export async function runShadowReconciliation(input: {
  cohort: ReconciliationCohortRow[];
  client?: SqlClient;
}): Promise<{
  runAt: string;
  evaluated: number;
  findings: P186ReconciliationFinding[];
  byKind: Record<string, number>;
}> {
  const flags = readP1862Flags();
  if (!flags.reconciliation && process.env.NODE_ENV !== "test" && process.env.P186_2_FORCE_RECONCILE !== "1") {
    return {
      runAt: new Date().toISOString(),
      evaluated: 0,
      findings: [],
      byKind: { skipped_flag_off: 1 },
    };
  }

  const db = input.client;
  if (db) await applyP1862Migrations(db);
  else await applyP1862Migrations();
  const shadows = new LifecycleRecordStore(input.client);
  const runAt = new Date().toISOString();
  const findings: P186ReconciliationFinding[] = [];

  for (const row of input.cohort) {
    const shadow = await shadows.get(row.candidateId);
    const derived = deriveExpectedLifecycleState({
      workflowStatus: row.workflowStatus ?? null,
      paperworkStatus: row.paperworkStatus ?? null,
      paperworkSentAt: row.paperworkSentAt ?? null,
      paperworkViewedAt: row.paperworkViewedAt ?? null,
      paperworkSignedAt: row.paperworkSignedAt ?? null,
      signatureRequestId: row.signatureRequestId ?? null,
      recommendedStage: row.recommendedStage ?? null,
      directDepositStatus: row.directDepositStatus ?? null,
    });

    const paperworkState =
      row.p185EnvelopeState ??
      row.p184QueueStatus ??
      row.paperworkStatus ??
      null;
    const melReadyState =
      row.workflowStatus === "Ready for MEL" || row.workflowStatus === "Loaded in MEL"
        ? row.workflowStatus
        : null;
    const onboardingState =
      row.workflowStatus === "Awaiting DD Verification" ||
      row.directDepositStatus === "verified"
        ? "onboarding_complete_signal"
        : null;

    let kind: P186ReconciliationFinding["kind"] = "aligned";
    let detail = "Shadow aligns with production-derived state.";

    if (!shadow) {
      kind = "missing_shadow";
      detail = `No shadow record; production-derived=${derived}`;
    } else if (shadow.state === derived) {
      kind = "aligned";
    } else if (
      row.dropboxLifecycle &&
      row.paperworkStatus &&
      row.dropboxLifecycle !== row.paperworkStatus
    ) {
      kind = "source_conflict";
      detail = `Dropbox=${row.dropboxLifecycle} vs paperworkStatus=${row.paperworkStatus}; shadow=${shadow.state}`;
    } else if (shadow.state !== derived) {
      // rough ahead/behind using string inequality only for report
      kind = "shadow_behind";
      detail = `shadow=${shadow.state} derived=${derived}`;
      if (
        ["EXPORTED", "READY_FOR_MEL", "SIGNED"].includes(shadow.state) &&
        ["APPLIED", "RECRUITER_REVIEW"].includes(derived)
      ) {
        kind = "shadow_ahead";
      }
    }

    if (!row.workflowStatus && !row.paperworkStatus && !row.breezyStage) {
      kind = "unmapped_production";
      detail = "No production signals available for candidate.";
    }

    findings.push({
      candidateId: row.candidateId,
      kind,
      breezyStage: row.breezyStage ?? null,
      workflowState: row.workflowStatus ?? null,
      paperworkState,
      dropboxState: row.dropboxLifecycle ?? null,
      onboardingState,
      melReadyState,
      shadowState: shadow?.state ?? null,
      detail,
    });
  }

  const byKind: Record<string, number> = {};
  for (const f of findings) {
    byKind[f.kind] = (byKind[f.kind] ?? 0) + 1;
  }

  const client = input.client ?? (await createSqlClient());
  await applyP1862Migrations(client);
  const runInsert = await client.query(
    `INSERT INTO p186_reconciliation_runs (run_at, evaluated, findings, payload)
     VALUES ($1::timestamptz,$2,$3,$4::jsonb) RETURNING id`,
    [runAt, input.cohort.length, findings.length, JSON.stringify({ byKind })],
  );
  const rawRunId = runInsert.rows[0]?.id;
  const runId =
    typeof rawRunId === "number" || typeof rawRunId === "string" ? rawRunId : null;
  for (const f of findings) {
    await client.query(
      `INSERT INTO p186_reconciliation_findings (
         run_id, candidate_id, kind, breezy_stage, workflow_state, paperwork_state,
         dropbox_state, onboarding_state, mel_ready_state, shadow_state, detail, at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::timestamptz)`,
      [
        runId,
        f.candidateId,
        f.kind,
        f.breezyStage,
        f.workflowState,
        f.paperworkState,
        f.dropboxState,
        f.onboardingState,
        f.melReadyState,
        f.shadowState,
        f.detail,
        runAt,
      ],
    );
  }

  return { runAt, evaluated: input.cohort.length, findings, byKind };
}
