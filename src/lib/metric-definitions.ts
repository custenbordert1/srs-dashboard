/**
 * Canonical metric glossary for SRS Recruiting dashboards.
 *
 * Documents how metrics are computed today. This module does not implement
 * calculations — see the referenced modules for live logic.
 */

/** @see {@link import("@/lib/dm-dashboard/territory-health-score").buildTerritoryHealthScore} */
export const TERRITORY_HEALTH = {
  id: "territory-health",
  displayName: "Territory Health",
  legacyUiLabels: ["Coverage %", "Coverage index"],
  scoreRange: "0–100",
  summary:
    "Weighted composite of recruiting funnel signals for published jobs in scope (not rep staffing coverage).",
  weights: {
    applicantFlow: 0.25,
    openJobAging: 0.2,
    interviewActivity: 0.2,
    candidateVolume: 0.2,
    fillVelocity: 0.15,
  },
  factors: [
    "Applicant flow: share of jobs with ≥1 applicant in the last 7 calendar days (appliedDate).",
    "Open job aging: share of jobs younger than 21 days (created/updated date).",
    "Interview activity: share of jobs with any candidate in interview-like stages.",
    "Candidate volume: average candidates per open job (capped at 8).",
    "Fill velocity: hires in the last 30 days per open job (hired/offer/onboard/active rep stages).",
  ],
  labels: [
    { maxExclusive: 40, label: "Critical" },
    { maxExclusive: 60, label: "At Risk" },
    { maxExclusive: 80, label: "Stable" },
    { label: "Healthy" },
  ],
  emptyJobsScore: 50,
  implementation: "@/lib/dm-dashboard/territory-health-score",
  aliases: ["coveragePercent in territory-intelligence rollups (same score, historical field name)"],
} as const;

/** @see {@link import("@/lib/territory-intelligence/metric-calculators").countActiveRepsFromOnboardingFallback} */
export const ACTIVE_REPS_DM_SNAPSHOT = {
  id: "active-reps-dm-snapshot",
  displayName: "Active Reps (DM snapshot)",
  summary:
    "When MEL coverage-risk data is unavailable on the DM dashboard path: paperworkSigned + ddApproved + hired from onboarding snapshot.",
  implementation: "@/lib/territory-intelligence/metric-calculators#countActiveRepsFromOnboardingFallback",
} as const;

/** @see {@link import("@/lib/territory-intelligence/metric-calculators").countActiveRepsForDm} */
export const ACTIVE_REPS_WITH_COVERAGE = {
  id: "active-reps-coverage",
  displayName: "Active Reps (MEL proximity)",
  summary:
    "When coverage-risk is loaded: max per state of nearby reps within 50mi on opportunities plus low-density state rows.",
  implementation:
    "@/lib/territory-intelligence/metric-calculators#aggregateActiveRepsByState + countActiveRepsForDm",
} as const;

/** @see {@link import("@/lib/territory-intelligence/metric-calculators").countOpenCallsFromDemandSignals} */
export const OPEN_CALLS_DM_SNAPSHOT = {
  id: "open-calls-dm-snapshot",
  displayName: "Open Calls (DM snapshot)",
  summary:
    "Without coverage-risk: sum of coverage shortage bars, else count of unstaffed MEL opportunities in territory.",
  implementation: "@/lib/territory-intelligence/metric-calculators#countOpenCallsFromDemandSignals",
} as const;

/** @see {@link import("@/lib/territory-intelligence/metric-calculators").countOpenCallsForDm} */
export const OPEN_CALLS_WITH_COVERAGE = {
  id: "open-calls-coverage",
  displayName: "Open Calls (MEL opportunities)",
  summary: "When coverage-risk is loaded: count of opportunities where territoryOwner matches the DM.",
  implementation: "@/lib/territory-intelligence/metric-calculators#countOpenCallsForDm",
} as const;

/** @see {@link import("@/lib/breezy-api").countCandidatesLast7Days} */
export const APPLICANTS_7D = {
  id: "applicants-7d",
  displayName: "Applicants (7d)",
  summary:
    "Candidates with appliedDate in the rolling last 7 calendar days ending on fetchedAt (Breezy Added Date timezone).",
  implementation: "@/lib/breezy-api#countCandidatesLast7Days",
  aliasImplementation: "@/lib/territory-intelligence/metric-calculators#countApplicantsLast7Days",
} as const;

/** @see {@link import("@/lib/dm-dashboard/fill-risk-alerts").buildTerritoryFillRiskAlerts} */
export const FILL_RISK_ALERTS = {
  id: "fill-risk-alerts",
  displayName: "Fill Risk Alerts",
  summary:
    "Per-job and per-city signals: no applicants in 7d, no interviews, aging tiers (14/21/30d), low flow, city drought.",
  countRule:
    "Raw count from buildTerritoryFillRiskAlerts only (before merge with needs-attention). See countFillRiskAlerts.",
  implementation: "@/lib/dm-dashboard/fill-risk-alerts",
} as const;

/** @see {@link import("@/lib/dm-dashboard/dm-needs-attention").buildDmNeedsAttention} */
export const NEEDS_ATTENTION_ALERTS = {
  id: "needs-attention",
  displayName: "Needs Attention",
  summary:
    "Merged fill-risk + operational attention items, deduped by alert id, prioritized. Display count uses critical + high + medium priorities only.",
  pipeline:
    "buildTerritoryFillRiskAlerts + buildDmNeedsAttention → mergeTerritoryAlertSources → buildPrioritizedTerritoryAlerts",
  countRule:
    "alertSummary.criticalCount + highCount + mediumCount (excludes low-priority items). See countNeedsAttentionAlerts.",
  implementation:
    "@/lib/dm-dashboard/territory-alert-pipeline + @/lib/territory-intelligence/build-territory-rollup#countNeedsAttentionFromAlertSummary",
} as const;

/** Staffing coverage in recruiter decision intelligence — not territory health. */
export const STAFFING_COVERAGE_PERCENT = {
  id: "staffing-coverage-percent",
  displayName: "Staffing Coverage %",
  summary: "activeReps ÷ openCalls from coverage recommendations (rep roster), not territory health score.",
  implementation: "@/lib/recruiting-decision-intelligence/needs-attention-alerts#buildCoverageHealthMetrics",
} as const;

export const METRIC_GLOSSARY = [
  TERRITORY_HEALTH,
  ACTIVE_REPS_DM_SNAPSHOT,
  ACTIVE_REPS_WITH_COVERAGE,
  OPEN_CALLS_DM_SNAPSHOT,
  OPEN_CALLS_WITH_COVERAGE,
  APPLICANTS_7D,
  FILL_RISK_ALERTS,
  NEEDS_ATTENTION_ALERTS,
  STAFFING_COVERAGE_PERCENT,
] as const;
