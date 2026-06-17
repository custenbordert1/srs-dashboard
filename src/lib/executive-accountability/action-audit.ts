import { randomUUID } from "node:crypto";
import type {
  ExecutiveActionAuditEntry,
  ExecutiveTrackedAction,
  OperationalEvidence,
  OperationalEvidenceKind,
} from "@/lib/executive-accountability/types";

export const OPERATIONAL_EVIDENCE_LABELS: Record<OperationalEvidenceKind, string> = {
  candidate_moved: "Candidate moved",
  job_refreshed: "Job refreshed",
  pay_increased: "Pay increased",
  territory_escalated: "Territory escalated",
};

export function evidenceKindForRecommendationKind(
  kind: string | null | undefined,
): OperationalEvidenceKind | null {
  switch (kind) {
    case "refresh-job-ads":
      return "job_refreshed";
    case "increase-pay":
      return "pay_increased";
    case "move-recruiter-focus":
    case "prioritize-candidates":
      return "candidate_moved";
    case "escalate-dm-territory":
      return "territory_escalated";
    default:
      return null;
  }
}

export function createOperationalEvidence(input: {
  kind: OperationalEvidenceKind;
  recordedBy: string;
  detail?: string | null;
  recordedAt?: string;
}): OperationalEvidence {
  return {
    id: randomUUID(),
    kind: input.kind,
    label: OPERATIONAL_EVIDENCE_LABELS[input.kind],
    recordedAt: input.recordedAt ?? new Date().toISOString(),
    recordedBy: input.recordedBy,
    detail: input.detail?.trim() || null,
  };
}

export function appendAuditEntry(
  log: ExecutiveActionAuditEntry[],
  input: {
    recommendationId: string;
    changedBy: string;
    field: string;
    oldValue: string | null;
    newValue: string | null;
    changedAt?: string;
  },
): ExecutiveActionAuditEntry[] {
  const entry: ExecutiveActionAuditEntry = {
    id: randomUUID(),
    recommendationId: input.recommendationId,
    changedAt: input.changedAt ?? new Date().toISOString(),
    changedBy: input.changedBy,
    field: input.field,
    oldValue: input.oldValue,
    newValue: input.newValue,
  };
  return [...log, entry];
}

export function auditEntriesForAction(
  log: ExecutiveActionAuditEntry[],
  recommendationId: string,
): ExecutiveActionAuditEntry[] {
  return log
    .filter((row) => row.recommendationId === recommendationId)
    .sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime());
}

export function auditEntriesByActionId(
  log: ExecutiveActionAuditEntry[],
): Record<string, ExecutiveActionAuditEntry[]> {
  const map: Record<string, ExecutiveActionAuditEntry[]> = {};
  for (const entry of log) {
    const bucket = map[entry.recommendationId] ?? [];
    bucket.push(entry);
    map[entry.recommendationId] = bucket;
  }
  for (const id of Object.keys(map)) {
    map[id]!.sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime());
  }
  return map;
}

export function normalizeExecutiveTrackedAction(
  raw: Partial<ExecutiveTrackedAction> & Pick<ExecutiveTrackedAction, "recommendationId">,
): ExecutiveTrackedAction {
  const outcomeNotes = raw.outcomeNotes ?? raw.actualOutcome ?? null;
  return {
    recommendationId: raw.recommendationId,
    sourcePhase: raw.sourcePhase ?? "P44",
    sourceModule: raw.sourceModule ?? "executive-recruiting-forecast",
    sourceForecastKey: raw.sourceForecastKey ?? raw.recommendationId,
    recommendationKind: raw.recommendationKind ?? null,
    title: raw.title ?? "Executive action",
    priority: raw.priority ?? "medium",
    owner: raw.owner ?? null,
    ownerManuallyAssigned: raw.ownerManuallyAssigned ?? false,
    dueDate: raw.dueDate ?? new Date().toISOString(),
    dueDateManuallySet: raw.dueDateManuallySet ?? false,
    status: raw.status ?? "open",
    expectedImpact: raw.expectedImpact ?? "",
    outcomeNotes,
    actualOutcome: outcomeNotes,
    createdAt: raw.createdAt ?? new Date().toISOString(),
    updatedAt: raw.updatedAt ?? new Date().toISOString(),
    completedAt: raw.completedAt ?? null,
    archivedAt: raw.archivedAt ?? null,
    archivedReason: raw.archivedReason ?? null,
    notes: Array.isArray(raw.notes) ? raw.notes : [],
    operationalEvidence: Array.isArray(raw.operationalEvidence) ? raw.operationalEvidence : [],
  };
}

export function isActiveExecutiveAction(action: ExecutiveTrackedAction): boolean {
  return action.status === "open" || action.status === "in_progress";
}
