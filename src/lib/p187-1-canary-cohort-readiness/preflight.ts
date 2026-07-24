import { execSync } from "node:child_process";
import { readP187Flags, hasGlobalLifecycleAuthorityFlag } from "@/lib/p187-hr-to-oa-canary/flags";
import type { P1871GateResult, P1871PreflightReport } from "@/lib/p187-1-canary-cohort-readiness/types";

export function resolveProductionCommit(override?: string): string {
  if (override?.trim()) return override.trim();
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

export type PreflightDeps = {
  productionCommit?: string;
  neonHealthy?: boolean;
  workflowStoreHealthy?: boolean;
  p186ShadowHealthy?: boolean;
  p187FrameworkHealthy?: boolean;
  auditPersistenceHealthy?: boolean;
  reconciliationHealthy?: boolean;
  unresolvedLifecycleOperations?: number;
  criticalMismatches?: number;
  p184P185Isolated?: boolean;
  p184DryRun?: boolean;
  continuousAutomationDisabled?: boolean;
  automaticMelExportDisabled?: boolean;
  nowIso?: () => string;
};

function gate(
  gateId: string,
  ok: boolean,
  detail: string,
  critical = true,
): P1871GateResult {
  return { gateId, ok, detail, critical };
}

/**
 * Production preflight — abort before cohort creation if any critical gate fails.
 * Read-only; does not enable flags or mutate writers.
 */
export function runProductionPreflight(deps: PreflightDeps = {}): P1871PreflightReport {
  const flags = readP187Flags();
  const commit = resolveProductionCommit(deps.productionCommit);

  const neonHealthy = deps.neonHealthy ?? Boolean(
    process.env.P185_DATABASE_URL ||
      process.env.DATABASE_URL ||
      process.env.POSTGRES_URL ||
      process.env.P185_5_FORCE_PGLITE === "1",
  );
  const workflowStoreHealthy = deps.workflowStoreHealthy ?? true;
  const p186ShadowHealthy = deps.p186ShadowHealthy ?? true;
  const p187FrameworkHealthy = deps.p187FrameworkHealthy ?? true;
  const auditPersistenceHealthy = deps.auditPersistenceHealthy ?? true;
  const reconciliationHealthy = deps.reconciliationHealthy ?? true;
  const unresolved = deps.unresolvedLifecycleOperations ?? 0;
  const criticalMismatches = deps.criticalMismatches ?? 0;
  const p184P185Isolated = deps.p184P185Isolated ?? true;
  const p184DryRun = deps.p184DryRun ?? process.env.P185_PRODUCTION_AUTOMATION_ENABLED !== "1";
  const continuousOff =
    deps.continuousAutomationDisabled ??
    !(
      process.env.P154_CONTINUOUS_ENABLED === "1" ||
      process.env.P169_ORCHESTRATOR_ENABLED === "1"
    );
  const melOff =
    deps.automaticMelExportDisabled ??
    process.env.P186_AUTOMATIC_MEL_EXPORT !== "1";

  const flagsOff = {
    P187_CANARY_FRAMEWORK: !flags.canaryFramework,
    P187_TRANSITION_AUTHORITY_HR_TO_OA: !flags.transitionAuthorityHrToOa,
    P187_RECONCILIATION: !flags.reconciliation,
    P187_ROLLBACK: !flags.rollback,
    P187_EXECUTE_PRODUCTION_CANARY: !flags.executeProductionCanary,
    no_global_authority: !hasGlobalLifecycleAuthorityFlag(),
  };

  const gates: P1871GateResult[] = [
    gate("production_commit", commit !== "unknown" && commit.length >= 7, `commit=${commit}`),
    gate("neon_postgres_healthy", neonHealthy, `neonOrPglite=${neonHealthy}`),
    gate("candidate_workflow_store_healthy", workflowStoreHealthy, String(workflowStoreHealthy)),
    gate("p186_shadow_healthy", p186ShadowHealthy, String(p186ShadowHealthy)),
    gate("p187_framework_healthy", p187FrameworkHealthy, String(p187FrameworkHealthy)),
    gate("audit_persistence_healthy", auditPersistenceHealthy, String(auditPersistenceHealthy)),
    gate("reconciliation_healthy", reconciliationHealthy, String(reconciliationHealthy)),
    gate(
      "unresolved_lifecycle_operations",
      unresolved === 0,
      `unresolved=${unresolved}`,
    ),
    gate("critical_mismatches", criticalMismatches === 0, `critical=${criticalMismatches}`),
    gate("p184_p185_isolated", p184P185Isolated, String(p184P185Isolated)),
    gate("p184_dry_run", p184DryRun, String(p184DryRun)),
    gate("continuous_automation_disabled", continuousOff, String(continuousOff)),
    gate("automatic_mel_export_disabled", melOff, String(melOff)),
    gate(
      "p187_authority_execution_flags_off",
      flagsOff.P187_TRANSITION_AUTHORITY_HR_TO_OA &&
        flagsOff.P187_EXECUTE_PRODUCTION_CANARY &&
        flagsOff.no_global_authority,
      JSON.stringify(flagsOff),
    ),
  ];

  const abortReasons = gates.filter((g) => g.critical && !g.ok).map((g) => `${g.gateId}: ${g.detail}`);
  const allCriticalPassed = abortReasons.length === 0;

  return {
    generatedAt: deps.nowIso?.() ?? new Date().toISOString(),
    productionCommit: commit,
    aborted: !allCriticalPassed,
    abortReasons,
    gates,
    allCriticalPassed,
    flagsCurrentlyOff: flagsOff,
  };
}
