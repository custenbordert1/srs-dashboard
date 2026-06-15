import type { AlertSeverity } from "@/lib/alerts/alert-types";

/** Project coverage thresholds (percent). */
export const PROJECT_COVERAGE_CRITICAL_MAX = 20;
export const PROJECT_COVERAGE_HIGH_MAX = 40;

/** Territory health thresholds (percent). */
export const TERRITORY_COVERAGE_CRITICAL_MAX = 30;
export const TERRITORY_COVERAGE_HIGH_MAX = 45;
export const TERRITORY_RISK_SCORE_CRITICAL_MIN = 75;
export const TERRITORY_RISK_SCORE_HIGH_MIN = 60;

/** Recruiter workload thresholds (0–100 score). */
export const RECRUITER_WORKLOAD_CRITICAL_MIN = 80;
export const RECRUITER_WORKLOAD_HIGH_MIN = 55;

/** Placement funnel drop-off threshold (percent). */
export const PLACEMENT_FUNNEL_DROP_OFF_HIGH_MIN = 35;

/** Candidate SLA thresholds — aligned with candidate-action-sla.ts. */
export const CANDIDATE_READY_MEL_AGING_DAYS = 5;
export const CANDIDATE_INTERVIEW_PENDING_DAYS = 3;

export function severityRank(severity: AlertSeverity): number {
  switch (severity) {
    case "critical":
      return 4;
    case "high":
      return 3;
    case "medium":
      return 2;
    default:
      return 1;
  }
}

export function projectCoverageSeverity(coveragePercent: number): AlertSeverity | null {
  if (coveragePercent < PROJECT_COVERAGE_CRITICAL_MAX) return "critical";
  if (coveragePercent < PROJECT_COVERAGE_HIGH_MAX) return "high";
  return null;
}

export function territoryCoverageSeverity(coveragePercent: number, riskScore: number): AlertSeverity | null {
  if (coveragePercent < TERRITORY_COVERAGE_CRITICAL_MAX || riskScore >= TERRITORY_RISK_SCORE_CRITICAL_MIN) {
    return "critical";
  }
  if (coveragePercent < TERRITORY_COVERAGE_HIGH_MAX || riskScore >= TERRITORY_RISK_SCORE_HIGH_MIN) {
    return "high";
  }
  return null;
}

export function recruiterWorkloadSeverity(score: number): AlertSeverity | null {
  if (score >= RECRUITER_WORKLOAD_CRITICAL_MIN) return "critical";
  if (score >= RECRUITER_WORKLOAD_HIGH_MIN) return "high";
  return null;
}
