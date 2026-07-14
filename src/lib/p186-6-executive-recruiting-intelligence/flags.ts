/**
 * P186.6 feature flags — all default OFF.
 * No authoritative mode, paperwork send, auto-approval, MEL export, or continuous automation.
 */
export type P1866Flags = {
  executiveDashboard: boolean;
  lifecycleFunnel: boolean;
  candidateHealthScore: boolean;
  agingMetrics: boolean;
  bottleneckAnalysis: boolean;
  recruiterDmScorecards: boolean;
  forecasting: boolean;
  executiveExceptionCenter: boolean;
  redactedExports: boolean;
};

function flag(name: string): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return false;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function readP1866Flags(overrides?: Partial<P1866Flags>): P1866Flags {
  return {
    executiveDashboard: flag("P186_EXECUTIVE_DASHBOARD"),
    lifecycleFunnel: flag("P186_LIFECYCLE_FUNNEL"),
    candidateHealthScore: flag("P186_CANDIDATE_HEALTH_SCORE"),
    agingMetrics: flag("P186_AGING_METRICS"),
    bottleneckAnalysis: flag("P186_BOTTLENECK_ANALYSIS"),
    recruiterDmScorecards: flag("P186_RECRUITER_DM_SCORECARDS"),
    forecasting: flag("P186_FORECASTING"),
    executiveExceptionCenter: flag("P186_EXECUTIVE_EXCEPTION_CENTER"),
    redactedExports: flag("P186_6_REDACTED_EXPORTS"),
    ...overrides,
  };
}

export function readMinScorecardSample(): number {
  const n = Number(process.env.P186_SCORECARD_MIN_SAMPLE ?? "5");
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 5;
}

export function readStaleSourceThresholdMs(): number {
  const n = Number(process.env.P186_STALE_SOURCE_THRESHOLD_MS ?? String(6 * 3600000));
  return Number.isFinite(n) && n > 0 ? n : 6 * 3600000;
}
