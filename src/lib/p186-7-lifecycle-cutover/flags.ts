/**
 * P186.7 feature flags — all default OFF.
 * No global authoritative flag. No automatic writer disablement.
 */
export type P1867Flags = {
  cutoverDashboard: boolean;
  writerFreezeControls: boolean;
  transitionCanaryFramework: boolean;
  rollbackControls: boolean;
  /** Transition-scoped authority — never a global enable-all. */
  lifecycleAuthorityByTransitionGroup: boolean;
  reconcilerScheduler: boolean;
};

function flag(name: string): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return false;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function readP1867Flags(overrides?: Partial<P1867Flags>): P1867Flags {
  return {
    cutoverDashboard: flag("P186_CUTOVER_DASHBOARD"),
    writerFreezeControls: flag("P186_WRITER_FREEZE_CONTROLS"),
    transitionCanaryFramework: flag("P186_TRANSITION_CANARY_FRAMEWORK"),
    rollbackControls: flag("P186_ROLLBACK_CONTROLS"),
    lifecycleAuthorityByTransitionGroup: flag("P186_LIFECYCLE_AUTHORITY_BY_TRANSITION_GROUP"),
    reconcilerScheduler: flag("P186_RECONCILER_SCHEDULER"),
    ...overrides,
  };
}

/** Explicitly reject any global authority enable-all pattern. */
export function hasGlobalAuthoritativeFlag(env: NodeJS.ProcessEnv = process.env): boolean {
  const banned = [
    "P186_AUTHORITATIVE",
    "P186_ENABLE_ALL_AUTHORITY",
    "P186_GLOBAL_AUTHORITY",
    "P186_CUTOVER_ALL",
  ];
  return banned.some((k) => {
    const v = env[k]?.trim().toLowerCase();
    return v === "1" || v === "true" || v === "yes" || v === "on";
  });
}

export function readShadowMatchThreshold(): number {
  const n = Number(process.env.P186_SHADOW_MATCH_THRESHOLD ?? "0.95");
  return Number.isFinite(n) && n > 0 && n <= 1 ? n : 0.95;
}
