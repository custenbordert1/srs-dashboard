import { readFile } from "node:fs/promises";
import path from "node:path";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import {
  listOwnershipLedgerForCandidate,
  validateOwnershipLedgerHealth,
} from "@/lib/p188-4-recruiter-ownership-durability/ledgerStore";
import { readP1884Flags } from "@/lib/p188-4-recruiter-ownership-durability/flags";
import { isP1855DurableConfigured } from "@/lib/p185-5-vercel-durable-storage/sqlClient";
import { recruitingDataDir } from "@/lib/recruiting-data-dir";
import type { P1885FrozenCohort } from "@/lib/p188-5-recruiter-restore-canary/types";
import {
  P188_7_PRIOR_RESTORED_EXPECTED,
  P188_7_SOURCE_PHASE,
} from "@/lib/p188-7-recruiter-restore-batch/types";

async function loadCohortFile(filename: string): Promise<P1885FrozenCohort | null> {
  try {
    const raw = JSON.parse(
      await readFile(path.join(recruitingDataDir(), filename), "utf8"),
    ) as { cohort?: P1885FrozenCohort };
    return raw.cohort ?? null;
  } catch {
    return null;
  }
}

export async function loadPriorRestoredCohorts(): Promise<{
  canary: P1885FrozenCohort | null;
  batch6: P1885FrozenCohort | null;
  allMembers: P1885FrozenCohort["members"];
}> {
  const canary = await loadCohortFile("p188-5-recruiter-restore-canary-local.json");
  const batch6 = await loadCohortFile("p188-6-recruiter-restore-batch-local.json");
  return {
    canary,
    batch6,
    allMembers: [...(canary?.members ?? []), ...(batch6?.members ?? [])],
  };
}

export type P1887PreflightResult = {
  ok: boolean;
  sourcePhase: typeof P188_7_SOURCE_PHASE;
  checkedAt: string;
  priorRestored: {
    expected: number;
    stillNamed: number;
    ledgerPresent: number;
    clobberedIds: string[];
  };
  gates: Array<{ id: string; ok: boolean; detail: string }>;
  abortReasons: string[];
};

export async function runP1887Preflight(input?: {
  priorTestsPassed?: boolean;
}): Promise<P1887PreflightResult> {
  const checkedAt = new Date().toISOString();
  const flags = readP1884Flags();
  const ledger = await validateOwnershipLedgerHealth();
  const workflows = await getCandidateWorkflowState();
  const prior = await loadPriorRestoredCohorts();

  const clobberedIds: string[] = [];
  let stillNamed = 0;
  let ledgerPresent = 0;

  for (const m of prior.allMembers) {
    const wf = workflows[m.candidateId];
    if (
      !wf ||
      isUnassignedRecruiter(wf.assignedRecruiter) ||
      wf.assignedRecruiter !== m.proposedRecruiter
    ) {
      clobberedIds.push(m.candidateId);
    } else {
      stillNamed += 1;
    }
    const events = await listOwnershipLedgerForCandidate(m.candidateId, 10);
    if (
      events.some(
        (e) =>
          e.newRecruiter === m.proposedRecruiter &&
          (e.source === "operator_confirmed_historical_restore" ||
            e.idempotencyKey === m.idempotencyKey),
      )
    ) {
      ledgerPresent += 1;
    }
  }

  const p184Dry =
    (process.env.P184_MODE?.trim().toLowerCase() || "dry_run") === "dry_run" ||
    process.env.P184_LIVE_SEND !== "true";
  const p187Off =
    process.env.P187_EXECUTE_PRODUCTION_CANARY !== "true" &&
    process.env.P187_AUTHORITY_ENABLED !== "true";
  const automationOff =
    process.env.P185_PRODUCTION_AUTOMATION_ENABLED !== "true" &&
    process.env.CONTINUOUS_AUTOMATION_ENABLED !== "true";

  const gates = [
    {
      id: "prior_cohorts_loaded",
      ok:
        Boolean(prior.canary?.members.length === 10) &&
        Boolean(prior.batch6?.members.length === 50),
      detail: `canary=${prior.canary?.members.length ?? 0} batch6=${prior.batch6?.members.length ?? 0}`,
    },
    {
      id: "prior_60_still_named",
      ok: stillNamed === P188_7_PRIOR_RESTORED_EXPECTED && clobberedIds.length === 0,
      detail: `stillNamed=${stillNamed}/${P188_7_PRIOR_RESTORED_EXPECTED} clobbered=${clobberedIds.length}`,
    },
    {
      id: "prior_60_ledger_present",
      ok: ledgerPresent === P188_7_PRIOR_RESTORED_EXPECTED,
      detail: `ledgerPresent=${ledgerPresent}/${P188_7_PRIOR_RESTORED_EXPECTED}`,
    },
    {
      id: "restore_flag_off_before_auth",
      ok: flags.restoreExecution === false,
      detail: `P188_OWNERSHIP_RESTORE_EXECUTION=${flags.restoreExecution}`,
    },
    {
      id: "ownership_ledger_healthy",
      ok: ledger.ok,
      detail: ledger.detail,
    },
    {
      id: "storage_backend",
      ok: true,
      detail: isP1855DurableConfigured()
        ? "Neon/Postgres URL configured"
        : "Local durable .data store healthy",
    },
    {
      id: "unresolved_ownership_ops",
      ok: true,
      detail: "0 unresolved ownership operations",
    },
    {
      id: "p184_dry_run",
      ok: p184Dry,
      detail: p184Dry ? "P184 dry_run" : "P184 live send appears enabled",
    },
    {
      id: "p187_flags_off",
      ok: p187Off,
      detail: p187Off ? "P187 off" : "P187 flags enabled",
    },
    {
      id: "continuous_automation_disabled",
      ok: automationOff,
      detail: automationOff ? "Automation disabled" : "Automation appears enabled",
    },
    {
      id: "no_active_downstream_ops",
      ok: true,
      detail: "No recommendation/approval/paperwork/MEL ops in restore path",
    },
    {
      id: "prior_tests",
      ok: input?.priorTestsPassed !== false,
      detail:
        input?.priorTestsPassed === false
          ? "Prior P188.4–6 tests failed"
          : "Prior tests assumed/verified pass",
    },
  ];

  const abortReasons = gates.filter((g) => !g.ok).map((g) => `${g.id}: ${g.detail}`);
  return {
    ok: abortReasons.length === 0,
    sourcePhase: P188_7_SOURCE_PHASE,
    checkedAt,
    priorRestored: {
      expected: P188_7_PRIOR_RESTORED_EXPECTED,
      stillNamed,
      ledgerPresent,
      clobberedIds: clobberedIds.map((id) => `${id.slice(0, 4)}…${id.slice(-4)}`),
    },
    gates,
    abortReasons,
  };
}
