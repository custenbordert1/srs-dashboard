import type { ExecutiveForecastRecommendation, RecommendationPriority } from "@/lib/executive-recruiting-forecast";
import { createActionId } from "@/lib/executive-accountability/recommendation-store";
import type { ExecutiveTrackedAction } from "@/lib/executive-accountability/types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const P44_SOURCE_PHASE = "P44";
export const P44_SOURCE_MODULE = "executive-recruiting-forecast";
export const ARCHIVE_REASON_FORECAST_CHURN = "forecast_recommendation_churned";

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
    sourceForecastKey: rec.id,
    recommendationKind: rec.kind,
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
    recommendationKind: rec.kind,
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
    const prior = byForecastKey.get(row.sourceForecastKey);
    if (!prior || new Date(row.updatedAt).getTime() > new Date(prior.updatedAt).getTime()) {
      byForecastKey.set(row.sourceForecastKey, row);
    }
  }

  const seenKeys = new Set<string>();
  const synced: ExecutiveTrackedAction[] = [];
  const retainedIds = new Set<string>();

  for (const rec of input.recommendations) {
    seenKeys.add(rec.id);
    const existing = byForecastKey.get(rec.id);
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

    if (seenKeys.has(action.sourceForecastKey)) {
      synced.push(action);
      retainedIds.add(action.recommendationId);
      continue;
    }

    if (action.status === "open" || action.status === "in_progress") {
      const archived = archiveChurnedAction(action, input.referenceIso);
      synced.push(archived);
      retainedIds.add(archived.recommendationId);
      continue;
    }

    synced.push(action);
    retainedIds.add(action.recommendationId);
  }

  return synced.sort((a, b) => {
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    const byPriority = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (byPriority !== 0) return byPriority;
    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
  });
}
