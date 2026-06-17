import type { ExecutiveRecruitingForecastSnapshot } from "@/lib/executive-recruiting-forecast";
import { forecastConfidenceLabel } from "@/lib/executive-recruiting-forecast";
import type {
  ExecutiveActionStatusSummary,
  ExecutiveTrackedAction,
  ForecastHistoryEntry,
  WeeklyExecutiveNarrative,
} from "@/lib/executive-accountability/types";
import { formatTrustAndConfidenceLabels } from "@/lib/executive-accountability/forecast-backtest";

export function buildWeeklyExecutiveNarrative(input: {
  forecast: ExecutiveRecruitingForecastSnapshot;
  previousHistory: ForecastHistoryEntry | null;
  statusSummary: ExecutiveActionStatusSummary;
  overdueActions: ExecutiveTrackedAction[];
  completedSinceLast: ExecutiveTrackedAction[];
  generatedAt: string;
}): WeeklyExecutiveNarrative {
  const trustLabels = formatTrustAndConfidenceLabels(input.forecast);
  const whatChanged: string[] = [];
  const prev = input.previousHistory;

  if (!prev) {
    whatChanged.push("First accountability snapshot captured — baseline established for weekly comparisons.");
  } else {
    const hireDelta =
      Math.round((input.forecast.kpis.projectedHires30 - prev.projectedHires30) * 10) / 10;
    if (hireDelta !== 0) {
      whatChanged.push(
        `30-day hire projection moved from ${prev.projectedHires30} to ${input.forecast.kpis.projectedHires30} (${hireDelta > 0 ? "+" : ""}${hireDelta}).`,
      );
    } else {
      whatChanged.push("30-day hire projection unchanged since last snapshot.");
    }

    const riskDelta = input.forecast.kpis.territoriesAtRisk - prev.territoriesAtRisk;
    if (riskDelta !== 0) {
      whatChanged.push(
        `Territories at risk count shifted by ${riskDelta > 0 ? "+" : ""}${riskDelta}.`,
      );
    }

    if (prev.dataTrust !== input.forecast.dataTrust) {
      whatChanged.push(
        `Data trust moved from ${prev.dataTrust} to ${input.forecast.dataTrust}.`,
      );
    }
    if (prev.forecastConfidence !== input.forecast.forecastConfidence) {
      whatChanged.push(
        `Forecast confidence moved from ${forecastConfidenceLabel(prev.forecastConfidence)} to ${forecastConfidenceLabel(input.forecast.forecastConfidence)}.`,
      );
    }
  }

  if (input.statusSummary.completed > 0) {
    whatChanged.push(`${input.statusSummary.completed} executive action(s) marked completed.`);
  }
  if (input.statusSummary.overdue > 0) {
    whatChanged.push(`${input.statusSummary.overdue} action(s) are overdue.`);
  }
  if (input.statusSummary.archived > 0) {
    whatChanged.push(`${input.statusSummary.archived} archived action(s) on record.`);
  }

  const topRisk = input.forecast.executiveSummary.topRiskTerritory;
  const topRiskThisWeek = topRisk
    ? `${topRisk.dmName} (${topRisk.territoryLabel}) — ${input.forecast.kpis.territoriesAtRisk} territories at risk nationwide`
    : "No elevated territory risk flagged this week.";

  const topRec = input.forecast.executiveSummary.topRecommendation;
  const topActionRequired = topRec
    ? `${topRec.title} (${topRec.priority} priority)`
    : "No urgent executive action — monitor capacity weekly.";

  const ownersWithOverdueItems = [
    ...new Set(
      input.overdueActions.map((row) => row.owner?.trim() || "Unassigned"),
    ),
  ];

  const completedActions =
    input.completedSinceLast.length > 0
      ? input.completedSinceLast.map((row) => row.title)
      : input.statusSummary.completed > 0
        ? ["See accountability board for completed actions."]
        : ["No completed actions this period."];

  const headline = [
    topActionRequired,
    input.statusSummary.overdue > 0
      ? `${input.statusSummary.overdue} overdue`
      : "On track for due dates",
    `Forecast confidence: ${trustLabels.forecastConfidenceLabel}`,
  ].join(" · ");

  return {
    headline,
    whatChanged: whatChanged.length > 0 ? whatChanged : ["No material forecast shifts since last snapshot."],
    topRiskThisWeek,
    topActionRequired,
    ownersWithOverdueItems,
    completedActions,
    dataTrustLabel: trustLabels.dataTrustLabel,
    forecastConfidenceLabel: trustLabels.forecastConfidenceLabel,
    generatedAt: input.generatedAt,
  };
}
