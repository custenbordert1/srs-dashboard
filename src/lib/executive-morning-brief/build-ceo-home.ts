import type {
  CeoHomeSnapshot,
  CeoRecommendedAction,
  CeoRiskItem,
  ExecutiveMorningBriefSnapshot,
  TrafficLight,
} from "@/lib/executive-morning-brief/types";

function lightFromScore(score: number, greenMin: number, yellowMin: number): TrafficLight {
  if (score >= greenMin) return "green";
  if (score >= yellowMin) return "yellow";
  return "red";
}

function lightFromTier(tier: ExecutiveMorningBriefSnapshot["recruitingHealth"]["tier"]): TrafficLight {
  if (tier === "healthy") return "green";
  if (tier === "stable") return "yellow";
  return "red";
}

function buildCeoNarrative(snapshot: ExecutiveMorningBriefSnapshot): string {
  const coverageRiskMetric = snapshot.scorecard.find((row) => row.key === "coverage-risk");
  const avgCoverage = coverageRiskMetric ? Math.max(0, 100 - coverageRiskMetric.value) : 0;
  const weekTrend = coverageRiskMetric?.trends.vsLastWeek.label ?? "0";
  const criticalNames = snapshot.territoryRisks
    .filter((row) => row.riskLevel === "critical" || row.riskLevel === "high")
    .slice(0, 2)
    .map((row) => row.territoryLabel.split(",")[0]?.trim() ?? row.territoryLabel);
  const topOpp = snapshot.recommendationIntelligence.topPerforming[0];
  const pending = snapshot.automationOpportunities.pendingApprovals;

  const healthLead =
    snapshot.recruitingHealth.tier === "healthy" || snapshot.recruitingHealth.tier === "stable"
      ? "Recruiting health is stable."
      : "Recruiting health needs leadership attention.";

  const coverageLead =
    weekTrend.startsWith("+")
      ? `Coverage improved ${weekTrend.replace("+", "")} week-over-week (${Math.round(avgCoverage)}% average).`
      : `Coverage is at ${Math.round(avgCoverage)}% with ${weekTrend} week-over-week movement.`;

  const territoryLead =
    criticalNames.length > 0
      ? `${criticalNames.join(" and ")} remain high-risk.`
      : "No territories are flagged critical right now.";

  const roiLead = topOpp
    ? `${topOpp.label} remains the highest ROI action at ${topOpp.successRate}% success.`
    : "Recommendation ROI tracking is still building baseline scores.";

  const automationLead =
    pending > 0
      ? `${pending} automation draft${pending === 1 ? "" : "s"} ${pending === 1 ? "is" : "are"} awaiting approval.`
      : "Automation queue is clear — no approvals pending.";

  return [healthLead, coverageLead, territoryLead, roiLead, automationLead].join(" ");
}

export function buildCeoHomeSnapshot(snapshot: ExecutiveMorningBriefSnapshot): CeoHomeSnapshot {
  const coverageRisk = snapshot.scorecard.find((row) => row.key === "coverage-risk");
  const coverageScore = coverageRisk ? Math.max(0, 100 - coverageRisk.value) : 0;
  const coverageTrend = coverageRisk?.trends.vsLastWeek.label ?? "0";
  const forecast14 = snapshot.coverageForecast.find((row) => row.horizon === "14d");
  const criticalTerritories = snapshot.territoryRisks
    .filter((row) => row.riskLevel === "critical" || row.riskLevel === "high")
    .slice(0, 5);
  const topPriorities = snapshot.dailyPriorities.slice(0, 5);
  const topOpportunities = snapshot.recommendationIntelligence.topPerforming.slice(0, 5);

  const topRisks: CeoRiskItem[] = snapshot.territoryRisks.slice(0, 5).map((row) => ({
    title: row.territoryLabel,
    detail: `${row.riskLevel} risk · ${row.coveragePercent}% coverage · ${row.openCalls} open calls`,
    territory: row.territoryLabel,
    light:
      row.riskLevel === "critical" ? "red" : row.riskLevel === "high" ? "red" : row.riskLevel === "moderate" ? "yellow" : "green",
  }));

  const draftCount =
    snapshot.automationOpportunities.jobRefreshDrafts +
    snapshot.automationOpportunities.postingDrafts +
    snapshot.automationOpportunities.followUpCampaigns;
  const pendingApprovals = snapshot.automationOpportunities.pendingApprovals;

  const recommendedActions: CeoRecommendedAction[] = topPriorities.map((row) => ({
    id: row.sourceId,
    title: row.title,
    expectedImpact: row.expectedResult,
    owner: row.owner,
    dueDate: row.dueDate,
    impactScore: row.impactScore,
    navigationTabId: row.navigationTabId,
    navigationElementId: row.navigationElementId,
  }));

  const healthLight = lightFromTier(snapshot.recruitingHealth.tier);
  const coverageLight = lightFromScore(coverageScore, 70, 50);
  const forecastLight: TrafficLight = forecast14
    ? forecast14.riskTrend === "improving"
      ? "green"
      : forecast14.riskTrend === "declining"
        ? "red"
        : "yellow"
    : "yellow";
  const automationLight: TrafficLight =
    pendingApprovals >= 5 ? "red" : pendingApprovals > 0 ? "yellow" : draftCount > 0 ? "yellow" : "green";

  const lights = [healthLight, coverageLight, forecastLight, automationLight];
  const onTrack: TrafficLight = lights.includes("red") ? "red" : lights.includes("yellow") ? "yellow" : "green";

  return {
    narrative: buildCeoNarrative(snapshot),
    onTrack,
    recruitingHealth: {
      score: snapshot.recruitingHealth.score,
      light: healthLight,
      label: snapshot.recruitingHealth.tier,
    },
    coverage: {
      score: Math.round(coverageScore),
      light: coverageLight,
      trendLabel: `${coverageTrend} vs last week`,
    },
    hiringForecast: {
      summary: forecast14
        ? `${forecast14.expectedCoveragePercent}% coverage · ${forecast14.expectedFilledCalls} fills projected (14d)`
        : "14-day hiring forecast loading from cache",
      light: forecastLight,
      horizon14Coverage: forecast14?.expectedCoveragePercent ?? null,
    },
    criticalTerritories,
    topPriorities,
    topRisks,
    topOpportunities,
    automationQueue: {
      pendingApprovals,
      draftCount,
      summary:
        pendingApprovals > 0
          ? `${pendingApprovals} awaiting approval · ${draftCount} drafts ready`
          : `${draftCount} automation drafts ready for review`,
      light: automationLight,
    },
    recommendedActions,
    roiSummary: snapshot.recommendationIntelligence.roiSummary,
  };
}
