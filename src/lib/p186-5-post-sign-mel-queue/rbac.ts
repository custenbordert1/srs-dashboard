import type {
  P1865OperatorAction,
  P1865ProductRole,
  P1865QueueId,
} from "@/lib/p186-5-post-sign-mel-queue/types";
import type { UserRole } from "@/lib/auth/types";

export function toP1865ProductRole(sessionRole: UserRole, preferOperator = false): P1865ProductRole {
  if (sessionRole === "executive") return preferOperator ? "operator" : "executive";
  if (sessionRole === "recruiter") return "recruiter";
  if (sessionRole === "dm") return "dm";
  return "read_only_viewer";
}

const QUEUE_ACCESS: Record<P1865ProductRole, ReadonlySet<P1865QueueId> | "all"> = {
  executive: "all",
  operator: "all",
  recruiter: new Set([
    "signed_ready_onboarding_validation",
    "signed_missing_documents",
    "post_sign_reconciliation_exceptions",
  ]),
  dm: new Set([
    "signed_ready_onboarding_validation",
    "signed_missing_documents",
    "signed_conflicting",
    "ready_for_mel_review",
    "mel_export_blocked",
  ]),
  read_only_viewer: "all",
};

const ACTION_ACCESS: Record<P1865ProductRole, ReadonlySet<P1865OperatorAction>> = {
  read_only_viewer: new Set(["view"]),
  recruiter: new Set(["view", "request_missing_documents", "add_note"]),
  dm: new Set([
    "view",
    "place_onboarding_hold",
    "clear_onboarding_hold",
    "return_for_correction",
    "add_note",
    "request_missing_documents",
  ]),
  operator: new Set([
    "view",
    "approve_onboarding_completion",
    "reject_onboarding_completion",
    "request_missing_documents",
    "place_onboarding_hold",
    "clear_onboarding_hold",
    "approve_ready_for_mel",
    "return_for_correction",
    "acknowledge_exception",
    "assign_investigation_owner",
    "add_note",
  ]),
  executive: new Set([
    "view",
    "approve_onboarding_completion",
    "reject_onboarding_completion",
    "request_missing_documents",
    "place_onboarding_hold",
    "clear_onboarding_hold",
    "approve_ready_for_mel",
    "return_for_correction",
    "acknowledge_exception",
    "assign_investigation_owner",
    "add_note",
  ]),
};

export function canViewP1865Queue(role: P1865ProductRole, queueId: P1865QueueId): boolean {
  const access = QUEUE_ACCESS[role];
  if (access === "all") return true;
  return access.has(queueId);
}

export function canPerformP1865Action(
  role: P1865ProductRole,
  action: P1865OperatorAction,
): boolean {
  return ACTION_ACCESS[role]?.has(action) ?? false;
}
