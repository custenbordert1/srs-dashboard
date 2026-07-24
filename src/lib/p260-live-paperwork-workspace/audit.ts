import {
  P260_SOURCE,
  type P260AuditAction,
  type P260AuditEntry,
} from "@/lib/p260-live-paperwork-workspace/types";

export function pushP260Audit(
  trail: P260AuditEntry[],
  action: P260AuditAction,
  detail: string,
  candidateId: string | null = null,
  signatureRequestId?: string | null,
): void {
  trail.push({
    at: new Date().toISOString(),
    action,
    candidateId,
    detail,
    signatureRequestId: signatureRequestId ?? null,
    source: P260_SOURCE,
  });
}

export function formatP260ActivityTitle(action: P260AuditAction): string {
  switch (action) {
    case "preview_opened":
      return "Paperwork preview opened";
    case "confirm_shown":
      return "Send confirmation shown";
    case "typed_confirm_required":
      return "Typed confirmation required";
    case "confirm_cancelled":
      return "Send cancelled";
    case "pre_send_refresh":
      return "Pre-send refresh";
    case "preflight_checked":
      return "Production preflight checked";
    case "eligibility_evaluated":
      return "Eligibility evaluated";
    case "send_attempt":
      return "Paperwork send attempted";
    case "send_success":
      return "Paperwork sent";
    case "send_failed":
      return "Paperwork send failed";
    case "quota_blocked":
      return "Send blocked — Dropbox quota";
    case "credentials_blocked":
      return "Send blocked — credentials";
    case "packet_blocked":
      return "Send blocked — existing packet";
    case "idempotency_blocked":
      return "Send blocked — idempotency";
    case "timeout_reconcile":
      return "Send timeout reconciled";
    case "post_send_verify":
      return "Post-send Dropbox verified";
    case "workflow_paperwork_sent":
      return "Workflow set to Paperwork Sent";
    default:
      return action;
  }
}
