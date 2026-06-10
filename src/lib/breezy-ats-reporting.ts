/**
 * Org-wide ATS reporting bundle — shared fetch + headline KPIs for Executive,
 * Recruiting Intelligence, and Overview widgets.
 */

import { buildBreezyAtsMetrics, type BreezyAtsMetrics } from "@/lib/breezy-ats-metrics";
import {
  fetchBreezyCandidates,
  fetchBreezyJobs,
  type BreezyCandidatesSuccess,
  type BreezyJobsSuccess,
} from "@/lib/breezy-api";
import type { Kpi } from "@/lib/recruiting-sample-data";

export type OrgAtsReportingBundle = {
  ok: true;
  jobs: BreezyJobsSuccess;
  candidates: BreezyCandidatesSuccess;
  ats: BreezyAtsMetrics;
};

export type OrgAtsReportingFailure = {
  ok: false;
  error: string;
  jobs?: BreezyJobsSuccess | { ok: false; error: string; fetchedAt: string };
  candidates?: BreezyCandidatesSuccess | { ok: false; error: string; fetchedAt: string };
};

export type OrgAtsReportingResult = OrgAtsReportingBundle | OrgAtsReportingFailure;

export async function fetchOrgAtsReportingBundle(options?: {
  force?: boolean;
}): Promise<OrgAtsReportingResult> {
  const [jobsResult, candidatesResult] = await Promise.all([
    fetchBreezyJobs("published"),
    fetchBreezyCandidates(options?.force ? { force: true } : undefined),
  ]);

  if (!jobsResult.ok && !candidatesResult.ok) {
    return {
      ok: false,
      error: jobsResult.ok ? candidatesResult.error : jobsResult.error,
      jobs: jobsResult,
      candidates: candidatesResult,
    };
  }

  if (!jobsResult.ok) {
    return { ok: false, error: jobsResult.error, jobs: jobsResult, candidates: candidatesResult };
  }
  if (!candidatesResult.ok) {
    return { ok: false, error: candidatesResult.error, jobs: jobsResult, candidates: candidatesResult };
  }

  const ats = buildBreezyAtsMetrics(candidatesResult, jobsResult);
  return { ok: true, jobs: jobsResult, candidates: candidatesResult, ats };
}

export function applicantsPerOpeningFromAts(metrics: BreezyAtsMetrics): number {
  if (metrics.publishedJobs <= 0) return 0;
  return Math.round((metrics.candidatesLoaded / metrics.publishedJobs) * 10) / 10;
}

const ATS_METRICS_HINT = "Canonical counts from shared Breezy ATS metrics service";

export function buildAtsHeadlineKpis(metrics: BreezyAtsMetrics, error?: string): Kpi[] {
  if (error) {
    return [
      flatAtsKpi("ats-candidates-loaded", "Candidates loaded", "—", error),
      flatAtsKpi("ats-active-jobs", "Active jobs", "—", error),
      flatAtsKpi("ats-applicants-today", "Applicants today", "—", error),
      flatAtsKpi("ats-applicants-7d", "Applicants (7 days)", "—", error),
    ];
  }

  const perOpening = applicantsPerOpeningFromAts(metrics);
  return [
    flatAtsKpi(
      "ats-candidates-loaded",
      "Candidates loaded",
      metrics.candidatesLoaded.toLocaleString(),
      `${ATS_METRICS_HINT} · Last sync ${metrics.lastSuccessfulSyncLabel}`,
    ),
    flatAtsKpi(
      "ats-active-jobs",
      "Active jobs",
      metrics.publishedJobs.toLocaleString(),
      "Published positions from Breezy jobs API",
    ),
    flatAtsKpi(
      "ats-applicants-today",
      "Applicants today",
      metrics.applicantsToday.toLocaleString(),
      "Rolling 24 hours before last successful sync",
    ),
    flatAtsKpi(
      "ats-applicants-7d",
      "Applicants (7 days)",
      metrics.applicants7d.toLocaleString(),
      "7 calendar days (Added Date timezone)",
    ),
    flatAtsKpi(
      "ats-applicants-per-opening",
      "Applicants / opening",
      perOpening.toLocaleString(),
      `Candidates loaded ÷ published jobs (${metrics.candidatesLoaded} ÷ ${metrics.publishedJobs})`,
    ),
  ];
}

function flatAtsKpi(id: string, label: string, value: string, hint: string): Kpi {
  return {
    id,
    label,
    value,
    change: "Live",
    changeDirection: "flat",
    hint,
  };
}
