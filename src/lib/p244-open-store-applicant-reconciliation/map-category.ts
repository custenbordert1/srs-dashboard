import type { P243OsbpqBlockReason, P243OsbpqQueueItem } from "@/lib/p243-open-store-bulk-paperwork-queue/types";
import type { P244DispositionCategory } from "@/lib/p244-open-store-applicant-reconciliation/types";

/**
 * Map P243 block reasons → exactly one of the 17 P244 remaining categories.
 * Priority order is intentional (signed before sent, etc.).
 */
const PRIORITY: Array<{
  reason: P243OsbpqBlockReason | "__eligible__" | "__missing_recruiter__" | "__missing_dm__" | "__missing_ingestion__";
  category: P244DispositionCategory;
}> = [
  { reason: "already_signed", category: "already_signed" },
  { reason: "already_sent", category: "already_sent" },
  { reason: "active_signature", category: "already_sent" },
  { reason: "ready_for_mel", category: "ready_for_mel" },
  { reason: "active_mel", category: "active_in_mel" },
  { reason: "duplicate_identity", category: "duplicate_candidate" },
  { reason: "identity_conflict", category: "duplicate_candidate" },
  { reason: "invalid_email", category: "invalid_or_missing_email" },
  { reason: "ambiguous_match", category: "ambiguous_candidate_match" },
  { reason: "unresolved", category: "candidate_not_found" },
  { reason: "__missing_ingestion__", category: "missing_durable_ingestion" },
  { reason: "inactive_position", category: "inactive_or_archived_position" },
  { reason: "wrong_project", category: "location_or_store_mismatch" },
  { reason: "over_60_miles", category: "over_60_miles" },
  { reason: "__missing_recruiter__", category: "missing_recruiter" },
  { reason: "__missing_dm__", category: "missing_district_manager" },
  { reason: "not_qualified", category: "other_blocked" },
  { reason: "terminal_stage", category: "other_blocked" },
  { reason: "unsupported_stage", category: "other_blocked" },
  { reason: "other", category: "other_blocked" },
  { reason: "__eligible__", category: "eligible_not_sent" },
];

function isUnassigned(value: string | null | undefined): boolean {
  const v = String(value ?? "").trim().toLowerCase();
  return !v || v === "unassigned" || v === "none" || v === "n/a";
}

/**
 * Pick exactly one P244 category for a remaining-74 row.
 */
export function mapToP244Category(input: {
  item: P243OsbpqQueueItem;
  missingDurableIngestion?: boolean;
  forceApiCapacityDeferred?: boolean;
}): P244DispositionCategory {
  if (input.forceApiCapacityDeferred) return "api_capacity_deferred";

  const reasons = new Set(input.item.blockReasons);
  const detail = String(input.item.blockDetail ?? "").toLowerCase();

  // Explicit missing-ingestion signal (Melissa Lloyd / workflow absent)
  if (
    input.missingDurableIngestion ||
    detail.includes("missing_durable") ||
    detail.includes("missing ingestion")
  ) {
    return "missing_durable_ingestion";
  }

  for (const entry of PRIORITY) {
    if (entry.reason === "__eligible__") {
      if (input.item.eligibility === "eligible" && reasons.size === 0) {
        return "eligible_not_sent";
      }
      continue;
    }
    if (entry.reason === "__missing_ingestion__") continue;
    if (entry.reason === "__missing_recruiter__") {
      if (
        reasons.size === 0 &&
        input.item.eligibility !== "eligible" &&
        isUnassigned(input.item.assignedRecruiter)
      ) {
        return "missing_recruiter";
      }
      continue;
    }
    if (entry.reason === "__missing_dm__") {
      if (
        reasons.size === 0 &&
        input.item.eligibility !== "eligible" &&
        isUnassigned(input.item.assignedDM)
      ) {
        return "missing_district_manager";
      }
      continue;
    }
    if (reasons.has(entry.reason as P243OsbpqBlockReason)) {
      return entry.category;
    }
  }

  if (input.item.eligibility === "eligible") return "eligible_not_sent";
  return "other_blocked";
}

export function recommendedActionForCategory(
  category: P244DispositionCategory | "p243_confirmed_send",
  canSendNow: boolean,
): string {
  switch (category) {
    case "p243_confirmed_send":
      return "No action — P243 send confirmed with signatureRequestId.";
    case "already_sent":
      return "No resend — verified active/completed Dropbox packet.";
    case "already_signed":
      return "Advance to Ready for MEL / MEL load if not already.";
    case "ready_for_mel":
      return "Continue MEL load path; do not resend paperwork.";
    case "active_in_mel":
      return "No paperwork action — already active/loaded in MEL.";
    case "duplicate_candidate":
      return "Use primary identity row; suppress duplicate sends.";
    case "invalid_or_missing_email":
      return "Obtain valid email before any send.";
    case "candidate_not_found":
      return "Locate in Breezy or confirm sheet match; then ingest.";
    case "missing_durable_ingestion":
      return "Recover durable ingestion/workflow, then re-score eligibility.";
    case "ambiguous_candidate_match":
      return "Operator must disambiguate Breezy identity before send.";
    case "inactive_or_archived_position":
      return "Republish/reattach active open-store position before send.";
    case "location_or_store_mismatch":
      return "Confirm correct open-store/project match before send.";
    case "over_60_miles":
      return "Requires explicit over-60 approval or closer store rematch.";
    case "missing_recruiter":
      return "Assign recruiter, then re-queue.";
    case "missing_district_manager":
      return "Assign district manager, then re-queue.";
    case "api_capacity_deferred":
      return "Retry when Dropbox safe capacity recovers (eligible_deferred_api_capacity).";
    case "eligible_not_sent":
      return canSendNow
        ? "Send via controlled ≤5 batch with capacity reserve."
        : "Eligible but waiting on capacity/batch slot.";
    case "other_blocked":
      return "Review specific blockDetail; resolve blocker manually.";
    default:
      return "Review disposition detail.";
  }
}

export function emptyCategoryCounts(): Record<P244DispositionCategory, number> {
  return {
    already_sent: 0,
    already_signed: 0,
    ready_for_mel: 0,
    active_in_mel: 0,
    duplicate_candidate: 0,
    invalid_or_missing_email: 0,
    candidate_not_found: 0,
    missing_durable_ingestion: 0,
    ambiguous_candidate_match: 0,
    inactive_or_archived_position: 0,
    location_or_store_mismatch: 0,
    over_60_miles: 0,
    missing_recruiter: 0,
    missing_district_manager: 0,
    api_capacity_deferred: 0,
    eligible_not_sent: 0,
    other_blocked: 0,
  };
}
