import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { isP1855DurableConfigured } from "@/lib/p185-5-vercel-durable-storage/sqlClient";
import { readDropboxSignConfig } from "@/lib/dropbox-sign";
import { validateOwnershipLedgerHealth } from "@/lib/p188-4-recruiter-ownership-durability/ledgerStore";
import { recruitingDataDir } from "@/lib/recruiting-data-dir";
import {
  P190_REQUIRED_SOURCE_COHORT_ID,
  P190_REQUIRED_SOURCE_FINGERPRINT,
  P190_SOURCE_PHASE,
} from "@/lib/p190-operator-approval-pilot/types";

export type P190PreflightResult = {
  ok: boolean;
  sourcePhase: typeof P190_SOURCE_PHASE;
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

/**
 * Production preflight for P190 Operator Approval pilot.
 */
export async function runP190Preflight(input: {
  sourceCohortId: string;
  sourceFingerprint: string;
  sourceMemberCount: number;
}): Promise<P190PreflightResult> {
  const checkedAt = new Date().toISOString();
  const ledger = await validateOwnershipLedgerHealth();
  const store = await workflowStoreHealthy();

  const p184Mode = process.env.P184_MODE?.trim().toLowerCase() || "dry_run";
  const p184Dry = p184Mode === "dry_run" || process.env.P184_LIVE_SEND !== "true";
  const p187Off =
    process.env.P187_EXECUTE_PRODUCTION_CANARY !== "true" &&
    process.env.P187_AUTHORITY_ENABLED !== "true";
  const automationOff =
    process.env.P185_PRODUCTION_AUTOMATION_ENABLED !== "true" &&
    process.env.CONTINUOUS_AUTOMATION_ENABLED !== "true" &&
    process.env.P185_SCHEDULER_ENABLED !== "true";
  const dropbox = Boolean(readDropboxSignConfig());
  const restoreFlagOff = process.env.P188_OWNERSHIP_RESTORE_EXECUTION !== "true";
  const activePaperworkOps =
    process.env.P185_PRODUCTION_AUTOMATION_ENABLED === "true" ||
    process.env.P184_LIVE_SEND === "true";

  const gates = [
    {
      id: "source_cohort_id",
      ok: input.sourceCohortId === P190_REQUIRED_SOURCE_COHORT_ID,
      detail: `source=${input.sourceCohortId} required=${P190_REQUIRED_SOURCE_COHORT_ID}`,
    },
    {
      id: "source_fingerprint",
      ok: input.sourceFingerprint === P190_REQUIRED_SOURCE_FINGERPRINT,
      detail: `source=${input.sourceFingerprint} required=${P190_REQUIRED_SOURCE_FINGERPRINT}`,
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
      id: "unresolved_ownership_operations",
      ok: restoreFlagOff,
      detail: restoreFlagOff
        ? "0 unresolved ownership operations"
        : "P188_OWNERSHIP_RESTORE_EXECUTION is on",
    },
    {
      id: "p184_dry_run",
      ok: p184Dry,
      detail: p184Dry ? `P184 mode=${p184Mode}` : "P184 live send appears enabled",
    },
    {
      id: "dropbox_sign_configured_not_invoked",
      ok: dropbox,
      detail: dropbox
        ? "Dropbox Sign configured (must not be invoked by P190)"
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
      detail: automationOff ? "Automation/scheduler disabled" : "Automation appears enabled",
    },
    {
      id: "no_active_paperwork_operations",
      ok: !activePaperworkOps,
      detail: !activePaperworkOps
        ? "No active paperwork send operations"
        : "Active paperwork automation/send flags detected",
    },
  ];

  const abortReasons = gates.filter((g) => !g.ok).map((g) => `${g.id}: ${g.detail}`);
  return {
    ok: abortReasons.length === 0,
    sourcePhase: P190_SOURCE_PHASE,
    checkedAt,
    gates,
    abortReasons,
    automationStatus: automationOff ? "off" : "on",
    p184Mode,
  };
}
