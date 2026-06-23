import { appendAuditEntry } from "@/lib/executive-accountability/action-audit";
import { dueDateForPriority } from "@/lib/executive-accountability/convert-recommendations";
import {
  createActionId,
  loadExecutiveAccountabilityStore,
  saveExecutiveAccountabilityStore,
  updateExecutiveAction,
} from "@/lib/executive-accountability/recommendation-store";
import type { ExecutiveTrackedAction } from "@/lib/executive-accountability/types";
import type { RecommendationPriority } from "@/lib/executive-recruiting-forecast";
import type { ExecutionCorrelation } from "@/lib/autonomous-recruiting-execution/execution-correlation";

export const P58_SOURCE_PHASE = "P58";
export const P58_SOURCE_MODULE = "autonomous-recruiting-execution";

function mapPriority(priority: ExecutionCorrelation["priority"]): RecommendationPriority {
  if (priority === "high") return "high";
  if (priority === "medium") return "medium";
  return "low";
}

function buildTitle(correlation: ExecutionCorrelation): string {
  return correlation.displayTitle ?? correlation.recommendationId;
}

function buildExpectedImpact(correlation: ExecutionCorrelation): string {
  if (correlation.type === "posting" || correlation.type === "refresh") {
    return "Improve applicant flow via posting automation.";
  }
  if (correlation.type === "hiring") {
    return `Advance candidate workflow: ${correlation.hiringAction ?? "review"}.`;
  }
  if (correlation.type === "placement") {
    return `Place candidate on project: ${correlation.displayTitle ?? correlation.placementProjectId ?? "MEL opportunity"}.`;
  }
  return "Resolve critical territory coverage gap.";
}

export async function ensureAccountabilityForCorrelation(
  correlation: ExecutionCorrelation,
  actor: { displayName: string },
): Promise<string> {
  if (correlation.type === "placement") {
    const { recordPlacementRecommendationInAccountability } = await import(
      "@/lib/placement-command-center/bridge-p61-accountability"
    );
    return recordPlacementRecommendationInAccountability(correlation, actor);
  }

  const store = await loadExecutiveAccountabilityStore();
  const stableKey = correlation.recommendationId;
  const existing = store.actions.find(
    (row) =>
      row.sourceModule === P58_SOURCE_MODULE &&
      row.sourceForecastKey === stableKey &&
      row.status !== "archived",
  );

  if (existing) {
    const { action } = await updateExecutiveAction(
      existing.recommendationId,
      {
        status: "in_progress",
        appendNote: "Approved via P58 execution orchestrator.",
      },
      actor,
    );
    return action?.recommendationId ?? existing.recommendationId;
  }

  const now = new Date().toISOString();
  const referenceMs = Date.now();
  const priority = mapPriority(correlation.priority);
  const action: ExecutiveTrackedAction = {
    recommendationId: createActionId(),
    sourcePhase: P58_SOURCE_PHASE,
    sourceModule: P58_SOURCE_MODULE,
    sourceForecastKey: stableKey,
    recommendationKind: correlation.type,
    territoryLabel: correlation.territory,
    title: buildTitle(correlation),
    priority,
    owner: null,
    ownerManuallyAssigned: false,
    dueDate: dueDateForPriority(priority, referenceMs),
    dueDateManuallySet: false,
    status: "in_progress",
    expectedImpact: buildExpectedImpact(correlation),
    outcomeNotes: null,
    actualOutcome: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    archivedAt: null,
    archivedReason: null,
    notes: correlation.reason ? [correlation.reason] : [],
    operationalEvidence: [],
  };

  store.actions.unshift(action);
  store.auditLog = appendAuditEntry(store.auditLog, {
    recommendationId: action.recommendationId,
    changedBy: actor.displayName,
    field: "created",
    oldValue: null,
    newValue: action.title,
    changedAt: now,
  });
  await saveExecutiveAccountabilityStore(store);
  return action.recommendationId;
}

export async function approveCorrelationWithAccountability(
  correlationId: string,
  actor: { displayName: string },
): Promise<ExecutionCorrelation | null> {
  const { approveCorrelation, getCorrelation, updateCorrelationLinks } = await import(
    "@/lib/autonomous-recruiting-execution/execution-correlation"
  );

  const correlation = await getCorrelation(correlationId);
  if (!correlation) return null;

  if (correlation.type === "placement") {
    const { approvePlacementWithAccountability } = await import(
      "@/lib/placement-command-center/bridge-p61-accountability"
    );
    return approvePlacementWithAccountability(correlationId, actor);
  }

  const approved = await approveCorrelation(correlationId, actor.displayName);
  if (!approved) return null;

  const accountabilityActionId = await ensureAccountabilityForCorrelation(approved, actor);
  return updateCorrelationLinks(correlationId, { accountabilityActionId });
}
