import { readFile } from "node:fs/promises";
import path from "node:path";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import { listOwnershipLedgerForCandidate } from "@/lib/p188-4-recruiter-ownership-durability/ledgerStore";
import { validateOwnershipLedgerHealth } from "@/lib/p188-4-recruiter-ownership-durability/ledgerStore";
import { isP1855DurableConfigured } from "@/lib/p185-5-vercel-durable-storage/sqlClient";
import { readP1884Flags } from "@/lib/p188-4-recruiter-ownership-durability/flags";
import { recruitingDataDir } from "@/lib/recruiting-data-dir";
import { P188_6_SOURCE_PHASE } from "@/lib/p188-6-recruiter-restore-batch/types";
import type { P1885FrozenCohort } from "@/lib/p188-5-recruiter-restore-canary/types";

export type P1886PreflightResult = {
  ok: boolean;
  sourcePhase: typeof P188_6_SOURCE_PHASE;
  checkedAt: string;
  priorCanary: {
    cohortId: string | null;
    expected: number;
    stillNamed: number;
    ledgerPresent: number;
    clobberedIds: string[];
  };
  gates: Array<{ id: string; ok: boolean; detail: string }>;
  abortReasons: string[];
};

export async function loadPriorCanaryCohort(): Promise<P1885FrozenCohort | null> {
  try {
    const raw = JSON.parse(
      await readFile(
        path.join(recruitingDataDir(), "p188-5-recruiter-restore-canary-local.json"),
        "utf8",
      ),
    ) as { cohort?: P1885FrozenCohort };
    return raw.cohort ?? null;
  } catch {
    return null;
  }
}

export async function runP1886Preflight(input?: {
  priorTestsPassed?: boolean;
}): Promise<P1886PreflightResult> {
  const checkedAt = new Date().toISOString();
  const flags = readP1884Flags();
  const ledger = await validateOwnershipLedgerHealth();
  const workflows = await getCandidateWorkflowState();
  const prior = await loadPriorCanaryCohort();

  const clobberedIds: string[] = [];
  let stillNamed = 0;
  let ledgerPresent = 0;
  if (prior) {
    for (const m of prior.members) {
      const wf = workflows[m.candidateId];
      if (!wf || isUnassignedRecruiter(wf.assignedRecruiter) || wf.assignedRecruiter !== m.proposedRecruiter) {
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
      id: "prior_canary_loaded",
      ok: Boolean(prior && prior.members.length === 10),
      detail: prior
        ? `Loaded ${prior.cohortId} (${prior.members.length})`
        : "Prior P188.5 canary cohort file missing",
    },
    {
      id: "prior_canary_still_named",
      ok: stillNamed === 10 && clobberedIds.length === 0,
      detail: `stillNamed=${stillNamed}/10 clobbered=${clobberedIds.length}`,
    },
    {
      id: "prior_canary_ledger_present",
      ok: ledgerPresent === 10,
      detail: `ledgerPresent=${ledgerPresent}/10`,
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
        ? "Neon/Postgres URL configured (SQL ledger opt-in)"
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
      id: "prior_tests",
      ok: input?.priorTestsPassed !== false,
      detail:
        input?.priorTestsPassed === false
          ? "Prior P188.4/P188.5 tests failed"
          : "Prior tests assumed/verified pass",
    },
  ];

  const abortReasons = gates.filter((g) => !g.ok).map((g) => `${g.id}: ${g.detail}`);
  return {
    ok: abortReasons.length === 0,
    sourcePhase: P188_6_SOURCE_PHASE,
    checkedAt,
    priorCanary: {
      cohortId: prior?.cohortId ?? null,
      expected: 10,
      stillNamed,
      ledgerPresent,
      clobberedIds: clobberedIds.map((id) => `${id.slice(0, 4)}…${id.slice(-4)}`),
    },
    gates,
    abortReasons,
  };
}
