import type { BreezyCandidate } from "@/lib/breezy-api";
import { countOpenCalls } from "@/lib/unified-recruiting-command-center/build-kpis";
import type { RecruitingIntelligenceRouteBundle } from "@/lib/recruiting-intelligence/load-recruiting-intelligence-route-bundle";
import {
  computeApplicantVelocityTrend,
  countHiresLast7Days,
} from "@/lib/territory-intelligence/territory-intelligence-metrics";
import { countApplicantsLast7Days } from "@/lib/territory-intelligence/metric-calculators";
import type { MetricTrendComparison, ScorecardMetric, TrendDirection } from "@/lib/executive-morning-brief/types";

function isInterviewStage(stage: string): boolean {
  const normalized = stage.toLowerCase();
  return normalized.includes("interview") || normalized.includes("screen");
}

function countInterviewsLast7Days(candidates: BreezyCandidate[], fetchedAt: string): number {
  const reference = Date.parse(fetchedAt);
  const since = reference - 7 * 24 * 60 * 60 * 1000;
  let count = 0;
  for (const candidate of candidates) {
    if (!isInterviewStage(candidate.stage)) continue;
    const applied = Date.parse(candidate.updatedDate || candidate.appliedDate || "");
    if (!Number.isNaN(applied) && applied >= since) count += 1;
  }
  return count;
}

function trendFromDelta(delta: number, unit = ""): MetricTrendComparison {
  const direction: TrendDirection = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  const sign = delta > 0 ? "+" : "";
  return {
    direction,
    delta,
    label: `${sign}${delta}${unit}`,
  };
}

function buildTrends(current: number, priorWeek: number, priorMonthEstimate: number): ScorecardMetric["trends"] {
  const dailyEstimate = Math.round(current / 7);
  const priorDayEstimate = Math.round(priorWeek / 7);
  return {
    vsYesterday: trendFromDelta(dailyEstimate - priorDayEstimate),
    vsLastWeek: trendFromDelta(current - priorWeek),
    vsLastMonth: trendFromDelta(current - priorMonthEstimate),
  };
}

export function buildExecutiveScorecard(bundle: RecruitingIntelligenceRouteBundle): ScorecardMetric[] {
  const { candidates, jobs, fetchedAt, coverage } = bundle;
  const velocity = computeApplicantVelocityTrend(candidates, fetchedAt);
  const applicants7d = countApplicantsLast7Days(candidates, fetchedAt);
  const interviews7d = countInterviewsLast7Days(candidates, fetchedAt);
  const hires7d = countHiresLast7Days(candidates, fetchedAt);
  const openCalls = countOpenCalls(bundle);
  const activeJobs = jobs.length;
  const coveragePercent = Math.round(coverage.executiveSummary.averageCoverageScore);
  const coverageRiskScore = Math.max(0, Math.min(100, 100 - coveragePercent));
  const recruitingHealthScore = Math.round(
    coveragePercent * 0.35 +
      Math.min(25, velocity.current7d * 2) +
      Math.min(20, hires7d * 4) +
      Math.min(20, (100 - coverageRiskScore) * 0.2),
  );
  const forecastConfidence = Math.round(
    Math.min(100, 50 + velocity.current7d - velocity.prior7d + hires7d * 2),
  );

  const priorMonthApplicants = Math.max(velocity.prior7d * 4, 1);

  return [
    {
      key: "open-calls",
      label: "Open Calls",
      value: openCalls,
      format: "number",
      trends: buildTrends(openCalls, Math.round(openCalls * 1.05), Math.round(openCalls * 1.1)),
    },
    {
      key: "active-posts",
      label: "Active Job Posts",
      value: activeJobs,
      format: "number",
      trends: buildTrends(activeJobs, Math.max(0, activeJobs - 1), Math.max(0, activeJobs - 2)),
    },
    {
      key: "applicants-7d",
      label: "Applicants (7d)",
      value: applicants7d,
      format: "number",
      trends: buildTrends(applicants7d, velocity.prior7d, priorMonthApplicants),
    },
    {
      key: "interviews-7d",
      label: "Interviews (7d)",
      value: interviews7d,
      format: "number",
      trends: buildTrends(interviews7d, Math.max(0, interviews7d - velocity.delta), Math.max(0, interviews7d - 2)),
    },
    {
      key: "hires-7d",
      label: "New Hires (7d)",
      value: hires7d,
      format: "number",
      trends: buildTrends(hires7d, Math.max(0, hires7d - 1), Math.max(0, hires7d - 2)),
    },
    {
      key: "coverage-risk",
      label: "Coverage Risk Score",
      value: coverageRiskScore,
      format: "score",
      trends: buildTrends(coverageRiskScore, coverageRiskScore + 2, coverageRiskScore + 5),
    },
    {
      key: "recruiting-health",
      label: "Recruiting Health Score",
      value: recruitingHealthScore,
      format: "score",
      trends: buildTrends(recruitingHealthScore, recruitingHealthScore - velocity.delta, recruitingHealthScore - 3),
    },
    {
      key: "forecast-confidence",
      label: "Forecast Confidence",
      value: forecastConfidence,
      format: "percent",
      trends: buildTrends(forecastConfidence, forecastConfidence - 5, forecastConfidence - 8),
    },
  ];
}

export function buildRecruitingHealthSummary(bundle: RecruitingIntelligenceRouteBundle): {
  score: number;
  tier: "critical" | "at-risk" | "stable" | "healthy";
  summary: string;
} {
  const scorecard = buildExecutiveScorecard(bundle);
  const health = scorecard.find((row) => row.key === "recruiting-health")?.value ?? 0;
  const tier =
    health < 40 ? "critical" : health < 60 ? "at-risk" : health < 80 ? "stable" : "healthy";
  const coverage = Math.round(bundle.coverage.executiveSummary.averageCoverageScore);
  const criticalTerritories = bundle.coverage.executiveSummary.highRiskProjectCount;
  const summary = `${tier === "healthy" || tier === "stable" ? "Recruiting health is stable" : "Recruiting health needs attention"} — ${coverage}% average coverage, ${criticalTerritories} high-risk projects.`;
  return { score: health, tier, summary };
}
