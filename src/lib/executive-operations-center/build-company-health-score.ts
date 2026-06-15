import type { BreezyCandidate } from "@/lib/breezy-api";
import type { CoverageRiskSnapshot } from "@/lib/coverage-risk-engine";
import { computeApplicantVelocityTrend } from "@/lib/territory-intelligence/territory-intelligence-metrics";
import type { TerritoryIntelligenceCenterSnapshot } from "@/lib/territory-intelligence";
import type { RecruiterWorkloadRow } from "@/lib/territory-action-engine/types";
import type { ProjectRiskRow } from "@/lib/territory-action-engine/types";
import type { CompanyHealthScore, CompanyHealthTier } from "@/lib/executive-operations-center/types";

function tierFromScore(score: number): CompanyHealthTier {
  if (score < 40) return "critical";
  if (score < 60) return "at-risk";
  if (score < 80) return "stable";
  return "healthy";
}

export function buildCompanyHealthScore(input: {
  coverage: CoverageRiskSnapshot;
  territoryCenter: TerritoryIntelligenceCenterSnapshot;
  candidates: BreezyCandidate[];
  fetchedAt: string;
  recruiterWorkloads: RecruiterWorkloadRow[];
  projectRisks: ProjectRiskRow[];
  criticalActionCount: number;
}): CompanyHealthScore {
  const avgCoverage = input.coverage.executiveSummary.averageCoverageScore;
  const coverageComponent = Math.round(avgCoverage * 0.3);

  const velocity = computeApplicantVelocityTrend(input.candidates, input.fetchedAt);
  const applicantComponent = Math.min(
    25,
    Math.round((velocity.current7d / Math.max(1, velocity.prior7d + velocity.current7d)) * 25),
  );

  const openCalls = input.territoryCenter.territories.reduce(
    (sum, row) => sum + row.metrics.openCalls,
    0,
  );
  const staffedRatio =
    openCalls > 0
      ? 1 -
        input.coverage.executiveSummary.highRiskProjectCount / Math.max(1, openCalls)
      : 1;
  const openCallsComponent = Math.round(Math.max(0, Math.min(20, staffedRatio * 20)));

  const overloaded = input.recruiterWorkloads.filter(
    (row) => row.overloadLevel !== "balanced",
  ).length;
  const workloadPenalty = Math.min(15, overloaded * 3);
  const workloadComponent = 15 - workloadPenalty;

  const criticalProjects = input.projectRisks.filter((row) => row.riskLevel === "critical").length;
  const projectComponent = Math.max(0, 10 - criticalProjects * 2);

  const actionPenalty = Math.min(10, input.criticalActionCount);
  const actionComponent = 10 - actionPenalty;

  const score = Math.max(
    0,
    Math.min(
      100,
      coverageComponent +
        applicantComponent +
        openCallsComponent +
        workloadComponent +
        projectComponent +
        actionComponent,
    ),
  );

  const drivers: string[] = [];
  if (avgCoverage < 55) drivers.push(`Coverage averaging ${Math.round(avgCoverage)}%`);
  if (velocity.direction === "down") drivers.push("Applicant velocity declining");
  if (input.coverage.executiveSummary.highRiskProjectCount > 0) {
    drivers.push(`${input.coverage.executiveSummary.highRiskProjectCount} high-risk projects`);
  }
  if (overloaded > 0) drivers.push(`${overloaded} recruiters overloaded`);
  if (input.criticalActionCount > 0) {
    drivers.push(`${input.criticalActionCount} critical leadership actions`);
  }
  if (drivers.length === 0) drivers.push("Operations within healthy thresholds");

  const trend: CompanyHealthScore["trend"] =
    velocity.direction === "up" ? "up" : velocity.direction === "down" ? "down" : "flat";

  return {
    score,
    tier: tierFromScore(score),
    trend,
    drivers,
  };
}
