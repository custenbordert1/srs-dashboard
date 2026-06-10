import {
  buildDataTrustState,
  type DataTrustInput,
  type DataTrustState,
} from "@/lib/data-trust-state";

export const KPI_PARTIAL_SYNC_DISCLAIMER = "Based on partial sync";
export const KPI_DEGRADED_DISCLAIMER = "Showing last sync";
export const KPI_PRELIMINARY_ALERT_LABEL = "Preliminary";

export type KpiTrustCategory =
  | "command-center"
  | "dm-dashboard"
  | "dm-alert"
  | "dm-territory-stat"
  | "recruiter-operational"
  | "recruiting-intelligence"
  | "command-center-territory"
  | "command-center-recruiting-health"
  | "executive-dashboard"
  | "executive-territory-row"
  | "workforce-roster";

export type KpiTrustPresentation = {
  dim: boolean;
  disclaimer: string | null;
  scanLabel: string | null;
  preliminaryAlert: boolean;
};

const COMMAND_CENTER_BREEZY_CANDIDATE = new Set([
  "cc-today",
  "cc-7d",
  "cc-interviewing",
  "cc-top-source",
]);

const DM_DASHBOARD_BREEZY_CANDIDATE = new Set([
  "health",
  "candidates-7d",
  "interviewing",
  "aging-jobs",
  "fill-risk",
  "attention",
  "stalled",
  "hired",
]);

const DM_ALERT_BREEZY = new Set([
  "criticalCount",
  "highCount",
  "agingJobsCount",
  "zeroApplicantJobsCount",
  "territoryRecruitingRiskScore",
]);

const DM_TERRITORY_STAT_BREEZY = new Set([
  "territory-health",
  "alerts",
  "open-calls",
]);

const RECRUITER_OPERATIONAL_BREEZY = new Set([
  "first-applicant",
  "time-to-hire",
  "aging-jobs",
  "top-variant",
  "top-metro",
  "highest-risk",
]);

const RECRUITING_INTELLIGENCE_BREEZY = new Set([
  "ats-candidates-loaded",
  "ats-active-jobs",
  "ats-applicants-today",
  "ats-applicants-7d",
  "ats-applicants-per-opening",
  "open-posts",
  "zero-applicant",
  "avg-applicants",
  "top-states",
  "top-dms",
  "conversion",
]);

const CC_TERRITORY_RECRUITING_BREEZY = new Set(["applicants-7d", "hired"]);

const CC_TERRITORY_STAT_BREEZY = new Set(["territory-health", "open-calls"]);

const EXECUTIVE_DASHBOARD_BREEZY = new Set([
  "territory-health",
  "fill-risk",
  "recruiter-productivity",
  "pipeline-velocity",
  "ats-candidates-loaded",
  "ats-active-jobs",
  "ats-applicants-today",
  "ats-applicants-7d",
  "ats-applicants-per-opening",
  "interviews-active",
]);

const EXECUTIVE_TERRITORY_ROW_BREEZY = new Set([
  "health-score",
  "candidates-7d",
  "candidates-total",
]);

/** Roster CSV metrics — gated when trust is degraded/unavailable (not Breezy partial). */
const WORKFORCE_ROSTER_METRICS = new Set([
  "active-roster",
  "active-imported",
  "inactive-archived",
  "terminated-archived",
  "states-covered",
  "unique-skills",
  "recent-logins",
]);

/** KPI states that should dim Breezy-dependent metrics. */
export function shouldApplyKpiTrustGating(state: DataTrustState): boolean {
  return state === "partial" || state === "degraded" || state === "unavailable";
}

export function isBreezyCandidateDependentKpi(
  kpiId: string,
  category: KpiTrustCategory,
): boolean {
  switch (category) {
    case "command-center":
      return COMMAND_CENTER_BREEZY_CANDIDATE.has(kpiId);
    case "dm-dashboard":
      return DM_DASHBOARD_BREEZY_CANDIDATE.has(kpiId);
    case "dm-alert":
      return DM_ALERT_BREEZY.has(kpiId);
    case "dm-territory-stat":
      return DM_TERRITORY_STAT_BREEZY.has(kpiId);
    case "recruiter-operational":
      return RECRUITER_OPERATIONAL_BREEZY.has(kpiId);
    case "recruiting-intelligence":
      return RECRUITING_INTELLIGENCE_BREEZY.has(kpiId);
    case "command-center-territory":
      return CC_TERRITORY_STAT_BREEZY.has(kpiId);
    case "command-center-recruiting-health":
      return CC_TERRITORY_RECRUITING_BREEZY.has(kpiId);
    case "executive-dashboard":
      return EXECUTIVE_DASHBOARD_BREEZY.has(kpiId);
    case "executive-territory-row":
      return EXECUTIVE_TERRITORY_ROW_BREEZY.has(kpiId);
    case "workforce-roster":
      return WORKFORCE_ROSTER_METRICS.has(kpiId);
    default:
      return false;
  }
}

export function formatScanCompletenessLabel(input?: DataTrustInput): string | null {
  const scanned = input?.positionsScanned;
  const total = input?.totalPositionsAvailable;
  if (scanned == null || total == null || total <= 0) return null;
  return `${scanned} of ${total} positions scanned`;
}

function disclaimerForState(state: DataTrustState): string | null {
  if (state === "partial") return KPI_PARTIAL_SYNC_DISCLAIMER;
  if (state === "degraded") return KPI_DEGRADED_DISCLAIMER;
  if (state === "unavailable") return "Data unavailable";
  return null;
}

export function resolveKpiTrustPresentation(
  state: DataTrustState,
  kpiId: string,
  category: KpiTrustCategory,
  input?: DataTrustInput,
): KpiTrustPresentation {
  const empty: KpiTrustPresentation = {
    dim: false,
    disclaimer: null,
    scanLabel: null,
    preliminaryAlert: false,
  };

  if (!shouldApplyKpiTrustGating(state)) return empty;

  const breezyDependent = isBreezyCandidateDependentKpi(kpiId, category);
  if (!breezyDependent && state !== "unavailable") return empty;

  const dim = breezyDependent || state === "unavailable";
  if (!dim) return empty;

  const scanLabel =
    state === "partial" && breezyDependent && category !== "workforce-roster"
      ? formatScanCompletenessLabel(input)
      : null;

  return {
    dim: true,
    disclaimer: disclaimerForState(state),
    scanLabel,
    preliminaryAlert:
      category === "dm-alert" ||
      kpiId === "attention" ||
      kpiId === "fill-risk" ||
      kpiId === "alerts",
  };
}

export function resolveKpiTrustFromInput(
  input: DataTrustInput,
  kpiId: string,
  category: KpiTrustCategory,
): KpiTrustPresentation {
  const state = buildDataTrustState(input);
  return resolveKpiTrustPresentation(state, kpiId, category, input);
}
