import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import { candidatesForJob, parseDate } from "@/lib/dm-dashboard/territory-shared";
import type { ActiveRep } from "@/lib/rep-intelligence/rep-types";
import type { CoverageRecommendation } from "@/lib/recruiting-decision-intelligence/types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_POSTING_WINDOW_DAYS = 30;

export type NeedsAttentionAlertKind =
  | "zero-applicants"
  | "expiring-soon"
  | "low-coverage";

export type NeedsAttentionAlert = {
  id: string;
  kind: NeedsAttentionAlertKind;
  urgency: number;
  label: string;
  primaryMetric: string;
  secondaryMetric: string;
  detail?: string;
};

export type CoverageHealthMetrics = {
  openCalls: number | null;
  activeReps: number;
  coveragePercent: number | null;
};

function jobAgeDays(job: BreezyJob, reference: Date): number | null {
  const created = parseDate(job.createdDate || job.updatedDate);
  if (!created) return null;
  return Math.floor((reference.getTime() - created.getTime()) / MS_PER_DAY);
}

function daysUntilPostingExpiry(job: BreezyJob, reference: Date): number | null {
  const age = jobAgeDays(job, reference);
  if (age === null) return null;
  return DEFAULT_POSTING_WINDOW_DAYS - age;
}

export function buildCoverageHealthMetrics(input: {
  jobs: BreezyJob[];
  activeReps: ActiveRep[];
  coverageRecommendations: CoverageRecommendation[];
}): CoverageHealthMetrics {
  const openCallsFromCoverage = input.coverageRecommendations.reduce(
    (sum, row) => sum + Math.max(0, row.openOpportunityCount),
    0,
  );
  const openCalls =
    openCallsFromCoverage > 0 ? openCallsFromCoverage : input.jobs.length > 0 ? input.jobs.length : null;
  const activeReps = input.activeReps.filter((rep) => rep.active).length;

  if (openCalls === null || openCalls <= 0) {
    return { openCalls: null, activeReps, coveragePercent: null };
  }

  const coveragePercent = Math.round((activeReps / openCalls) * 100);
  return { openCalls, activeReps, coveragePercent };
}

export function coveragePercentTone(
  coveragePercent: number | null,
): "good" | "warn" | "critical" | "neutral" {
  if (coveragePercent === null) return "neutral";
  if (coveragePercent >= 80) return "good";
  if (coveragePercent >= 50) return "warn";
  return "critical";
}

export function buildNeedsAttentionAlerts(input: {
  jobs: BreezyJob[];
  candidates: BreezyCandidate[];
  coverageRecommendations: CoverageRecommendation[];
  activeReps: ActiveRep[];
  referenceIso: string;
}): NeedsAttentionAlert[] {
  const reference = new Date(input.referenceIso);
  const alerts: NeedsAttentionAlert[] = [];

  for (const job of input.jobs) {
    const ageDays = jobAgeDays(job, reference);
    const applicants = candidatesForJob(job, input.candidates).length;
    const label = `${job.city}, ${job.state}`.replace(/^,\s*|,\s*$/g, "").trim() || job.name;

    if (ageDays !== null && ageDays >= 7 && applicants === 0) {
      alerts.push({
        id: `zero:${job.jobId}`,
        kind: "zero-applicants",
        urgency: 90 + Math.min(ageDays, 30),
        label,
        primaryMetric: `${Math.max(1, ageDays)} days open`,
        secondaryMetric: "0 applicants",
        detail: job.name,
      });
    }

    const daysLeft = daysUntilPostingExpiry(job, reference);
    if (daysLeft !== null && daysLeft >= 0 && daysLeft <= 5) {
      alerts.push({
        id: `expiring:${job.jobId}`,
        kind: "expiring-soon",
        urgency: 70 + (5 - daysLeft) * 5,
        label,
        primaryMetric: `Expires ~${daysLeft}d`,
        secondaryMetric: `${applicants} applicant${applicants === 1 ? "" : "s"}`,
        detail: job.name,
      });
    }
  }

  const repsByTerritory = new Map<string, number>();
  for (const rep of input.activeReps) {
    if (!rep.active) continue;
    const key = rep.state.trim().toUpperCase();
    repsByTerritory.set(key, (repsByTerritory.get(key) ?? 0) + 1);
  }

  const opensByTerritory = new Map<string, number>();
  for (const row of input.coverageRecommendations) {
    const key = row.state.trim().toUpperCase();
    opensByTerritory.set(key, (opensByTerritory.get(key) ?? 0) + Math.max(1, row.openOpportunityCount));
  }

  for (const [state, openCalls] of opensByTerritory) {
    const activeReps = repsByTerritory.get(state) ?? 0;
    if (openCalls <= 0) continue;
    const coveragePercent = Math.round((activeReps / openCalls) * 100);
    if (coveragePercent >= 50) continue;

    const sample = input.coverageRecommendations.find(
      (row) => row.state.trim().toUpperCase() === state,
    );
    alerts.push({
      id: `coverage:${state}`,
      kind: "low-coverage",
      urgency: 60 + (50 - coveragePercent),
      label: sample ? `${sample.city}, ${sample.state}` : state,
      primaryMetric: `${openCalls} open${openCalls === 1 ? "" : "s"}`,
      secondaryMetric: `${activeReps} active rep${activeReps === 1 ? "" : "s"}`,
      detail: `Coverage ${coveragePercent}%`,
    });
  }

  if (input.jobs.length === 0 && input.coverageRecommendations.length === 0) {
    return [];
  }

  return alerts.sort((a, b) => b.urgency - a.urgency);
}
