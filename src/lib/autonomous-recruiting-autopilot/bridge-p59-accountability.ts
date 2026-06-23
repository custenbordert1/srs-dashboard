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
  updateCorrelationLinks,
  type ExecutionCorrelation,
} from "@/lib/autonomous-recruiting-execution/execution-correlation";

export const P59_SOURCE_PHASE = "P59";
export const P59_SOURCE_MODULE = "autonomous-recruiting-autopilot";
export const P59_SYSTEM_ACTOR = "P59 Autopilot (system)";

function mapPriority(priority: ExecutionCorrelation["priority"]): RecommendationPriority {
  if (priority === "high") return "high";
  if (priority === "medium") return "medium";
  return "low";
}

async function ensureP59AccountabilityAction(
  correlation: ExecutionCorrelation,
  ruleId: string | null,
  ruleName: string | null,
): Promise<string> {
  const store = await loadExecutiveAccountabilityStore();
  const stableKey = correlation.recommendationId;
  const existing = store.actions.find(
    (row) =>
      row.sourceModule === P59_SOURCE_MODULE &&
      row.sourceForecastKey === stableKey &&
      row.status !== "archived",
  );

  const now = new Date().toISOString();
  const ruleNote = ruleId
    ? `Auto-approved by P59 at ${now}. Rule: ${ruleName ?? ruleId} (${ruleId}). Approval source: system.`
    : `Auto-approved by P59 at ${now}. Approval source: system.`;

  if (existing) {
    const { action } = await updateExecutiveAction(
      existing.recommendationId,
      {
        status: "in_progress",
        appendNote: ruleNote,
      },
      { displayName: P59_SYSTEM_ACTOR },
    );
    return action?.recommendationId ?? existing.recommendationId;
  }

  const referenceMs = Date.now();
  const priority = mapPriority(correlation.priority);
  const action: ExecutiveTrackedAction = {
    recommendationId: createActionId(),
    sourcePhase: P59_SOURCE_PHASE,
    sourceModule: P59_SOURCE_MODULE,
    sourceForecastKey: stableKey,
    recommendationKind: correlation.type,
    territoryLabel: correlation.territory,
    title: correlation.displayTitle ?? correlation.recommendationId,
    priority,
    owner: null,
    ownerManuallyAssigned: false,
    dueDate: dueDateForPriority(priority, referenceMs),
    dueDateManuallySet: false,
    status: "in_progress",
    expectedImpact: "Autonomous autopilot execution tracked for executive visibility.",
    outcomeNotes: null,
    actualOutcome: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    archivedAt: null,
    archivedReason: null,
    notes: [ruleNote, correlation.reason ?? ""].filter(Boolean),
    operationalEvidence: [],
  };

  store.actions.unshift(action);
  store.auditLog = appendAuditEntry(store.auditLog, {
    recommendationId: action.recommendationId,
    changedBy: P59_SYSTEM_ACTOR,
    field: "auto_approved",
    oldValue: null,
    newValue: ruleId ?? "system",
    changedAt: now,
  });
  await saveExecutiveAccountabilityStore(store);
  return action.recommendationId;
}

export async function approveCorrelationWithP59Accountability(
  correlationId: string,
  ruleId: string | null,
  ruleName: string | null,
): Promise<ExecutionCorrelation | null> {
  const approved = await approveCorrelation(correlationId, P59_SYSTEM_ACTOR);
  if (!approved) return null;

  const accountabilityActionId = await ensureP59AccountabilityAction(approved, ruleId, ruleName);
  return updateCorrelationLinks(correlationId, { accountabilityActionId });
}

export async function recordP59ExecutionOutcome(
  accountabilityActionId: string,
  summary: string,
  success: boolean,
): Promise<void> {
  const now = new Date().toISOString();
  await updateExecutiveAction(
    accountabilityActionId,
    {
      status: success ? "completed" : "open",
      appendNote: `P59 execution result at ${now}: ${summary}`,
      outcomeNotes: summary,
    },
    { displayName: P59_SYSTEM_ACTOR },
  );
}
