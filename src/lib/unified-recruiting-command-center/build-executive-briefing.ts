import type { ExecutiveAlert } from "@/lib/alerts/alert-types";
import type { DailyActionPlanSnapshot } from "@/lib/executive-daily-action-plan/types";
import type { PredictiveTerritoryRiskSnapshot } from "@/lib/predictive-territory-risk/types";
import type { RecruitingAutopilotSnapshot } from "@/lib/recruiting-autopilot/types";
import type {
  CommandCenterExecutiveBriefing,
  CommandCenterKpis,
} from "@/lib/unified-recruiting-command-center/types";

export function buildCommandCenterExecutiveBriefing(input: {
  kpis: CommandCenterKpis;
  riskSnapshot: PredictiveTerritoryRiskSnapshot;
  autopilot: RecruitingAutopilotSnapshot;
  dailyActionPlan: DailyActionPlanSnapshot;
  criticalAlerts: ExecutiveAlert[];
  referenceMs: number;
}): CommandCenterExecutiveBriefing {
  const { kpis, riskSnapshot, autopilot, dailyActionPlan, criticalAlerts } = input;

  const topRisks = [
    ...riskSnapshot.highestRiskTerritories.slice(0, 3).map(
      (row) => `${row.label} — risk ${row.riskScore} (${row.riskLevel})`,
    ),
    ...criticalAlerts.slice(0, 2).map((alert) => alert.title),
  ].slice(0, 5);

  const topOpportunities = autopilot.highestImpact
    .slice(0, 4)
    .map(
      (row) =>
        `${row.title} on ${row.entityLabel} (+${row.opportunity.estimatedCoverageGain}% coverage potential)`,
    );

  const territoriesNeedingAttention = riskSnapshot.highestRiskTerritories
    .slice(0, 5)
    .map((row) => `${row.dmName} · ${row.states.join(", ")} · ${row.riskLevel}`);

  const recommendedActions = [
    ...dailyActionPlan.topActionsToday.slice(0, 3).map((item) => item.title),
    ...autopilot.executiveSummary.topActionsToday.slice(0, 2).map((row) => row.title),
  ].slice(0, 5);

  const expectedOutcomes = [
    `Projected coverage gain +${dailyActionPlan.executiveSummary.projectedCoverageGain}% from today's plan`,
    `Estimated hires +${autopilot.executiveSummary.expectedAdditionalHires} if top recommendations execute`,
    `Risk reduction potential ${autopilot.executiveSummary.expectedRiskReduction} points across territories`,
    `${kpis.actionsDueToday} must-do actions queued for ${new Date(input.referenceMs).toLocaleDateString()}`,
  ];

  const headline =
    kpis.criticalTerritories > 0
      ? `${kpis.criticalTerritories} critical territories need leadership attention today`
      : "Recruiting operations are stable — focus on high-ROI recommendations";

  return {
    headline,
    topRisks,
    topOpportunities,
    territoriesNeedingAttention,
    recommendedActions,
    expectedOutcomes,
  };
}
