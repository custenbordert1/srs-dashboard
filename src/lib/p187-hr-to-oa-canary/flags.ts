/**
 * P187 feature flags — all default OFF.
 * No global multi-transition authority. Production canary execute stays gated.
 */
export type P187Flags = {
  /** Read-only executive canary dashboard */
  canaryDashboard: boolean;
  /** Allow building/authorizing plans and dry-run simulation */
  canaryFramework: boolean;
  /** P186 is authoritative ONLY for Hiring Recommendation → Operator Approved */
  transitionAuthorityHrToOa: boolean;
  /** Permit dry-run / reconciliation tooling */
  reconciliation: boolean;
  /** Permit rollback command framework */
  rollback: boolean;
  /**
   * Explicit production execution gate.
   * Even when on, executeProductionCanary still requires operator authorization
   * and allowProductionExecution: true. Defaults OFF; P187 does not flip this on.
   */
  executeProductionCanary: boolean;
};

function flag(name: string): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return false;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function readP187Flags(overrides?: Partial<P187Flags>): P187Flags {
  return {
    canaryDashboard: flag("P187_CANARY_DASHBOARD"),
    canaryFramework: flag("P187_CANARY_FRAMEWORK"),
    transitionAuthorityHrToOa: flag("P187_TRANSITION_AUTHORITY_HR_TO_OA"),
    reconciliation: flag("P187_RECONCILIATION"),
    rollback: flag("P187_ROLLBACK"),
    executeProductionCanary: flag("P187_EXECUTE_PRODUCTION_CANARY"),
    ...overrides,
  };
}

/** Banned patterns — P187 must never expose a global lifecycle authority switch. */
export function hasGlobalLifecycleAuthorityFlag(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const banned = [
    "P187_AUTHORITATIVE_ALL",
    "P187_ENABLE_ALL_TRANSITIONS",
    "P187_GLOBAL_CUTOVER",
    "P186_ENABLE_ALL_AUTHORITY",
  ];
  return banned.some((k) => {
    const v = env[k]?.trim().toLowerCase();
    return v === "1" || v === "true" || v === "yes" || v === "on";
  });
}
