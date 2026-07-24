/** P186.6 — Executive recruiting intelligence (read-only). */

export { P186_6_SOURCE_PHASE, P186_6_SCHEMA_VERSION, P1866_FUNNEL_STAGES } from "@/lib/p186-6-executive-recruiting-intelligence/types";
export type * from "@/lib/p186-6-executive-recruiting-intelligence/types";

export { readP1866Flags, readMinScorecardSample, readStaleSourceThresholdMs } from "@/lib/p186-6-executive-recruiting-intelligence/flags";
export type { P1866Flags } from "@/lib/p186-6-executive-recruiting-intelligence/flags";

export { resolveDateRange, dedupeCohort, median, average } from "@/lib/p186-6-executive-recruiting-intelligence/util";
export { buildFunnelMetrics, computeConversionRates } from "@/lib/p186-6-executive-recruiting-intelligence/funnel";
export {
  calculateAging,
  summarizeAgingBands,
  DEFAULT_AGING_THRESHOLDS,
} from "@/lib/p186-6-executive-recruiting-intelligence/aging";
export type { AgingThresholds } from "@/lib/p186-6-executive-recruiting-intelligence/aging";
export { scoreCandidateHealth, scoreCohortHealth } from "@/lib/p186-6-executive-recruiting-intelligence/healthScore";
export { detectBottlenecks } from "@/lib/p186-6-executive-recruiting-intelligence/bottlenecks";
export {
  buildRecruiterScorecards,
  buildDmScorecards,
} from "@/lib/p186-6-executive-recruiting-intelligence/scorecards";
export { buildPaperworkOnboardingMetrics } from "@/lib/p186-6-executive-recruiting-intelligence/paperworkMetrics";
export {
  classifyExecutiveExceptions,
  P1866_EXCEPTION_SAFE_ACTIONS,
} from "@/lib/p186-6-executive-recruiting-intelligence/exceptions";
export type { ExceptionSafeAction } from "@/lib/p186-6-executive-recruiting-intelligence/exceptions";
export { buildForecasts } from "@/lib/p186-6-executive-recruiting-intelligence/forecast";
export { buildSystemHealth, metricsAreConfident } from "@/lib/p186-6-executive-recruiting-intelligence/systemHealth";
export {
  toP1866ProductRole,
  canViewSection,
  canPerformExceptionAction,
  filterScorecardsForRole,
} from "@/lib/p186-6-executive-recruiting-intelligence/rbac";
export { getCached, setCached, clearP1866CacheForTests, paginate } from "@/lib/p186-6-executive-recruiting-intelligence/cache";
export { buildExecutiveDashboard } from "@/lib/p186-6-executive-recruiting-intelligence/dashboard";
export type { P1866ExecutiveDashboard } from "@/lib/p186-6-executive-recruiting-intelligence/dashboard";
