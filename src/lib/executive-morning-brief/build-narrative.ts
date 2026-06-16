import type { ExecutiveMorningBriefSnapshot } from "@/lib/executive-morning-brief/types";

export function buildExecutiveNarratives(snapshot: Pick<
  ExecutiveMorningBriefSnapshot,
  | "recruitingHealth"
  | "territoryRisks"
  | "dailyPriorities"
  | "recommendationIntelligence"
  | "automationOpportunities"
  | "coverageForecast"
>): ExecutiveMorningBriefSnapshot["narratives"] {
  const criticalTerritories = snapshot.territoryRisks.filter(
    (row) => row.riskLevel === "critical" || row.riskLevel === "high",
  );
  const territoryNames = criticalTerritories.slice(0, 3).map((row) => row.territoryLabel);
  const topRec = snapshot.recommendationIntelligence.topPerforming[0];
  const forecast14 = snapshot.coverageForecast.find((row) => row.horizon === "14d");
  const pendingAutomations = snapshot.automationOpportunities.pendingApprovals;

  const healthPhrase =
    snapshot.recruitingHealth.tier === "healthy" || snapshot.recruitingHealth.tier === "stable"
      ? "Recruiting health is stable today."
      : "Recruiting health requires leadership attention today.";

  const territoryPhrase =
    territoryNames.length > 0
      ? `${territoryNames.length} ${territoryNames.length === 1 ? "territory requires" : "territories require"} immediate attention${territoryNames.length > 0 ? `: ${territoryNames.join(", ")}` : ""}.`
      : "No critical territory escalations detected in the current snapshot.";

  const learningPhrase = topRec
    ? `${topRec.label} remains the highest-performing intervention with a ${topRec.successRate}% success rate.`
    : "Recommendation learning is still building baseline effectiveness scores.";

  const forecastPhrase = forecast14
    ? `Workforce forecasts indicate ${forecast14.expectedCoveragePercent}% expected coverage over the next 14 days.`
    : "Coverage forecasts are partial until the intelligence cache fully refreshes.";

  const automationPhrase =
    pendingAutomations > 0
      ? `${pendingAutomations} automation actions are awaiting approval.`
      : "No automation actions are pending approval.";

  const today = [
    healthPhrase,
    territoryPhrase,
    learningPhrase,
    forecastPhrase,
    automationPhrase,
  ].join(" ");

  const weekOutlook = [
    `This week: ${snapshot.dailyPriorities.length} prioritized actions are queued for execution.`,
    criticalTerritories.length > 0
      ? `Coverage risk is elevated in ${criticalTerritories.length} territories — focus DM escalation and posting refreshes.`
      : "Territory risk is within normal operating bounds.",
    snapshot.recommendationIntelligence.overallSuccessRate > 0
      ? `Recommendation success rate is ${snapshot.recommendationIntelligence.overallSuccessRate}% across tracked interventions.`
      : "Track recommendation executions to improve weekly learning.",
  ].join(" ");

  const outlook30 = [
    "30-day outlook:",
    forecast14
      ? `Projected coverage stabilizes near ${forecast14.expectedCoveragePercent}% if current actions execute.`
      : "Forecast confidence improves as more intelligence checkpoints are captured.",
    topRec ? `Continue prioritizing ${topRec.label.toLowerCase()} interventions.` : "Establish baseline recommendation tracking.",
    pendingAutomations > 0
      ? "Clear the automation approval queue to accelerate execution."
      : "Maintain approval-gated automation discipline.",
  ].join(" ");

  return { today, thisWeek: weekOutlook, outlook30Day: outlook30 };
}

export function buildEmailDigestDraft(
  snapshot: ExecutiveMorningBriefSnapshot,
  recipients: string[] = ["leadership@srs.com"],
): ExecutiveMorningBriefSnapshot["emailDigest"] {
  const topRisks = snapshot.territoryRisks.slice(0, 5).map(
    (row) => `${row.territoryLabel} (${row.riskLevel}) — ${row.coveragePercent}% coverage, ${row.openCalls} open calls`,
  );
  const topOpportunities = snapshot.recommendationIntelligence.topPerforming.slice(0, 3).map(
    (row) => `${row.label}: ${row.successRate}% success (${row.trackedCount} tracked)`,
  );
  const forecastLine = snapshot.coverageForecast
    .map((row) => `${row.horizon}: ${row.expectedCoveragePercent}% coverage`)
    .join(" · ");
  const actions = snapshot.dailyPriorities.slice(0, 5).map(
    (row) => `${row.rank}. ${row.title} — ${row.recommendedAction}`,
  );

  const bodyText = [
    snapshot.narratives.today,
    "",
    "Top Risks:",
    ...topRisks.map((line) => `- ${line}`),
    "",
    "Top Opportunities:",
    ...topOpportunities.map((line) => `- ${line}`),
    "",
    `Forecast: ${forecastLine}`,
    "",
    "Recommended Actions:",
    ...actions.map((line) => `- ${line}`),
  ].join("\n");

  return {
    subject: `SRS Executive Morning Brief — ${snapshot.planDate}`,
    generatedAt: snapshot.generatedAt,
    recipients,
    sections: {
      executiveSummary: snapshot.narratives.today,
      topRisks,
      topOpportunities,
      forecast: forecastLine,
      recommendedActions: actions,
    },
    bodyText,
  };
}
