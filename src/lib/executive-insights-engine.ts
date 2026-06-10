import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import { countCandidatesLast7Days } from "@/lib/breezy-api";
import { buildTerritoryHealthScore } from "@/lib/dm-dashboard/territory-health-score";
import { buildTerritoryFillRiskAlerts } from "@/lib/dm-dashboard/fill-risk-alerts";
import { buildRecruiterProductivityLive } from "@/lib/recruiting-automation/recruiter-productivity-live";
import { parseDate, MS_PER_DAY } from "@/lib/dm-dashboard/territory-shared";
import type { CandidateWorkflowState } from "@/lib/candidate-workflow-types";
import type { ChartBar } from "@/lib/recruiting-intelligence";

export type ExecutiveInsightsKpis = {
  fillRiskScore: number;
  fillRiskLabel: string;
  territoryHealthScore: number;
  territoryHealthLabel: string;
  recruiterProductivityScore: number;
  pipelineVelocity: number;
  applicantsPerOpening: number;
  conversionFunnel: ChartBar[];
  hiringMomentumTrend: ChartBar[];
  activeJobs: number;
  totalCandidates: number;
  candidatesLast7Days: number;
  interviewsActive: number;
  hiresYtd: number;
};

function pipelineVelocity(candidates: BreezyCandidate[], referenceIso: string): number {
  const reference = new Date(referenceIso);
  const since14d = new Date(reference.getTime() - 14 * MS_PER_DAY);
  const recent = candidates.filter((c) => {
    const applied = parseDate(c.appliedDate);
    return applied !== null && applied >= since14d;
  });
  const hired = recent.filter((c) => {
    const stage = c.stage.toLowerCase();
    return stage.includes("hired") || stage.includes("offer");
  });
  return recent.length > 0 ? Math.round((hired.length / recent.length) * 100) : 0;
}

function hiringMomentumTrend(candidates: BreezyCandidate[], referenceIso: string): ChartBar[] {
  const reference = new Date(referenceIso);
  const buckets: ChartBar[] = [];
  for (let week = 7; week >= 0; week -= 1) {
    const start = new Date(reference.getTime() - (week + 1) * 7 * MS_PER_DAY);
    const end = new Date(reference.getTime() - week * MS_PER_DAY);
    const label = week === 0 ? "This wk" : `W-${week}`;
    let count = 0;
    for (const candidate of candidates) {
      const applied = parseDate(candidate.appliedDate);
      if (applied && applied >= start && applied < end) count += 1;
    }
    buckets.push({ label, value: count });
  }
  return buckets;
}

function conversionFunnel(candidates: BreezyCandidate[]): ChartBar[] {
  const counts = { Applied: 0, "In review": 0, Interviewing: 0, Hired: 0 };
  for (const candidate of candidates) {
    const stage = candidate.stage.toLowerCase();
    if (stage.includes("hired") || stage.includes("offer")) counts.Hired += 1;
    else if (stage.includes("interview") || stage.includes("screen")) counts.Interviewing += 1;
    else if (stage.includes("review") || stage.includes("contacted")) counts["In review"] += 1;
    else counts.Applied += 1;
  }
  const total = candidates.length || 1;
  return (Object.keys(counts) as Array<keyof typeof counts>).map((label) => ({
    label,
    value: Math.round((counts[label] / total) * 100),
  }));
}

function recruiterProductivityScore(
  rows: ReturnType<typeof buildRecruiterProductivityLive>,
): number {
  if (rows.length === 0) return 0;
  const avgConversion =
    rows.reduce((sum, row) => sum + (row.conversionPercent ?? 0), 0) / rows.length;
  const avgReviewed = rows.reduce((sum, row) => sum + row.candidatesReviewed, 0) / rows.length;
  return Math.min(100, Math.round(avgConversion * 0.6 + Math.min(40, avgReviewed) * 0.4));
}

export function buildExecutiveInsightsKpis(
  jobs: BreezyJob[],
  candidates: BreezyCandidate[],
  fetchedAt: string,
  workflows: CandidateWorkflowState = {},
): ExecutiveInsightsKpis {
  const health = buildTerritoryHealthScore(jobs, candidates, fetchedAt);
  const fillRisks = buildTerritoryFillRiskAlerts(jobs, candidates, fetchedAt);
  const criticalRisks = fillRisks.filter((r) => r.severity === "critical").length;
  const fillRiskScore = Math.max(0, Math.min(100, 100 - criticalRisks * 12 - fillRisks.length * 3));
  const productivityRows = buildRecruiterProductivityLive(candidates, workflows, fetchedAt);

  const candidatesLast7Days = countCandidatesLast7Days(candidates, fetchedAt);

  const interviewsActive = candidates.filter((c) => {
    const stage = c.stage.toLowerCase();
    return stage.includes("interview") || stage.includes("screen");
  }).length;

  const hiresYtd = candidates.filter((c) => {
    const stage = c.stage.toLowerCase();
    return stage.includes("hired") || stage.includes("offer") || stage.includes("placed");
  }).length;

  return {
    fillRiskScore,
    fillRiskLabel:
      fillRiskScore >= 75 ? "Low risk" : fillRiskScore >= 50 ? "Moderate risk" : "Elevated risk",
    territoryHealthScore: health.score,
    territoryHealthLabel: health.label,
    recruiterProductivityScore: recruiterProductivityScore(productivityRows),
    pipelineVelocity: pipelineVelocity(candidates, fetchedAt),
    applicantsPerOpening:
      jobs.length > 0 ? Math.round((candidates.length / jobs.length) * 10) / 10 : 0,
    conversionFunnel: conversionFunnel(candidates),
    hiringMomentumTrend: hiringMomentumTrend(candidates, fetchedAt),
    activeJobs: jobs.length,
    totalCandidates: candidates.length,
    candidatesLast7Days,
    interviewsActive,
    hiresYtd,
  };
}
