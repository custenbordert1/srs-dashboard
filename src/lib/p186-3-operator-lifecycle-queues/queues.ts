import type { P186LifecycleState } from "@/lib/p186-1-lifecycle-state-machine/types";
import type {
  P1863CandidateQueueItem,
  P1863QueueId,
  P1863QueueSummary,
} from "@/lib/p186-3-operator-lifecycle-queues/types";

export type P1863SourceRow = {
  candidateId: string;
  displayName?: string | null;
  jobTitle?: string | null;
  city?: string | null;
  state?: string | null;
  recruiter?: string | null;
  dm?: string | null;
  productionState?: string | null;
  shadowState?: P186LifecycleState | string | null;
  paperworkState?: string | null;
  onboardingState?: string | null;
  melReady?: boolean;
  mismatch?: boolean;
  mismatchKind?: string | null;
  blocked?: boolean;
  blockers?: string[];
  priority?: "high" | "medium" | "low";
  updatedAt?: string | null;
  sourceSystemState?: string | null;
  withdrawn?: boolean;
  archived?: boolean;
  holdFlags?: string[];
};

export const P1863_QUEUE_LABELS: Record<P1863QueueId, string> = {
  waiting_recruiter_review: "Waiting for recruiter review",
  hiring_recommendation_needed: "Hiring recommendation needed",
  waiting_operator_approval: "Waiting for operator approval",
  approved_waiting_paperwork: "Approved, waiting for paperwork",
  paperwork_sent: "Paperwork sent",
  paperwork_viewed: "Paperwork viewed",
  paperwork_signed: "Paperwork signed",
  onboarding_incomplete: "Onboarding incomplete",
  ready_for_mel: "Ready for MEL",
  export_blocked: "Export blocked",
  lifecycle_conflicts: "Lifecycle conflicts",
  missing_shadow: "Missing shadow records",
};

export function classifyQueue(row: P1863SourceRow): P1863QueueId {
  if (!row.shadowState) return "missing_shadow";
  if (row.mismatch) return "lifecycle_conflicts";
  if (row.blocked && (row.holdFlags?.length || row.blockers?.some((b) => /export/i.test(b)))) {
    if (/export|mel/i.test((row.blockers ?? []).join(" "))) return "export_blocked";
  }

  const shadow = String(row.shadowState);
  const prod = (row.productionState ?? "").toLowerCase();
  const paperwork = (row.paperworkState ?? "").toLowerCase();

  if (shadow === "RECRUITER_REVIEW" || prod === "needs review") return "waiting_recruiter_review";
  if (shadow === "HIRING_RECOMMENDATION") {
    if (/qualified|recommended|pending approval/.test(prod)) {
      return "waiting_operator_approval";
    }
    return "hiring_recommendation_needed";
  }
  if (shadow === "OPERATOR_APPROVED") return "approved_waiting_paperwork";
  if (shadow === "PAPERWORK_NEEDED" || prod === "paperwork needed") {
    return "approved_waiting_paperwork";
  }
  if (shadow === "PAPERWORK_SENT" || paperwork === "sent") return "paperwork_sent";
  if (shadow === "VIEWED" || paperwork === "viewed") return "paperwork_viewed";
  if (shadow === "SIGNED" || paperwork === "signed" || prod === "signed") {
    return "paperwork_signed";
  }
  if (shadow === "ONBOARDING_COMPLETE" || prod === "awaiting dd verification") {
    return "onboarding_incomplete";
  }
  if (shadow === "READY_FOR_MEL" || prod === "ready for mel") return "ready_for_mel";
  if (shadow === "BLOCKED") return "export_blocked";
  if (shadow === "APPLIED") return "waiting_recruiter_review";
  if (shadow === "EXPORTED") return "ready_for_mel";
  return "lifecycle_conflicts";
}

export function recommendedActionForQueue(queueId: P1863QueueId): string {
  switch (queueId) {
    case "waiting_recruiter_review":
      return "Recruiter review";
    case "hiring_recommendation_needed":
      return "Submit hiring recommendation";
    case "waiting_operator_approval":
      return "Approve or reject recommendation";
    case "approved_waiting_paperwork":
      return "Authorized paperwork batch (P185) — do not send from P186";
    case "paperwork_sent":
    case "paperwork_viewed":
      return "Monitor signature";
    case "paperwork_signed":
      return "Verify onboarding docs";
    case "onboarding_incomplete":
      return "Complete onboarding checklist";
    case "ready_for_mel":
      return "Review MEL readiness";
    case "export_blocked":
      return "Resolve export blockers";
    case "lifecycle_conflicts":
      return "Investigate mismatch";
    case "missing_shadow":
      return "Request reconciliation";
    default:
      return "Review";
  }
}

export function buildQueueItem(row: P1863SourceRow, nowMs = Date.now()): P1863CandidateQueueItem {
  const queueId = classifyQueue(row);
  const updated = row.updatedAt ? Date.parse(row.updatedAt) : nowMs;
  const ageMs = Math.max(0, nowMs - (Number.isFinite(updated) ? updated : nowMs));
  return {
    candidateId: row.candidateId,
    displayName: row.displayName?.trim() || `Candidate ${row.candidateId.slice(0, 8)}`,
    jobTitle: row.jobTitle ?? null,
    city: row.city ?? null,
    state: row.state ?? null,
    recruiter: row.recruiter ?? null,
    dm: row.dm ?? null,
    productionState: row.productionState ?? null,
    shadowState: row.shadowState ? String(row.shadowState) : null,
    paperworkState: row.paperworkState ?? null,
    onboardingState: row.onboardingState ?? null,
    melReady: Boolean(row.melReady),
    mismatch: Boolean(row.mismatch),
    mismatchKind: row.mismatchKind ?? null,
    blocked: Boolean(row.blocked || row.withdrawn || row.archived),
    blockers: [
      ...(row.blockers ?? []),
      ...(row.withdrawn ? ["withdrawn"] : []),
      ...(row.archived ? ["archived"] : []),
      ...(row.holdFlags ?? []),
    ],
    priority: row.priority ?? (ageMs > 7 * 86400000 ? "high" : ageMs > 2 * 86400000 ? "medium" : "low"),
    ageMs,
    sourceSystemState: row.sourceSystemState ?? row.productionState ?? null,
    recommendedAction: recommendedActionForQueue(queueId),
    queueId,
  };
}

export function summarizeQueues(
  items: P1863CandidateQueueItem[],
): P1863QueueSummary[] {
  const byQueue = new Map<P1863QueueId, P1863CandidateQueueItem[]>();
  for (const id of Object.keys(P1863_QUEUE_LABELS) as P1863QueueId[]) {
    byQueue.set(id, []);
  }
  for (const item of items) {
    byQueue.get(item.queueId)?.push(item);
  }
  return [...byQueue.entries()].map(([queueId, rows]) => {
    const ages = rows.map((r) => r.ageMs);
    return {
      queueId,
      label: P1863_QUEUE_LABELS[queueId],
      count: rows.length,
      oldestAgeMs: ages.length ? Math.max(...ages) : null,
      averageAgeMs: ages.length
        ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length)
        : null,
      blockedCount: rows.filter((r) => r.blocked).length,
      priorityCount: rows.filter((r) => r.priority === "high").length,
    };
  });
}
