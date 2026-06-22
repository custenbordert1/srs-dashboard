import type { CandidateWorkflowState } from "@/lib/candidate-workflow-types";
import type { ExecutiveRecruitingForecastSnapshot } from "@/lib/executive-recruiting-forecast";
import { auditEntriesByActionId, appendAuditEntry } from "@/lib/executive-accountability/action-audit";
import {
  detectOverdueActions,
  detectStaleActions,
  getActiveActions,
  groupActionsByOwner,
  summarizeActionStatus,
} from "@/lib/executive-accountability/accountability-engine";
import {
  syncActionsFromForecastRecommendations,
  syncActionsFromPipelineRecommendations,
} from "@/lib/executive-accountability/convert-recommendations";
import type { PipelineBottleneckRecommendation } from "@/lib/pipeline-intelligence/types";
import {
  appendForecastHistory,
  buildForecastBacktestSummary,
  captureForecastHistoryEntry,
  countActiveReps,
} from "@/lib/executive-accountability/forecast-backtest";
import type { ExecutiveAccountabilityStoreFile } from "@/lib/executive-accountability/recommendation-store";
import type { ExecutiveAccountabilitySnapshot } from "@/lib/executive-accountability/types";
import { buildAuditCenterRows } from "@/lib/executive-accountability/audit-center";
import { formatExecutiveEmailMarkdown } from "@/lib/executive-accountability/executive-email-export";
import { buildOverdueEscalationDashboard } from "@/lib/executive-accountability/overdue-escalation";
import { buildExecutiveWeeklyPacket } from "@/lib/executive-accountability/weekly-executive-packet";
import { buildWeeklyExecutiveNarrative } from "@/lib/executive-accountability/weekly-narrative";
import { buildExecutiveWeeklySummary } from "@/lib/executive-accountability/weekly-summary";

export function buildExecutiveAccountabilitySnapshot(input: {
  forecast: ExecutiveRecruitingForecastSnapshot;
  workflows: CandidateWorkflowState;
  store: ExecutiveAccountabilityStoreFile;
  pipelineRecommendations?: PipelineBottleneckRecommendation[];
  generatedAt?: string;
}): { snapshot: ExecutiveAccountabilitySnapshot; store: ExecutiveAccountabilityStoreFile } {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const referenceMs = new Date(generatedAt).getTime();
  const activeRepCount = countActiveReps(input.workflows);

  const forecastSynced = syncActionsFromForecastRecommendations({
    existingActions: input.store.actions,
    recommendations: input.forecast.recommendations,
    referenceIso: generatedAt,
  });
  const syncedActions = syncActionsFromPipelineRecommendations({
    existingActions: forecastSynced,
    recommendations: input.pipelineRecommendations ?? [],
    referenceIso: generatedAt,
  });

  let auditLog = input.store.auditLog;
  const priorById = new Map(input.store.actions.map((row) => [row.recommendationId, row]));
  for (const action of syncedActions) {
    const prior = priorById.get(action.recommendationId);
    if (prior && prior.status !== "archived" && action.status === "archived") {
      auditLog = appendAuditEntry(auditLog, {
        recommendationId: action.recommendationId,
        changedBy: "system:forecast-sync",
        field: "status",
        oldValue: prior.status,
        newValue: "archived",
        changedAt: generatedAt,
      });
    }
  }

  const historyEntry = captureForecastHistoryEntry({
    forecast: input.forecast,
    activeRepCount,
    capturedAt: generatedAt,
  });
  const previousHistory =
    input.store.forecastHistory.length > 0
      ? input.store.forecastHistory[input.store.forecastHistory.length - 1]!
      : null;
  const forecastHistory = appendForecastHistory(input.store.forecastHistory, historyEntry);

  const statusSummary = summarizeActionStatus(syncedActions, referenceMs);
  const activeActions = getActiveActions(syncedActions);
  const overdueActions = detectOverdueActions(syncedActions, referenceMs);
  const staleActions = detectStaleActions(syncedActions, referenceMs);
  const ownerGroups = groupActionsByOwner(syncedActions);
  const forecastBacktest = buildForecastBacktestSummary({
    history: forecastHistory,
    currentActiveRepCount: activeRepCount,
    referenceMs,
  });

  const completedSinceLast = syncedActions.filter(
    (row) =>
      row.status === "completed" &&
      row.completedAt &&
      (!previousHistory ||
        new Date(row.completedAt).getTime() > new Date(previousHistory.capturedAt).getTime()),
  );

  const weeklyNarrative = buildWeeklyExecutiveNarrative({
    forecast: input.forecast,
    previousHistory,
    statusSummary,
    overdueActions,
    completedSinceLast,
    generatedAt,
  });

  const weeklySummary = buildExecutiveWeeklySummary({
    actions: syncedActions,
    overdueCount: statusSummary.overdue,
    referenceMs,
  });

  const priorForPacket =
    forecastHistory.length > 1
      ? forecastHistory[forecastHistory.length - 2]!
      : null;

  const weeklyPacket = buildExecutiveWeeklyPacket({
    forecast: input.forecast,
    actions: syncedActions,
    overdueActions,
    previousHistory: priorForPacket,
    generatedAt,
  });

  const overdueEscalation = buildOverdueEscalationDashboard({
    overdueActions,
    referenceMs,
  });

  const auditCenter = buildAuditCenterRows({
    auditLog,
    actions: syncedActions,
  });

  const emailMarkdown = formatExecutiveEmailMarkdown(weeklyPacket);

  const updatedStore: ExecutiveAccountabilityStoreFile = {
    actions: syncedActions,
    forecastHistory,
    auditLog,
    updatedAt: generatedAt,
  };

  return {
    snapshot: {
      generatedAt,
      forecast: input.forecast,
      actions: syncedActions,
      activeActions,
      statusSummary,
      overdueActions,
      staleActions,
      ownerGroups,
      weeklyNarrative,
      weeklySummary,
      forecastBacktest,
      auditByActionId: auditEntriesByActionId(auditLog),
      operatingRhythm: {
        weeklyPacket,
        overdueEscalation,
        auditCenter,
        emailMarkdown,
      },
    },
    store: updatedStore,
  };
}
