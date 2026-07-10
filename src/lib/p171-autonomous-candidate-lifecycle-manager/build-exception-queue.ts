import {
  loadP171LifecycleState,
  listP171Exceptions,
} from "@/lib/p171-autonomous-candidate-lifecycle-manager/lifecycle-store";
import {
  P171_SOURCE_PHASE,
  type P171ExceptionQueueReport,
  type P171LifecycleException,
} from "@/lib/p171-autonomous-candidate-lifecycle-manager/types";

const CATEGORY_LABELS: Record<string, string> = {
  duplicate: "Duplicate",
  missing_email: "Missing email",
  invalid_phone: "Invalid phone",
  paperwork_expired: "Paperwork expired",
  signature_declined: "Signature declined",
  dropbox_failure: "Dropbox failure",
  api_timeout: "API timeout",
  low_confidence: "Low confidence",
  manual_review: "Manual review",
};

function toException(row: ReturnType<typeof listP171Exceptions>[number]): P171LifecycleException {
  return {
    candidateId: row.candidateId,
    candidateName: row.candidateName,
    email: row.email,
    category: row.exceptionCategory ?? "manual_review",
    reason: row.exceptionReason ?? "Requires recruiter review",
    state: row.state,
    confidence: row.confidence,
    p157Action: row.p157Action,
    recruiter: "",
    position: row.position,
    createdAt: row.updatedAt,
    resolvedAt: row.exceptionResolvedAt,
  };
}

export async function buildP171ExceptionQueue(): Promise<P171ExceptionQueueReport> {
  const state = await loadP171LifecycleState();
  const exceptions = listP171Exceptions(state).map(toException);

  const categoryCounts = new Map<string, number>();
  for (const row of exceptions) {
    const label = CATEGORY_LABELS[row.category] ?? row.category;
    categoryCounts.set(label, (categoryCounts.get(label) ?? 0) + 1);
  }

  const byCategory = [...categoryCounts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));

  const warnings: string[] = [];
  if (exceptions.length === 0) {
    warnings.push("No active lifecycle exceptions — run a cycle or wait for the next interval.");
  }
  if (exceptions.length > state.config.exceptionThreshold) {
    warnings.push(
      `Exception count ${exceptions.length} exceeds threshold ${state.config.exceptionThreshold}.`,
    );
  }

  return {
    sourcePhase: P171_SOURCE_PHASE,
    generatedAt: new Date().toISOString(),
    readOnly: true,
    totalExceptions: exceptions.length,
    byCategory,
    exceptions,
    lastCycleAt: state.lastCycleAt,
    warnings,
  };
}

export { CATEGORY_LABELS };
