import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import {
  candidatesForJob,
  isHiredStage,
  isInterviewingStage,
} from "@/lib/dm-dashboard/territory-shared";
import type { RecruitingIntelligenceRouteBundle } from "@/lib/recruiting-intelligence/load-recruiting-intelligence-route-bundle";
import type { OutcomeMetrics, RecommendationScope } from "@/lib/recommendation-intelligence/types";

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function matchesScope(
  row: { state?: string; dmName?: string; recruiter?: string; project?: string },
  scope: RecommendationScope,
): boolean {
  if (scope.entityId) {
    return false;
  }
  if (scope.dmName && normalize(row.dmName) !== normalize(scope.dmName)) return false;
  if (scope.territory && normalize(row.state) !== normalize(scope.territory)) return false;
  if (scope.recruiter && normalize(row.recruiter) !== normalize(scope.recruiter)) return false;
  if (scope.project && normalize(row.project) !== normalize(scope.project)) return false;
  return true;
}

function filterJobs(jobs: BreezyJob[], scope: RecommendationScope): BreezyJob[] {
  if (scope.entityType === "job-posting" && scope.entityId) {
    const jobId = scope.entityId.replace(/^job:/, "");
    return jobs.filter((job) => job.jobId === jobId);
  }
  return jobs.filter((job) => {
    if (scope.territory && normalize(job.state) !== normalize(scope.territory)) return false;
    if (scope.project && normalize(job.name) !== normalize(scope.project)) return false;
    return true;
  });
}

function filterCandidates(candidates: BreezyCandidate[], scope: RecommendationScope): BreezyCandidate[] {
  return candidates.filter((candidate) => {
    if (scope.territory && normalize(candidate.state) !== normalize(scope.territory)) return false;
    if (scope.project && normalize(candidate.positionName) !== normalize(scope.project)) return false;
    return true;
  });
}

function coverageForScope(bundle: RecruitingIntelligenceRouteBundle, scope: RecommendationScope): {
  coveragePercent: number;
  openCalls: number;
  projectCompletionPercent: number;
  riskScore: number;
} {
  const opportunities = bundle.coverage?.opportunities ?? [];
  const scoped = opportunities.filter((row) =>
    matchesScope(
      {
        state: row.state,
        dmName: row.territoryOwner,
        project: row.projectName,
      },
      scope,
    ),
  );
  const rows = scoped.length > 0 ? scoped : opportunities;
  if (rows.length === 0) {
    const summary = bundle.coverage?.executiveSummary;
    return {
      coveragePercent: summary?.averageCoverageScore ?? 0,
      openCalls: summary?.totalOpenOpportunities ?? 0,
      projectCompletionPercent: 0,
      riskScore: 50,
    };
  }

  let openCalls = 0;
  let coverageTotal = 0;
  let riskTotal = 0;
  for (const row of rows) {
    if (row.staffingRisk === "RED" || row.staffingRisk === "YELLOW") openCalls += 1;
    coverageTotal += row.coverageScore ?? 0;
    const risk =
      row.staffingRisk === "RED" ? 85 : row.staffingRisk === "YELLOW" ? 65 : Math.max(0, 100 - row.coverageScore);
    riskTotal += risk;
  }
  return {
    coveragePercent: Math.round(coverageTotal / rows.length),
    openCalls,
    projectCompletionPercent: Math.round(coverageTotal / rows.length),
    riskScore: Math.round(riskTotal / rows.length),
  };
}

export function extractOutcomeMetrics(
  bundle: RecruitingIntelligenceRouteBundle,
  scope: RecommendationScope,
): OutcomeMetrics {
  const jobs = filterJobs(bundle.jobs, scope);
  const candidates = filterCandidates(bundle.candidates, scope);
  const jobScopedCandidates =
    scope.entityType === "job-posting" && jobs.length === 1
      ? candidatesForJob(jobs[0]!, bundle.candidates)
      : candidates;

  const applicants = jobScopedCandidates.length;
  const interviews = jobScopedCandidates.filter((row) => isInterviewingStage(row.stage)).length;
  const offers = jobScopedCandidates.filter((row) => isHiredStage(row.stage)).length;
  const newHires = offers;

  const coverage = coverageForScope(bundle, scope);

  return {
    applicants,
    interviews,
    offers,
    newHires,
    coveragePercent: coverage.coveragePercent,
    openCalls: coverage.openCalls,
    riskScore: coverage.riskScore,
    projectCompletionPercent: coverage.projectCompletionPercent,
  };
}

export function diffOutcomeMetrics(after: OutcomeMetrics, before: OutcomeMetrics): OutcomeMetrics {
  return {
    applicants: after.applicants - before.applicants,
    interviews: after.interviews - before.interviews,
    offers: after.offers - before.offers,
    newHires: after.newHires - before.newHires,
    coveragePercent: after.coveragePercent - before.coveragePercent,
    openCalls: before.openCalls - after.openCalls,
    riskScore: before.riskScore - after.riskScore,
    projectCompletionPercent: after.projectCompletionPercent - before.projectCompletionPercent,
  };
}
