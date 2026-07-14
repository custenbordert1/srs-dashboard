import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { isP1855DurableConfigured } from "@/lib/p185-5-vercel-durable-storage/sqlClient";
import { readDropboxSignConfig } from "@/lib/dropbox-sign";
import { loadP184EngineState } from "@/lib/p184-autonomous-paperwork-send-engine/store";
import { validateOwnershipLedgerHealth } from "@/lib/p188-4-recruiter-ownership-durability/ledgerStore";
import { recruitingDataDir } from "@/lib/recruiting-data-dir";
import {
  P191_REQUIRED_SOURCE_COHORT_ID,
  P191_REQUIRED_SOURCE_FINGERPRINT,
  P191_SOURCE_PHASE,
} from "@/lib/p191-paperwork-release-pilot/types";

export type P191PreflightResult = {
  ok: boolean;
  sourcePhase: typeof P191_SOURCE_PHASE;
  checkedAt: string;
  gates: Array<{ id: string; ok: boolean; detail: string }>;
  abortReasons: string[];
  automationStatus: "off" | "on";
  p184Mode: string;
};

async function workflowStoreHealthy(): Promise<{ ok: boolean; detail: string }> {
  const p = path.join(recruitingDataDir(), "candidate-workflows.json");
  try {
    await access(p);
    const raw = await readFile(p, "utf8");
    const parsed = JSON.parse(raw) as { workflows?: Record<string, unknown> };
    const n = Object.keys(parsed.workflows ?? {}).length;
    return { ok: n > 0, detail: `candidate-workflows.json present with ${n} records` };
  } catch (err) {
    return {
      ok: false,
      detail: `candidate-workflow-store unhealthy: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export async function runP191Preflight(input: {
  sourceCohortId: string;
  sourceFingerprint: string;
  sourceMemberCount: number;
}): Promise<P191PreflightResult> {
  const checkedAt = new Date().toISOString();
  const ledger = await validateOwnershipLedgerHealth();
  const store = await workflowStoreHealthy();
  const p184 = await loadP184EngineState();
  const dropbox = Boolean(readDropboxSignConfig());

  const automationOff =
    process.env.P185_PRODUCTION_AUTOMATION_ENABLED !== "true" &&
    process.env.CONTINUOUS_AUTOMATION_ENABLED !== "true" &&
    process.env.P185_SCHEDULER_ENABLED !== "true";
  const p187Off =
    process.env.P187_EXECUTE_PRODUCTION_CANARY !== "true" &&
    process.env.P187_AUTHORITY_ENABLED !== "true";
  const p184Dry =
    p184.config.mode === "dry_run" && process.env.P184_LIVE_SEND !== "true";

  const gates = [
    {
      id: "source_cohort_id",
      ok: input.sourceCohortId === P191_REQUIRED_SOURCE_COHORT_ID,
      detail: `source=${input.sourceCohortId} required=${P191_REQUIRED_SOURCE_COHORT_ID}`,
    },
    {
      id: "source_fingerprint",
      ok: input.sourceFingerprint === P191_REQUIRED_SOURCE_FINGERPRINT,
      detail: `source=${input.sourceFingerprint} required=${P191_REQUIRED_SOURCE_FINGERPRINT}`,
    },
    {
      id: "source_member_count",
      ok: input.sourceMemberCount === 25,
      detail: `members=${input.sourceMemberCount}`,
    },
    {
      id: "neon_or_local_durable",
      ok: isP1855DurableConfigured() || store.ok,
      detail: isP1855DurableConfigured()
        ? "Neon/Postgres URL configured"
        : store.ok
          ? "Local .data durable store healthy"
          : "No durable store",
    },
    {
      id: "candidate_workflow_store_healthy",
      ok: store.ok,
      detail: store.detail,
    },
    {
      id: "ownership_ledger_healthy",
      ok: ledger.ok,
      detail: ledger.detail,
    },
    {
      id: "p184_starts_dry_run",
      ok: p184Dry,
      detail: `P184 config.mode=${p184.config.mode} enabled=${p184.config.enabled}`,
    },
    {
      id: "dropbox_sign_configured",
      ok: dropbox,
      detail: dropbox
        ? "Dropbox Sign configured for live sends"
        : "Dropbox Sign not configured",
    },
    {
      id: "p187_flags_off",
      ok: p187Off,
      detail: p187Off ? "P187 authority/execution off" : "P187 flags enabled",
    },
    {
      id: "automation_off",
      ok: automationOff,
      detail: automationOff ? "Continuous automation/scheduler disabled" : "Automation appears enabled",
    },
  ];

  const abortReasons = gates.filter((g) => !g.ok).map((g) => `${g.id}: ${g.detail}`);
  return {
    ok: abortReasons.length === 0,
    sourcePhase: P191_SOURCE_PHASE,
    checkedAt,
    gates,
    abortReasons,
    automationStatus: automationOff ? "off" : "on",
    p184Mode: p184.config.mode,
  };
}
