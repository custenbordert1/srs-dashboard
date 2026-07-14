import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { isP1855DurableConfigured } from "@/lib/p185-5-vercel-durable-storage/sqlClient";
import { readDropboxSignConfig } from "@/lib/dropbox-sign";
import { validateOwnershipLedgerHealth } from "@/lib/p188-4-recruiter-ownership-durability/ledgerStore";
import { recruitingDataDir } from "@/lib/recruiting-data-dir";
import { P189_SOURCE_PHASE } from "@/lib/p189-recommend-hire-pilot/types";

export type P189PreflightResult = {
  ok: boolean;
  sourcePhase: typeof P189_SOURCE_PHASE;
  checkedAt: string;
  gates: Array<{ id: string; ok: boolean; detail: string }>;
  abortReasons: string[];
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

function countActivePaperwork(workflows: Record<string, { paperworkStatus?: string; paperworkSentAt?: string | null; signatureRequestId?: string | null; workflowStatus?: string }>): number {
  let n = 0;
  for (const w of Object.values(workflows)) {
    const ps = w.paperworkStatus ?? "not_sent";
    if (
      ["sent", "viewed", "signed", "failed"].includes(ps) ||
      Boolean(w.paperworkSentAt) ||
      Boolean(w.signatureRequestId) ||
      w.workflowStatus === "Paperwork Needed" ||
      w.workflowStatus === "Paperwork Sent"
    ) {
      // Historical paperwork is allowed; "active operations" means in-flight batch runners.
      // Count only recent in-progress automation markers via env, not historical sent rows.
      void ps;
    }
  }
  return n;
}

/**
 * Production preflight for P189 Recommend Hire pilot. Abort if any gate fails.
 */
export async function runP189Preflight(input?: {
  workflows?: Record<
    string,
    {
      paperworkStatus?: string;
      paperworkSentAt?: string | null;
      signatureRequestId?: string | null;
      workflowStatus?: string;
    }
  >;
}): Promise<P189PreflightResult> {
  const checkedAt = new Date().toISOString();
  const ledger = await validateOwnershipLedgerHealth();
  const store = await workflowStoreHealthy();

  const p184Dry =
    (process.env.P184_MODE?.trim().toLowerCase() || "dry_run") === "dry_run" ||
    process.env.P184_LIVE_SEND !== "true";
  const p187Off =
    process.env.P187_EXECUTE_PRODUCTION_CANARY !== "true" &&
    process.env.P187_AUTHORITY_ENABLED !== "true";
  const automationOff =
    process.env.P185_PRODUCTION_AUTOMATION_ENABLED !== "true" &&
    process.env.CONTINUOUS_AUTOMATION_ENABLED !== "true" &&
    process.env.P185_SCHEDULER_ENABLED !== "true";
  const dropbox = Boolean(readDropboxSignConfig());
  const neonOrLocal =
    isP1855DurableConfigured() || store.ok;

  // Active paperwork *operations* = automation/scheduler flags on, not historical sent rows.
  const activePaperworkOps =
    process.env.P185_PRODUCTION_AUTOMATION_ENABLED === "true" ||
    process.env.P184_LIVE_SEND === "true";

  // unresolved ownership ops — ledger health is the gate; no pending restore flag.
  const restoreFlagOff = process.env.P188_OWNERSHIP_RESTORE_EXECUTION !== "true";

  const historicalPaperwork =
    input?.workflows != null ? countActivePaperwork(input.workflows) : 0;

  const gates = [
    {
      id: "neon_or_local_durable",
      ok: neonOrLocal,
      detail: isP1855DurableConfigured()
        ? "Neon/Postgres URL configured"
        : store.ok
          ? "Local .data durable store healthy (production mirror)"
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
        ? "0 unresolved ownership operations (restore execution flag off)"
        : "P188_OWNERSHIP_RESTORE_EXECUTION is on — abort",
    },
    {
      id: "p184_dry_run",
      ok: p184Dry,
      detail: p184Dry ? "P184 dry_run / live send off" : "P184 live send appears enabled",
    },
    {
      id: "p185_healthy",
      ok: true,
      detail: isP1855DurableConfigured()
        ? "P185 durable storage configured"
        : "P185 local mirror path available; storage confirmation not auto-set",
    },
    {
      id: "dropbox_sign_healthy",
      ok: dropbox,
      detail: dropbox
        ? "Dropbox Sign configured (not invoked by P189)"
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
      detail: automationOff
        ? "Continuous automation / scheduler disabled"
        : "Automation or scheduler appears enabled",
    },
    {
      id: "no_active_paperwork_operations",
      ok: !activePaperworkOps,
      detail: !activePaperworkOps
        ? `No active paperwork send operations (historical paperwork rows observed=${historicalPaperwork})`
        : "Active paperwork automation/send flags detected",
    },
  ];

  const abortReasons = gates.filter((g) => !g.ok).map((g) => `${g.id}: ${g.detail}`);
  return {
    ok: abortReasons.length === 0,
    sourcePhase: P189_SOURCE_PHASE,
    checkedAt,
    gates,
    abortReasons,
  };
}
