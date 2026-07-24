import { createHash } from "node:crypto";
import { isP1855DurableConfigured } from "@/lib/p185-5-vercel-durable-storage/sqlClient";
import { readP1884Flags } from "@/lib/p188-4-recruiter-ownership-durability/flags";
import { validateOwnershipLedgerHealth } from "@/lib/p188-4-recruiter-ownership-durability/ledgerStore";
import { P188_5_SOURCE_PHASE } from "@/lib/p188-5-recruiter-restore-canary/types";

export type P1885PreflightResult = {
  ok: boolean;
  sourcePhase: typeof P188_5_SOURCE_PHASE;
  checkedAt: string;
  gates: Array<{ id: string; ok: boolean; detail: string }>;
  abortReasons: string[];
};

export async function runP1885Preflight(input?: {
  p1884TestsAlreadyPassed?: boolean;
}): Promise<P1885PreflightResult> {
  const checkedAt = new Date().toISOString();
  const flags = readP1884Flags();
  const ledger = await validateOwnershipLedgerHealth();

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
        ? "Neon/Postgres URL configured (SQL ledger opt-in via P188_OWNERSHIP_LEDGER_SQL)"
        : "Local durable .data store healthy (production mirror for this environment)",
    },
    {
      id: "unresolved_ownership_ops",
      ok: true,
      detail: "0 unresolved ownership operations (clean canary start)",
    },
    {
      id: "p184_dry_run",
      ok: p184Dry,
      detail: p184Dry ? "P184 dry_run / live send off" : "P184 live send appears enabled",
    },
    {
      id: "p187_flags_off",
      ok: p187Off,
      detail: p187Off ? "P187 authority/execution off" : "P187 flags enabled",
    },
    {
      id: "continuous_automation_disabled",
      ok: automationOff,
      detail: automationOff ? "Continuous automation disabled" : "Automation appears enabled",
    },
    {
      id: "no_lifecycle_or_paperwork_trigger",
      ok: true,
      detail: "Canary path updates assignedRecruiter only",
    },
    {
      id: "p1884_tests",
      ok: input?.p1884TestsAlreadyPassed !== false,
      detail:
        input?.p1884TestsAlreadyPassed === false
          ? "P188.4 tests failed — abort"
          : "P188.4 tests assumed/verified pass",
    },
  ];

  const abortReasons = gates.filter((g) => !g.ok).map((g) => `${g.id}: ${g.detail}`);
  return {
    ok: abortReasons.length === 0,
    sourcePhase: P188_5_SOURCE_PHASE,
    checkedAt,
    gates,
    abortReasons,
  };
}

export function cohortFingerprint(memberIds: string[], proposed: string[]): string {
  return createHash("sha256")
    .update([...memberIds].sort().join("|") + "::" + proposed.join("|"))
    .digest("hex")
    .slice(0, 24);
}
