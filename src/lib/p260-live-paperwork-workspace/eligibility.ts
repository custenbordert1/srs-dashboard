import { hasUsableEmail, isUnassignedDm } from "@/lib/p224-controlled-preview/eligibility";
import {
  hasUsablePhone,
  isUnassignedRecruiter,
} from "@/lib/p228-production-readiness/eligibility";
import { resolveTypedConfirmReasons } from "@/lib/p260-live-paperwork-workspace/confirmation";
import { buildP260IdempotencyKey } from "@/lib/p260-live-paperwork-workspace/idempotency";
import type {
  P260CandidateSnapshot,
  P260Eligibility,
  P260HardBlocker,
} from "@/lib/p260-live-paperwork-workspace/types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Production eligibility for a single Job Command Center send.
 * Hard-blocks active/viewed/signed, duplicates, missing identity/email/template gates,
 * coverage unknown, and distance > 60. Distance 40–60 / expired / recovered / nonstandard
 * require typed confirmation instead of silent bypass.
 */
export function evaluateP260Eligibility(
  snapshot: P260CandidateSnapshot,
  options?: { nonstandardOverride?: boolean },
): P260Eligibility {
  const hardBlockers: P260HardBlocker[] = [];
  const nameOk = Boolean(snapshot.name.trim()) && !/^unknown$/i.test(snapshot.name);
  if (!nameOk) hardBlockers.push("missing_identity");
  if (!hasUsableEmail(snapshot.email) || !EMAIL_RE.test(snapshot.email.trim())) {
    hardBlockers.push("missing_email");
  }
  if (!hasUsablePhone(snapshot.phone)) hardBlockers.push("missing_phone");
  if (isUnassignedRecruiter(snapshot.recruiter)) hardBlockers.push("missing_recruiter");
  if (isUnassignedDm(snapshot.districtManager)) hardBlockers.push("missing_dm");
  if (!snapshot.templateKey.trim()) hardBlockers.push("missing_template");

  const signed =
    snapshot.paperworkStatus === "signed" ||
    Boolean(snapshot.paperworkSignedAt) ||
    snapshot.workflowStatus === "Signed" ||
    snapshot.dropboxStatus === "signed" ||
    snapshot.dropboxStatus === "complete";
  const viewed =
    snapshot.paperworkStatus === "viewed" ||
    Boolean(snapshot.paperworkViewedAt) ||
    snapshot.dropboxStatus === "viewed" ||
    snapshot.dropboxStatus === "partially_signed";
  const activePacket =
    Boolean(snapshot.signatureRequestId) &&
    !snapshot.priorExpiredPacket &&
    (snapshot.paperworkStatus === "sent" ||
      snapshot.paperworkStatus === "viewed" ||
      snapshot.workflowStatus === "Paperwork Sent" ||
      Boolean(snapshot.paperworkSentAt));

  if (signed) hardBlockers.push("signed_packet");
  else if (viewed && !snapshot.priorExpiredPacket) hardBlockers.push("viewed_packet");
  else if (activePacket) hardBlockers.push("active_packet");

  if (snapshot.workflowStatus !== "Paperwork Needed" && !snapshot.priorExpiredPacket) {
    hardBlockers.push("not_paperwork_needed");
  }

  if (snapshot.nearestMiles != null && snapshot.nearestMiles > 60) {
    hardBlockers.push("distance_over_60");
  }
  if (!snapshot.coverageKnown || snapshot.nearestMiles == null) {
    hardBlockers.push("coverage_blocked");
  }

  const typedConfirmReasons = resolveTypedConfirmReasons({
    nearestMiles: snapshot.nearestMiles,
    priorExpiredPacket: snapshot.priorExpiredPacket,
    manuallyRecovered: snapshot.manuallyRecovered,
    nonstandardOverride: options?.nonstandardOverride === true,
  });

  // Distance 40–60 is not a hard block when typed confirm will be supplied.
  const uniqueHard = [...new Set(hardBlockers)];
  const eligible = uniqueHard.length === 0;
  const requiresTypedConfirm = typedConfirmReasons.length > 0;

  return {
    eligible,
    hardBlockers: uniqueHard,
    typedConfirmReasons,
    requiresTypedConfirm,
    detail: eligible
      ? requiresTypedConfirm
        ? `Eligible with typed confirmation (${typedConfirmReasons.join(", ")}).`
        : "Eligible for production Dropbox Sign send."
      : `Blocked: ${uniqueHard.join(", ")}`,
    snapshot,
    idempotencyKey: buildP260IdempotencyKey(snapshot.candidateId, snapshot.templateKey),
  };
}
