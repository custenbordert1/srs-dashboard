import type { CommandCenterDmInsightsSnapshot } from "@/lib/command-center-dm-insights";
import type { NotificationRecord } from "@/lib/notification-engine";
import type { CoverageOptimizationSnapshot } from "@/lib/coverage-optimization";
import type { CommandCenterSnapshot } from "@/lib/recruiting-command-center";
import type { DailyExecutiveSnapshot } from "@/lib/recruiting-automation/daily-executive-snapshot";
import type { ExecutiveBriefing } from "@/lib/ai-recruiting-command-center/types";

export function buildDailyExecutiveBriefing(input: {
  fetchedAt: string;
  commandCenter: CommandCenterSnapshot;
  dmInsights: CommandCenterDmInsightsSnapshot;
  dailyExecutive: DailyExecutiveSnapshot;
  criticalNotifications: NotificationRecord[];
  coverageOptimization: CoverageOptimizationSnapshot | null;
}): ExecutiveBriefing {
  const { dmInsights, dailyExecutive, criticalNotifications, coverageOptimization } = input;
  const health = dmInsights.recruitingHealth;

  const topRisks: string[] = [];
  for (const alert of [
    ...dmInsights.riskAlerts.criticalShortages,
    ...dmInsights.riskAlerts.unstaffedHighPriority,
  ].slice(0, 4)) {
    topRisks.push(`${alert.title}: ${alert.detail}`);
  }
  for (const territory of dmInsights.topTerritoriesNeedingAttention.slice(0, 3)) {
    topRisks.push(
      `${territory.dmName} needs attention — ${territory.coveragePercent}% coverage, ${territory.openCalls} open calls`,
    );
  }
  if (topRisks.length === 0) {
    topRisks.push("No critical territory risks detected in the current snapshot.");
  }

  const topWins: string[] = [];
  const hired = input.commandCenter.funnel.find((row) => row.label === "Hired")?.value ?? 0;
  if (hired > 0) topWins.push(`${hired} hires in the current funnel snapshot.`);
  if (health.hired > 0) {
    topWins.push(`${health.hired} hires in current pipeline metrics.`);
  }
  for (const win of dailyExecutive.hottestTerritories.slice(0, 3)) {
    if (win.value > 0) topWins.push(`${win.label}: ${win.value} applicants this week.`);
  }
  if (topWins.length === 0) topWins.push("Pipeline activity is steady — monitor conversion to build wins.");

  const hiringTrends: string[] = [
    `${input.commandCenter.applicantsLast7Days} applicants in the last 7 days.`,
    `${health.paperworkSent} paperwork sent · ${health.readyForMel} ready for MEL.`,
    `${health.hired} hires in current pipeline metrics.`,
  ];

  const coverageChanges: string[] = [];
  if (coverageOptimization) {
    coverageChanges.push(
      `Average fill probability: ${coverageOptimization.executive.averageFillProbability}%.`,
    );
    if (coverageOptimization.executive.territoriesWithNoViableReps.length > 0) {
      coverageChanges.push(
        `${coverageOptimization.executive.territoriesWithNoViableReps.length} territories lack viable reps for open calls.`,
      );
    }
    const topCost = coverageOptimization.executive.highestCostTerritories[0];
    if (topCost) {
      coverageChanges.push(
        `Highest travel cost territory: ${topCost.territory} (~$${topCost.estimatedCostUsd}).`,
      );
    }
  } else {
    coverageChanges.push("MEL coverage data unavailable — coverage optimization insights are partial.");
  }
  for (const row of dailyExecutive.highestRiskTerritories.slice(0, 3)) {
    coverageChanges.push(`${row.label}: risk score ${row.value}.`);
  }

  const criticalAlerts = criticalNotifications.slice(0, 5).map((row) => `${row.title}: ${row.message}`);

  const summary = [
    topRisks[0],
    hiringTrends[0],
    criticalAlerts[0] ?? coverageChanges[0] ?? topWins[0],
  ]
    .filter(Boolean)
    .join(" ");

  return {
    generatedAt: input.fetchedAt,
    topRisks: { title: "Top risks", items: topRisks },
    topWins: { title: "Top wins", items: topWins },
    hiringTrends: { title: "Hiring trends", items: hiringTrends },
    coverageChanges: { title: "Coverage changes", items: coverageChanges },
    criticalAlerts: {
      title: "Critical alerts",
      items: criticalAlerts.length > 0 ? criticalAlerts : ["No critical notifications active."],
    },
    summary,
  };
}
