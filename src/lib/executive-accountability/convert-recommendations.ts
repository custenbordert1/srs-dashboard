import type { ExecutiveForecastRecommendation, RecommendationPriority } from "@/lib/executive-recruiting-forecast";
import { createActionId } from "@/lib/executive-accountability/recommendation-store";
import {
  buildStableRecommendationKey,
  buildStableRecommendationKeyFromRecommendation,
  resolveActionForecastKey,
} from "@/lib/executive-accountability/stable-recommendation-key";
import type { ExecutiveTrackedAction } from "@/lib/executive-accountability/types";
import type { PipelineBottleneckRecommendation } from "@/lib/pipeline-intelligence/types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const P44_SOURCE_PHASE = "P44";
export const P44_SOURCE_MODULE = "executive-recruiting-forecast";
export const P51_SOURCE_PHASE = "P51";
export const P51_SOURCE_MODULE = "pipeline-intelligence";
export const ARCHIVE_REASON_FORECAST_CHURN = "forecast_recommendation_churned";
export const ARCHIVE_REASON_PIPELINE_CHURN = "pipeline_bottleneck_cleared";

export function dueDateForPriority(priority: RecommendationPriority, referenceMs: number): string {
  const days =
    priority === "critical" ? 3 : priority === "high" ? 7 : priority === "medium" ? 14 : 21;
  return new Date(referenceMs + days * MS_PER_DAY).toISOString();
}

export function convertForecastRecommendationToAction(
  rec: ExecutiveForecastRecommendation,
  referenceIso: string,
): ExecutiveTrackedAction {
  const referenceMs = new Date(referenceIso).getTime();
  const now = Number.isNaN(referenceMs) ? new Date().toISOString() : referenceIso;
  return {
    recommendationId: createActionId(),
    sourcePhase: P44_SOURCE_PHASE,
    sourceModule: P44_SOURCE_MODULE,
    sourceForecastKey: buildStableRecommendationKeyFromRecommendation(rec),
    recommendationKind: rec.kind,
    territoryLabel: rec.territoryLabel,
    title: rec.title,
    priority: rec.priority,
    owner: rec.owner,
    ownerManuallyAssigned: false,
    dueDate: dueDateForPriority(rec.priority, Number.isNaN(referenceMs) ? Date.now() : referenceMs),
    dueDateManuallySet: false,
    status: "open",
    expectedImpact: rec.expectedImpact,
    outcomeNotes: null,
    actualOutcome: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    archivedAt: null,
    archivedReason: null,
    notes: rec.rationale ? [rec.rationale] : [],
    operationalEvidence: [],
  };
}

export function archiveChurnedAction(
  action: ExecutiveTrackedAction,
  referenceIso: string,
): ExecutiveTrackedAction {
  return {
    ...action,
    status: "archived",
    archivedAt: referenceIso,
    archivedReason: ARCHIVE_REASON_FORECAST_CHURN,
    updatedAt: referenceIso,
  };
}

export function mergeForecastIntoExistingAction(
  existing: ExecutiveTrackedAction,
  rec: ExecutiveForecastRecommendation,
  referenceIso: string,
): ExecutiveTrackedAction {
  const terminal =
    existing.status === "completed" ||
    existing.status === "dismissed" ||
    existing.status === "archived";
  const referenceMs = new Date(referenceIso).getTime();
  return {
    ...existing,
    sourceForecastKey: buildStableRecommendationKeyFromRecommendation(rec),
    recommendationKind: rec.kind,
    territoryLabel: rec.territoryLabel ?? existing.territoryLabel,
    title: rec.title,
    priority: rec.priority,
    owner: existing.ownerManuallyAssigned ? existing.owner : (rec.owner ?? existing.owner),
    expectedImpact: rec.expectedImpact,
    dueDate:
      terminal || existing.dueDateManuallySet
        ? existing.dueDate
        : dueDateForPriority(rec.priority, referenceMs),
    updatedAt: referenceIso,
  };
}

function isMergeableStatus(status: ExecutiveTrackedAction["status"]): boolean {
  return status !== "archived";
}

export function syncActionsFromForecastRecommendations(input: {
  existingActions: ExecutiveTrackedAction[];
  recommendations: ExecutiveForecastRecommendation[];
  referenceIso: string;
}): ExecutiveTrackedAction[] {
  const byForecastKey = new Map<string, ExecutiveTrackedAction>();
  for (const row of input.existingActions) {
    if (row.sourceModule !== P44_SOURCE_MODULE) continue;
    if (row.status === "archived") continue;
    const stableKey = resolveActionForecastKey(row);
    const prior = byForecastKey.get(stableKey);
    if (!prior || new Date(row.updatedAt).getTime() > new Date(prior.updatedAt).getTime()) {
      byForecastKey.set(stableKey, row);
    }
  }

  const seenStableKeys = new Set<string>();
  const synced: ExecutiveTrackedAction[] = [];
  const retainedIds = new Set<string>();

  for (const rec of input.recommendations) {
    const stableKey = buildStableRecommendationKeyFromRecommendation(rec);
    seenStableKeys.add(stableKey);
    const existing = byForecastKey.get(stableKey);
    if (existing && isMergeableStatus(existing.status)) {
      const merged = mergeForecastIntoExistingAction(existing, rec, input.referenceIso);
      synced.push(merged);
      retainedIds.add(merged.recommendationId);
      continue;
    }
    const created = convertForecastRecommendationToAction(rec, input.referenceIso);
    synced.push(created);
    retainedIds.add(created.recommendationId);
  }

  for (const action of input.existingActions) {
    if (retainedIds.has(action.recommendationId)) continue;

    if (action.sourceModule !== P44_SOURCE_MODULE) {
      synced.push(action);
      retainedIds.add(action.recommendationId);
      continue;
    }

    const actionStableKey = resolveActionForecastKey(action);
    if (seenStableKeys.has(actionStableKey)) {
      synced.push(action);
      retainedIds.add(action.recommendationId);
      continue;
    }

    if (action.status === "open" || action.status === "in_progress") {
      const archived = archiveChurnedAction(
        {
          ...action,
          sourceForecastKey: actionStableKey,
        },
        input.referenceIso,
      );
      synced.push(archived);
      retainedIds.add(archived.recommendationId);
      continue;
    }

    synced.push({
      ...action,
      sourceForecastKey: actionStableKey,
    });
    retainedIds.add(action.recommendationId);
  }

  return synced.sort((a, b) => {
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    const byPriority = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (byPriority !== 0) return byPriority;
    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
  });
}

function buildStablePipelineRecommendationKey(rec: PipelineBottleneckRecommendation): string {
  return buildStableRecommendationKey({
    kind: rec.kind,
    owner: rec.owner,
    territoryLabel: rec.territoryLabel,
    title: `${rec.stage}:${rec.title}`,
  });
}

export function convertPipelineRecommendationToAction(
  rec: PipelineBottleneckRecommendation,
  referenceIso: string,
): ExecutiveTrackedAction {
  const referenceMs = new Date(referenceIso).getTime();
  const now = Number.isNaN(referenceMs) ? new Date().toISOString() : referenceIso;
  return {
    recommendationId: createActionId(),
    sourcePhase: P51_SOURCE_PHASE,
    sourceModule: P51_SOURCE_MODULE,
    sourceForecastKey: buildStablePipelineRecommendationKey(rec),
    recommendationKind: rec.kind,
    territoryLabel: rec.territoryLabel,
    title: rec.title,
    priority: rec.priority,
    owner: rec.owner,
    ownerManuallyAssigned: false,
    dueDate: dueDateForPriority(rec.priority, Number.isNaN(referenceMs) ? Date.now() : referenceMs),
    dueDateManuallySet: false,
    status: "open",
    expectedImpact: rec.expectedImpact,
    outcomeNotes: null,
    actualOutcome: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    archivedAt: null,
    archivedReason: null,
    notes: rec.rationale ? [rec.rationale] : [],
    operationalEvidence: [],
  };
}

function mergePipelineIntoExistingAction(
  existing: ExecutiveTrackedAction,
  rec: PipelineBottleneckRecommendation,
  referenceIso: string,
): ExecutiveTrackedAction {
  const terminal =
    existing.status === "completed" ||
    existing.status === "dismissed" ||
    existing.status === "archived";
  const referenceMs = new Date(referenceIso).getTime();
  return {
    ...existing,
    sourceForecastKey: buildStablePipelineRecommendationKey(rec),
    recommendationKind: rec.kind,
    territoryLabel: rec.territoryLabel ?? existing.territoryLabel,
    title: rec.title,
    priority: rec.priority,
    owner: existing.ownerManuallyAssigned ? existing.owner : (rec.owner ?? existing.owner),
    expectedImpact: rec.expectedImpact,
    dueDate:
      terminal || existing.dueDateManuallySet
        ? existing.dueDate
        : dueDateForPriority(rec.priority, referenceMs),
    updatedAt: referenceIso,
  };
}

export function syncActionsFromPipelineRecommendations(input: {
  existingActions: ExecutiveTrackedAction[];
  recommendations: PipelineBottleneckRecommendation[];
  referenceIso: string;
}): ExecutiveTrackedAction[] {
  const byStableKey = new Map<string, ExecutiveTrackedAction>();
  for (const row of input.existingActions) {
    if (row.sourceModule !== P51_SOURCE_MODULE) continue;
    if (row.status === "archived") continue;
    const stableKey = resolveActionForecastKey(row);
    const prior = byStableKey.get(stableKey);
    if (!prior || new Date(row.updatedAt).getTime() > new Date(prior.updatedAt).getTime()) {
      byStableKey.set(stableKey, row);
    }
  }

  const seenStableKeys = new Set<string>();
  const synced: ExecutiveTrackedAction[] = [];
  const retainedIds = new Set<string>();

  for (const rec of input.recommendations) {
    const stableKey = buildStablePipelineRecommendationKey(rec);
    seenStableKeys.add(stableKey);
    const existing = byStableKey.get(stableKey);
    if (existing && isMergeableStatus(existing.status)) {
      const merged = mergePipelineIntoExistingAction(existing, rec, input.referenceIso);
      synced.push(merged);
      retainedIds.add(merged.recommendationId);
      continue;
    }
    const created = convertPipelineRecommendationToAction(rec, input.referenceIso);
    synced.push(created);
    retainedIds.add(created.recommendationId);
  }

  for (const action of input.existingActions) {
    if (retainedIds.has(action.recommendationId)) continue;

    if (action.sourceModule !== P51_SOURCE_MODULE) {
      synced.push(action);
      retainedIds.add(action.recommendationId);
      continue;
    }

    const actionStableKey = resolveActionForecastKey(action);
    if (seenStableKeys.has(actionStableKey)) {
      synced.push(action);
      retainedIds.add(action.recommendationId);
      continue;
    }

    if (action.status === "open" || action.status === "in_progress") {
      const archived: ExecutiveTrackedAction = {
        ...action,
        sourceForecastKey: actionStableKey,
        status: "archived",
        archivedAt: input.referenceIso,
        archivedReason: ARCHIVE_REASON_PIPELINE_CHURN,
        updatedAt: input.referenceIso,
      };
      synced.push(archived);
      retainedIds.add(archived.recommendationId);
      continue;
    }

    synced.push({
      ...action,
      sourceForecastKey: actionStableKey,
    });
    retainedIds.add(action.recommendationId);
  }

  return synced;
}
