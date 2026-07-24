import type {
  P1863OperatorAction,
  P1863ProductRole,
  P1863QueueId,
} from "@/lib/p186-3-operator-lifecycle-queues/types";
import type { UserRole } from "@/lib/auth/types";

/** Map session UserRole → product role (operator ≈ executive for write APIs). */
export function toProductRole(sessionRole: UserRole, preferOperator = false): P1863ProductRole {
  if (sessionRole === "executive") return preferOperator ? "operator" : "executive";
  if (sessionRole === "recruiter") return "recruiter";
  if (sessionRole === "dm") return "dm";
  return "read_only_viewer";
}

const QUEUE_ACCESS: Record<P1863ProductRole, ReadonlySet<P1863QueueId> | "all"> = {
  executive: "all",
  operator: "all",
  recruiter: new Set([
    "waiting_recruiter_review",
    "hiring_recommendation_needed",
    "approved_waiting_paperwork",
    "paperwork_sent",
    "paperwork_viewed",
    "paperwork_signed",
    "onboarding_incomplete",
  ]),
  dm: new Set([
    "waiting_recruiter_review",
    "hiring_recommendation_needed",
    "waiting_operator_approval",
    "approved_waiting_paperwork",
    "paperwork_sent",
    "paperwork_viewed",
    "onboarding_incomplete",
    "ready_for_mel",
    "export_blocked",
  ]),
  read_only_viewer: "all",
};

const ACTION_ACCESS: Record<P1863ProductRole, ReadonlySet<P1863OperatorAction>> = {
  read_only_viewer: new Set(["view", "filter_sort"]),
  recruiter: new Set([
    "view",
    "filter_sort",
    "export_redacted",
    "add_note",
    "assign_review_label",
    "return_to_recruiter",
  ]),
  dm: new Set([
    "view",
    "filter_sort",
    "export_redacted",
    "add_note",
    "assign_review_label",
    "place_hold",
    "remove_hold",
    "return_to_recruiter",
  ]),
  operator: new Set([
    "view",
    "filter_sort",
    "export_redacted",
    "add_note",
    "assign_review_label",
    "approve_hiring_recommendation",
    "reject_hiring_recommendation",
    "return_to_recruiter",
    "place_hold",
    "remove_hold",
    "mark_paperwork_review_approved",
    "mark_onboarding_exception_reviewed",
    "mark_mel_ready_review_approved",
    "acknowledge_conflict",
    "request_reconciliation",
    "assign_investigation_owner",
    "mark_conflict_reviewed",
  ]),
  executive: new Set([
    "view",
    "filter_sort",
    "export_redacted",
    "add_note",
    "assign_review_label",
    "approve_hiring_recommendation",
    "reject_hiring_recommendation",
    "return_to_recruiter",
    "place_hold",
    "remove_hold",
    "mark_paperwork_review_approved",
    "mark_onboarding_exception_reviewed",
    "mark_mel_ready_review_approved",
    "acknowledge_conflict",
    "request_reconciliation",
    "assign_investigation_owner",
    "mark_conflict_reviewed",
  ]),
};

const WRITE_ACTIONS: ReadonlySet<P1863OperatorAction> = new Set([
  "approve_hiring_recommendation",
  "reject_hiring_recommendation",
  "return_to_recruiter",
  "place_hold",
  "remove_hold",
  "mark_paperwork_review_approved",
  "mark_onboarding_exception_reviewed",
  "mark_mel_ready_review_approved",
]);

export function canViewQueue(role: P1863ProductRole, queueId: P1863QueueId): boolean {
  const access = QUEUE_ACCESS[role];
  if (access === "all") return true;
  return access.has(queueId);
}

export function canPerformAction(role: P1863ProductRole, action: P1863OperatorAction): boolean {
  return ACTION_ACCESS[role]?.has(action) ?? false;
}

export function isProductionWriteAction(action: P1863OperatorAction): boolean {
  return WRITE_ACTIONS.has(action);
}

export function listAllowedActions(role: P1863ProductRole): P1863OperatorAction[] {
  return [...(ACTION_ACCESS[role] ?? [])];
}
