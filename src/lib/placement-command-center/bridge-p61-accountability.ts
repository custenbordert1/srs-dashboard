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
import {
  approveCorrelation,
  getCorrelation,
  markCorrelationForReview,
  rejectCorrelation,
  updateCorrelationLinks,
  type ExecutionCorrelation,
} from "@/lib/autonomous-recruiting-execution/execution-correlation";
import { P60_SOURCE_MODULE } from "@/lib/placement-command-center/index";

export const P61_SOURCE_PHASE = "P61";

function mapPriority(priority: ExecutionCorrelation["priority"]): RecommendationPriority {
  if (priority === "high") return "high";
  if (priority === "medium") return "medium";
  return "low";
}

function buildExpectedImpact(correlation: ExecutionCorrelation): string {
  const label = correlation.placementMatchLabel ?? "placement";
  return `Execute ${label} placement on ${correlation.displayTitle ?? correlation.placementProjectId ?? "project"}.`;
}

async function ensureP61AccountabilityAction(
  correlation: ExecutionCorrelation,
  actor: { displayName: string },
  note?: string,
): Promise<string> {
  const store = await loadExecutiveAccountabilityStore();
  const stableKey = correlation.recommendationId;
  const existing = store.actions.find(
    (row) =>
      row.sourceForecastKey === stableKey &&
      row.recommendationKind === "placement" &&
      row.status !== "archived",
  );

  const now = new Date().toISOString();

  if (existing) {
    const { action } = await updateExecutiveAction(
      existing.recommendationId,
      {
        status: "in_progress",
        appendNote: note ?? `P61 placement recommendation updated at ${now}.`,
      },
      actor,
    );
    return action?.recommendationId ?? existing.recommendationId;
  }

  const referenceMs = Date.now();
  const priority = mapPriority(correlation.priority);
  const action: ExecutiveTrackedAction = {
    recommendationId: createActionId(),
    sourcePhase: P61_SOURCE_PHASE,
    sourceModule: P60_SOURCE_MODULE,
    sourceForecastKey: stableKey,
    recommendationKind: "placement",
    territoryLabel: correlation.territory,
    title: correlation.displayTitle ?? correlation.recommendationId,
    priority,
    owner: null,
    ownerManuallyAssigned: false,
    dueDate: dueDateForPriority(priority, referenceMs),
    dueDateManuallySet: false,
    status: "open",
    expectedImpact: buildExpectedImpact(correlation),
    outcomeNotes: null,
    actualOutcome: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    archivedAt: null,
    archivedReason: null,
    notes: [note, correlation.reason ?? ""].filter((value): value is string => Boolean(value)),
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

export async function recordPlacementRecommendationInAccountability(
  correlation: ExecutionCorrelation,
  actor: { displayName: string },
): Promise<string> {
  return ensureP61AccountabilityAction(
    correlation,
    actor,
    `P61 placement recommendation recorded. Match: ${correlation.placementMatchLabel ?? "pending"}.`,
  );
}

export async function approvePlacementWithAccountability(
  correlationId: string,
  actor: { displayName: string },
): Promise<ExecutionCorrelation | null> {
  const correlation = await getCorrelation(correlationId);
  if (!correlation || correlation.type !== "placement") return null;

  const approved = await approveCorrelation(correlationId, actor.displayName);
  if (!approved) return null;

  const accountabilityActionId = await ensureP61AccountabilityAction(
    approved,
    actor,
    `Placement approved via P61 bridge at ${new Date().toISOString()}.`,
  );

  await updateExecutiveAction(
    accountabilityActionId,
    { status: "in_progress", appendNote: "Placement approved for P58 execution." },
    actor,
  );

  return updateCorrelationLinks(correlationId, { accountabilityActionId });
}

export async function rejectPlacementWithAccountability(
  correlationId: string,
  actor: { displayName: string },
  reason?: string,
): Promise<ExecutionCorrelation | null> {
  const correlation = await getCorrelation(correlationId);
  if (!correlation || correlation.type !== "placement") return null;

  const rejected = await rejectCorrelation(correlationId, actor.displayName, reason);
  if (!rejected) return null;

  if (rejected.accountabilityActionId) {
    await updateExecutiveAction(
      rejected.accountabilityActionId,
      {
        status: "archived",
        appendNote: `Placement rejected at ${new Date().toISOString()}: ${reason ?? "No reason provided"}.`,
      },
      actor,
    );
  } else {
    const accountabilityActionId = await ensureP61AccountabilityAction(
      rejected,
      actor,
      `Placement rejected: ${reason ?? "No reason provided"}.`,
    );
    await updateExecutiveAction(
      accountabilityActionId,
      {
        status: "archived",
        appendNote: reason ?? "Placement rejected by executive.",
      },
      actor,
    );
    return updateCorrelationLinks(correlationId, { accountabilityActionId });
  }

  return rejected;
}

export async function markPlacementNeedsReviewWithAccountability(
  correlationId: string,
  actor: { displayName: string },
  note?: string,
): Promise<ExecutionCorrelation | null> {
  const correlation = await getCorrelation(correlationId);
  if (!correlation || correlation.type !== "placement") return null;

  const marked = await markCorrelationForReview(correlationId, actor.displayName, note);
  if (!marked) return null;

  const accountabilityActionId = marked.accountabilityActionId
    ? marked.accountabilityActionId
    : await ensureP61AccountabilityAction(marked, actor, note);

  if (!marked.accountabilityActionId) {
    await updateCorrelationLinks(correlationId, { accountabilityActionId });
  }

  await updateExecutiveAction(
    accountabilityActionId,
    {
      status: "open",
      appendNote: note ?? `Placement flagged for review at ${new Date().toISOString()}.`,
    },
    actor,
  );

  return marked.accountabilityActionId ? marked : { ...marked, accountabilityActionId };
}

export async function recordPlacementOutcome(
  accountabilityActionId: string,
  summary: string,
  success: boolean,
  actor: { displayName: string },
): Promise<void> {
  const now = new Date().toISOString();
  await updateExecutiveAction(
    accountabilityActionId,
    {
      status: success ? "completed" : "open",
      appendNote: `P61 placement outcome at ${now}: ${summary}`,
      outcomeNotes: summary,
    },
    actor,
  );
}
