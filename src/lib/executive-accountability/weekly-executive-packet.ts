import type { ExecutiveRecruitingForecastSnapshot, RecommendationPriority } from "@/lib/executive-recruiting-forecast";
import type { ForecastChangesSummary } from "@/lib/executive-accountability/forecast-changes";
import { detectForecastChanges } from "@/lib/executive-accountability/forecast-changes";
import type {
  ExecutiveTrackedAction,
  ForecastHistoryEntry,
} from "@/lib/executive-accountability/types";
import { startOfUtcWeek } from "@/lib/executive-accountability/weekly-summary";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const PRIORITIES: RecommendationPriority[] = ["critical", "high", "medium", "low"];

export type ExecutivePacketNarrative = {
  summaryParagraph: string;
  improved: string[];
  worsened: string[];
  biggestRisks: string[];
  immediateLeadershipActions: string[];
};

export type ExecutiveWeeklyPacket = {
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  narrative: ExecutivePacketNarrative;
  openActionsByPriority: Record<RecommendationPriority, ExecutiveTrackedAction[]>;
  overdueByOwner: Record<string, ExecutiveTrackedAction[]>;
  completedThisWeekByOwner: Record<string, ExecutiveTrackedAction[]>;
  newlyOpened: ExecutiveTrackedAction[];
  topRisks: string[];
  forecastChanges: ForecastChangesSummary;
  recommendations: ExecutiveRecruitingForecastSnapshot["recommendations"];
};

function groupByOwner(actions: ExecutiveTrackedAction[]): Record<string, ExecutiveTrackedAction[]> {
  const groups: Record<string, ExecutiveTrackedAction[]> = {};
  for (const action of actions) {
    const owner = action.owner?.trim() || "Unassigned";
    const bucket = groups[owner] ?? [];
    bucket.push(action);
    groups[owner] = bucket;
  }
  for (const owner of Object.keys(groups)) {
    groups[owner]!.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  }
  return groups;
}

function inWeek(iso: string | null | undefined, periodStartMs: number, periodEndMs: number): boolean {
  if (!iso) return false;
  const ms = new Date(iso).getTime();
  return !Number.isNaN(ms) && ms >= periodStartMs && ms < periodEndMs;
}

export function buildExecutiveWeeklyPacket(input: {
  forecast: ExecutiveRecruitingForecastSnapshot;
  actions: ExecutiveTrackedAction[];
  overdueActions: ExecutiveTrackedAction[];
  previousHistory: ForecastHistoryEntry | null;
  generatedAt?: string;
}): ExecutiveWeeklyPacket {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const referenceMs = new Date(generatedAt).getTime();
  const periodStartMs = startOfUtcWeek(referenceMs);
  const periodEndMs = periodStartMs + 7 * MS_PER_DAY;

  const active = input.actions.filter(
    (row) => row.status === "open" || row.status === "in_progress",
  );

  const openActionsByPriority = Object.fromEntries(
    PRIORITIES.map((priority) => [
      priority,
      active
        .filter((row) => row.priority === priority)
        .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()),
    ]),
  ) as Record<RecommendationPriority, ExecutiveTrackedAction[]>;

  const completedThisWeek = input.actions.filter(
    (row) => row.status === "completed" && inWeek(row.completedAt, periodStartMs, periodEndMs),
  );

  const newlyOpened = input.actions
    .filter((row) => inWeek(row.createdAt, periodStartMs, periodEndMs))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const forecastChanges = detectForecastChanges({
    forecast: input.forecast,
    previousHistory: input.previousHistory,
  });

  const topRisks: string[] = [];
  if (input.forecast.executiveSummary.topRiskTerritory) {
    const t = input.forecast.executiveSummary.topRiskTerritory;
    topRisks.push(`${t.dmName} (${t.territoryLabel}) — top territory risk`);
  }
  topRisks.push(`${input.forecast.kpis.territoriesAtRisk} territories at risk`);
  topRisks.push(`${input.forecast.kpis.overloadedRecruiters} overloaded recruiters`);
  if (input.forecast.kpis.projectsAtRisk > 0) {
    topRisks.push(`${input.forecast.kpis.projectsAtRisk} projects at completion risk`);
  }

  const immediateLeadershipActions = input.forecast.recommendations
    .filter((row) => row.priority === "critical" || row.priority === "high")
    .slice(0, 5)
    .map((row) => row.title);

  const biggestRisks = [
    input.forecast.executiveSummary.topRecommendation?.title ??
      "No single top recommendation — monitor capacity",
    ...topRisks.slice(0, 3),
  ];

  const improved = [...forecastChanges.improved];
  if (completedThisWeek.length > 0) {
    improved.push(`${completedThisWeek.length} executive action(s) completed this week.`);
  }
  if (input.overdueActions.length === 0) {
    improved.push("No overdue executive actions at packet generation time.");
  }

  const worsened = [...forecastChanges.worsened];
  if (input.overdueActions.length > 0) {
    worsened.push(`${input.overdueActions.length} executive action(s) overdue.`);
  }

  const summaryParagraph = [
    input.forecast.executiveSummary.topRecommendation?.title
      ? `Top action: ${input.forecast.executiveSummary.topRecommendation.title}.`
      : "No urgent forecast recommendation.",
    `${active.length} open actions, ${input.overdueActions.length} overdue, ${completedThisWeek.length} completed this week.`,
    forecastChanges.hasPriorSnapshot
      ? "Forecast metrics compared to prior accountability snapshot."
      : "First weekly packet — forecast trend baseline established.",
  ].join(" ");

  return {
    periodStart: new Date(periodStartMs).toISOString(),
    periodEnd: new Date(periodEndMs).toISOString(),
    generatedAt,
    narrative: {
      summaryParagraph,
      improved,
      worsened,
      biggestRisks,
      immediateLeadershipActions,
    },
    openActionsByPriority,
    overdueByOwner: groupByOwner(input.overdueActions),
    completedThisWeekByOwner: groupByOwner(completedThisWeek),
    newlyOpened,
    topRisks,
    forecastChanges,
    recommendations: input.forecast.recommendations,
  };
}
