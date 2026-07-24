import { calculateAging, summarizeAgingBands } from "@/lib/p186-6-executive-recruiting-intelligence/aging";
import { detectBottlenecks } from "@/lib/p186-6-executive-recruiting-intelligence/bottlenecks";
import { getCached, paginate, setCached } from "@/lib/p186-6-executive-recruiting-intelligence/cache";
import { classifyExecutiveExceptions } from "@/lib/p186-6-executive-recruiting-intelligence/exceptions";
import { readP1866Flags } from "@/lib/p186-6-executive-recruiting-intelligence/flags";
import { buildForecasts } from "@/lib/p186-6-executive-recruiting-intelligence/forecast";
import {
  buildFunnelMetrics,
  computeConversionRates,
} from "@/lib/p186-6-executive-recruiting-intelligence/funnel";
import { scoreCohortHealth } from "@/lib/p186-6-executive-recruiting-intelligence/healthScore";
import { buildPaperworkOnboardingMetrics } from "@/lib/p186-6-executive-recruiting-intelligence/paperworkMetrics";
import {
  canViewSection,
  filterScorecardsForRole,
} from "@/lib/p186-6-executive-recruiting-intelligence/rbac";
import {
  buildDmScorecards,
  buildRecruiterScorecards,
} from "@/lib/p186-6-executive-recruiting-intelligence/scorecards";
import {
  buildSystemHealth,
  metricsAreConfident,
} from "@/lib/p186-6-executive-recruiting-intelligence/systemHealth";
import type {
  P1866CohortCandidate,
  P1866DateRangeKey,
  P1866ProductRole,
  P1866SystemHealth,
} from "@/lib/p186-6-executive-recruiting-intelligence/types";
import { P186_6_SOURCE_PHASE } from "@/lib/p186-6-executive-recruiting-intelligence/types";
import { resolveDateRange } from "@/lib/p186-6-executive-recruiting-intelligence/util";

export type P1866ExecutiveDashboard = {
  sourcePhase: typeof P186_6_SOURCE_PHASE;
  generatedAt: string;
  cacheHit: boolean;
  freshnessAt: string;
  dateRange: ReturnType<typeof resolveDateRange>;
  role: P1866ProductRole;
  flags: ReturnType<typeof readP1866Flags>;
  metricsConfident: boolean;
  funnel: ReturnType<typeof buildFunnelMetrics> | null;
  conversions: Record<string, number | null> | null;
  agingSummary: ReturnType<typeof summarizeAgingBands> | null;
  aging: ReturnType<typeof calculateAging> | null;
  health: ReturnType<typeof scoreCohortHealth> | null;
  bottlenecks: ReturnType<typeof detectBottlenecks> | null;
  recruiterScorecards: ReturnType<typeof buildRecruiterScorecards> | null;
  dmScorecards: ReturnType<typeof buildDmScorecards> | null;
  paperwork: ReturnType<typeof buildPaperworkOnboardingMetrics> | null;
  exceptions: ReturnType<typeof classifyExecutiveExceptions> | null;
  forecasts: ReturnType<typeof buildForecasts> | null;
  systemHealth: P1866SystemHealth;
  pagination?: { page: number; pageSize: number; total: number };
  isolation: {
    paperworkSendDisabled: true;
    melWriteDisabled: true;
    p184P185Untouched: true;
    p186NonAuthoritative: true;
    continuousAutomationDisabled: true;
  };
  safety: {
    productionWritesAttempted: 0;
    melWritesAttempted: 0;
    paperworkSendsAttempted: 0;
  };
  consolidationNotes: string[];
};

export function buildExecutiveDashboard(input: {
  role: P1866ProductRole;
  cohort: P1866CohortCandidate[];
  dateRangeKey?: P1866DateRangeKey;
  customRange?: { startMs: number; endMs: number };
  selfName?: string | null;
  systemHealthInput?: Parameters<typeof buildSystemHealth>[0];
  page?: number;
  pageSize?: number;
  forceFlags?: Partial<ReturnType<typeof readP1866Flags>>;
  nowMs?: number;
  cacheTtlMs?: number;
}): P1866ExecutiveDashboard {
  const flags = readP1866Flags(input.forceFlags);
  const now = input.nowMs ?? Date.now();
  const dateRange = resolveDateRange(input.dateRangeKey ?? "last_7_days", now, input.customRange);
  const cacheKey = `p1866:${input.role}:${dateRange.label}:${input.cohort.length}:${input.page ?? 1}`;

  if (flags.executiveDashboard) {
    const cached = getCached<P1866ExecutiveDashboard>(cacheKey);
    if (cached.hit && cached.value) {
      return { ...cached.value, cacheHit: true };
    }
  }

  const systemHealth = buildSystemHealth({
    ...(input.systemHealthInput ?? {}),
    nowMs: now,
    schemaHealth: "ok",
    storageHealth: input.systemHealthInput?.storageHealth ?? "ok",
  });
  const confident = metricsAreConfident(systemHealth);

  const health = flags.candidateHealthScore ? scoreCohortHealth(input.cohort, now) : null;
  const healthByCandidate = Object.fromEntries(
    (health ?? []).map((h) => [h.candidateId, h.band]),
  );

  const funnel =
    flags.lifecycleFunnel && canViewSection(input.role, "funnel")
      ? buildFunnelMetrics({
          cohort: input.cohort,
          healthByCandidate,
          nowMs: now,
        })
      : null;

  const conversions = flags.lifecycleFunnel ? computeConversionRates({ cohort: input.cohort }) : null;

  const aging =
    flags.agingMetrics && canViewSection(input.role, "aging")
      ? calculateAging({ cohort: input.cohort, nowMs: now })
      : null;

  const bottlenecks =
    flags.bottleneckAnalysis && canViewSection(input.role, "bottlenecks")
      ? detectBottlenecks({ cohort: input.cohort, nowMs: now })
      : null;

  let recruiterScorecards =
    flags.recruiterDmScorecards && canViewSection(input.role, "scorecards")
      ? buildRecruiterScorecards({ cohort: input.cohort, nowMs: now })
      : null;
  let dmScorecards =
    flags.recruiterDmScorecards && canViewSection(input.role, "scorecards")
      ? buildDmScorecards({ cohort: input.cohort, nowMs: now })
      : null;

  if (recruiterScorecards) {
    recruiterScorecards = filterScorecardsForRole(input.role, recruiterScorecards, input.selfName);
  }
  if (dmScorecards) {
    dmScorecards = filterScorecardsForRole(input.role, dmScorecards, input.selfName);
  }

  const paperwork =
    canViewSection(input.role, "paperwork")
      ? buildPaperworkOnboardingMetrics({ cohort: input.cohort, nowMs: now })
      : null;

  const exceptions =
    flags.executiveExceptionCenter && canViewSection(input.role, "exceptions")
      ? classifyExecutiveExceptions({ cohort: input.cohort, nowMs: now })
      : null;

  const forecasts =
    flags.forecasting && canViewSection(input.role, "forecast")
      ? buildForecasts({ cohort: input.cohort, dateRangeLabel: dateRange.label })
      : null;

  const pagedExceptions = exceptions
    ? paginate(exceptions, input.page ?? 1, input.pageSize ?? 50)
    : null;

  const generatedAt = new Date(now).toISOString();
  const dashboard: P1866ExecutiveDashboard = {
    sourcePhase: P186_6_SOURCE_PHASE,
    generatedAt,
    cacheHit: false,
    freshnessAt: generatedAt,
    dateRange,
    role: input.role,
    flags,
    metricsConfident: confident,
    funnel: confident || !flags.lifecycleFunnel ? funnel : funnel,
    conversions,
    agingSummary: aging ? summarizeAgingBands(aging) : null,
    aging,
    health: flags.candidateHealthScore && canViewSection(input.role, "health") ? health : null,
    bottlenecks,
    recruiterScorecards,
    dmScorecards,
    paperwork,
    exceptions: pagedExceptions?.items ?? exceptions,
    forecasts,
    systemHealth,
    pagination: pagedExceptions
      ? {
          page: pagedExceptions.page,
          pageSize: pagedExceptions.pageSize,
          total: pagedExceptions.total,
        }
      : undefined,
    isolation: {
      paperworkSendDisabled: true,
      melWriteDisabled: true,
      p184P185Untouched: true,
      p186NonAuthoritative: true,
      continuousAutomationDisabled: true,
    },
    safety: {
      productionWritesAttempted: 0,
      melWritesAttempted: 0,
      paperworkSendsAttempted: 0,
    },
    consolidationNotes: [
      "Later consolidate overlapping P126/P155/P159 ops dashboards into this P186 executive panel",
      "Keep P171 lifecycle panel until P186 cutover; do not remove in P186.6",
      "Keep P185 paperwork panels as send SoR surfaces",
    ],
  };

  // Downgrade confidence message when stale — still return aggregates but mark metricsConfident false
  if (!confident) {
    dashboard.metricsConfident = false;
  }

  if (flags.executiveDashboard) {
    setCached(cacheKey, dashboard, input.cacheTtlMs ?? 60_000);
  }

  return dashboard;
}
