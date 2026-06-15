import type { ProductionReadinessSnapshot } from "@/lib/production-readiness/types";

export type ProductionScorecardDimension =
  | "reliability"
  | "performance"
  | "coverage"
  | "data-quality"
  | "user-readiness";

export type ProductionScorecardRow = {
  id: ProductionScorecardDimension;
  label: string;
  score: number;
  tier: "critical" | "at-risk" | "stable" | "healthy";
  summary: string;
};

export type ProductionScorecard = {
  overallScore: number;
  overallTier: ProductionScorecardRow["tier"];
  dimensions: ProductionScorecardRow[];
  generatedAt: string;
};

function tierFromScore(score: number): ProductionScorecardRow["tier"] {
  if (score < 50) return "critical";
  if (score < 70) return "at-risk";
  if (score < 85) return "stable";
  return "healthy";
}

export function buildProductionScorecard(snapshot: ProductionReadinessSnapshot): ProductionScorecard {
  const deploymentPassRate =
    snapshot.deploymentChecklist.filter((row) => row.passed).length /
    Math.max(1, snapshot.deploymentChecklist.length);
  const integrationPassRate =
    snapshot.integrationStatus.filter((row) => row.status === "healthy").length /
    Math.max(1, snapshot.integrationStatus.length);
  const reliability = Math.round((deploymentPassRate * 0.5 + integrationPassRate * 0.5) * 100);

  const performance = Math.round(
    snapshot.performance.serverCacheHitRate * 0.6 +
      (snapshot.performance.backgroundRefreshEnabled ? 25 : 0) +
      (snapshot.errorHealth.retryFrameworkEnabled ? 15 : 0),
  );

  const criticalQuality = snapshot.dataQuality.filter((row) => row.severity === "critical").length;
  const coverage = Math.max(0, 100 - criticalQuality * 15 - snapshot.errorHealth.recentApiFailures * 5);

  const warningQuality = snapshot.dataQuality.length;
  const dataQuality = Math.max(0, 100 - warningQuality * 8);

  const activeUsers = snapshot.users.filter((user) => user.active).length;
  const userReadiness = Math.min(
    100,
    Math.round(
      (activeUsers > 0 ? 40 : 10) +
        (snapshot.demoMode.enabled ? 15 : 25) +
        (snapshot.startupDiagnostics.envOk ? 20 : 0) +
        (snapshot.startupDiagnostics.authConfigured ? 15 : 0),
    ),
  );

  const dimensions: ProductionScorecardRow[] = [
    {
      id: "reliability",
      label: "Reliability",
      score: reliability,
      tier: tierFromScore(reliability),
      summary: `${Math.round(deploymentPassRate * 100)}% deployment checks · ${Math.round(integrationPassRate * 100)}% integrations healthy`,
    },
    {
      id: "performance",
      label: "Performance",
      score: performance,
      tier: tierFromScore(performance),
      summary: `${snapshot.performance.serverCacheHitRate}% server cache hit · ${snapshot.performance.lazyLoadedTabs} lazy tabs`,
    },
    {
      id: "coverage",
      label: "Coverage",
      score: coverage,
      tier: tierFromScore(coverage),
      summary: `${snapshot.errorHealth.recentApiFailures} recent sync failures tracked`,
    },
    {
      id: "data-quality",
      label: "Data Quality",
      score: dataQuality,
      tier: tierFromScore(dataQuality),
      summary: `${snapshot.dataQuality.length} open data quality signals`,
    },
    {
      id: "user-readiness",
      label: "User Readiness",
      score: userReadiness,
      tier: tierFromScore(userReadiness),
      summary: `${activeUsers} active users · auth ${snapshot.startupDiagnostics.authConfigured ? "ready" : "check"}`,
    },
  ];

  const overallScore = Math.round(
    dimensions.reduce((sum, row) => sum + row.score, 0) / dimensions.length,
  );

  return {
    overallScore,
    overallTier: tierFromScore(overallScore),
    dimensions,
    generatedAt: snapshot.fetchedAt,
  };
}
