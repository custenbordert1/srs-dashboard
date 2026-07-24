import type { BreezyCandidate } from "@/lib/breezy-api";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import type { DropboxSignRequestSummary } from "@/lib/dropbox-sign";
import { isOnboardingTemplateKey } from "@/lib/onboarding-template-registry";
import {
  isActiveInMel,
  isDoNotContact,
  isValidP245Email,
  resolveCandidateEmail,
  resolveCandidateName,
} from "@/lib/p245-onboarding-paperwork-reminders/eligibility";
import { extractFirstName } from "@/lib/p245-onboarding-paperwork-reminders/template";
import {
  buildP246IdempotencyKey,
  isCadenceSatisfied,
  nextReminderNumber,
} from "@/lib/p246-outstanding-paperwork-reminders/cadence";
import {
  candidateSignerStillOutstanding,
  isEligibleDropboxStatus,
  packetIncludesEmail,
} from "@/lib/p246-outstanding-paperwork-reminders/dropbox-status";
import {
  getPacketReminderState,
  hasIdempotencyKey,
} from "@/lib/p246-outstanding-paperwork-reminders/store";
import {
  P246_MAX_REMINDERS,
  P246_TERMINAL_DROPBOX_STATUSES,
  type P246CandidateEvaluation,
  type P246Disposition,
  type P246DropboxLiveStatus,
  type P246ReminderStore,
} from "@/lib/p246-outstanding-paperwork-reminders/types";

function disposition(
  reason: P246Disposition,
  detail: string,
): { eligibilityResult: P246Disposition; exclusionReason: string; eligible: false } {
  return { eligibilityResult: reason, exclusionReason: detail, eligible: false };
}

export function isIntendedOnboardingPacket(workflow: CandidateWorkflowRecord): boolean {
  const key = workflow.paperworkTemplateKey?.trim() ?? "";
  if (!key) return true; // legacy sends without template key still count as onboarding cohort
  return isOnboardingTemplateKey(key);
}

export function evaluateP246Eligibility(input: {
  workflow: CandidateWorkflowRecord;
  candidate: BreezyCandidate | null;
  store: P246ReminderStore;
  dropboxLiveStatus: P246DropboxLiveStatus | null;
  dropboxVerified: boolean;
  dropboxSummary: DropboxSignRequestSummary | null;
  dropboxError: string | null;
  reconciliationNote?: string | null;
  statusConflict?: boolean;
  nowMs?: number;
}): P246CandidateEvaluation {
  const nowMs = input.nowMs ?? Date.now();
  const { workflow, candidate, store } = input;
  const name = resolveCandidateName(workflow, candidate);
  const firstName = candidate?.firstName?.trim()
    ? candidate.firstName.trim()
    : extractFirstName(name);
  const email = resolveCandidateEmail(workflow, candidate);
  const signatureRequestId = workflow.signatureRequestId?.trim() || null;
  const reminder = signatureRequestId
    ? getPacketReminderState(store, workflow.candidateId, signatureRequestId)
    : null;

  const base: P246CandidateEvaluation = {
    candidateId: workflow.candidateId,
    candidateName: name,
    firstName,
    email,
    breezyPosition: candidate?.positionName?.trim() || null,
    breezyStage: candidate?.stage?.trim() || null,
    workflowStatus: workflow.workflowStatus,
    paperworkStatus: workflow.paperworkStatus,
    signatureRequestId,
    dropboxLiveStatus: input.dropboxLiveStatus,
    dropboxVerified: input.dropboxVerified,
    originalPaperworkSentAt: workflow.paperworkSentAt,
    lastReminderAt: reminder?.lastReminderAt ?? null,
    reminderCount: reminder?.reminderCount ?? 0,
    nextReminderNumber: null,
    eligibilityResult: "status_unverified",
    exclusionReason: null,
    eligible: false,
    idempotencyKey: null,
    packetStatusSource: input.dropboxVerified ? "dropbox" : "none",
    reconciliationNote: input.reconciliationNote ?? null,
    statusConflict: Boolean(input.statusConflict),
  };

  if (!signatureRequestId) {
    return { ...base, ...disposition("missing_signature_request", "No Dropbox Sign signatureRequestId") };
  }

  if (!isIntendedOnboardingPacket(workflow)) {
    return {
      ...base,
      ...disposition(
        "not_onboarding_packet",
        `paperworkTemplateKey=${workflow.paperworkTemplateKey} is not an onboarding packet`,
      ),
    };
  }

  if (!isValidP245Email(email)) {
    return {
      ...base,
      ...disposition("invalid_email", email ? `Invalid email: ${email}` : "Missing email"),
    };
  }

  if (isDoNotContact(workflow, candidate)) {
    return { ...base, ...disposition("do_not_contact", "Do Not Contact / opt-out marker found") };
  }

  if (isActiveInMel(workflow)) {
    return {
      ...base,
      ...disposition("active_in_mel", `workflowStatus=${workflow.workflowStatus}`),
    };
  }

  if (!input.dropboxVerified || !input.dropboxLiveStatus) {
    const failure = input.dropboxError?.includes("not configured")
      ? "system_configuration_error"
      : input.dropboxError
        ? "dropbox_status_lookup_failed"
        : "status_unverified";
    return {
      ...base,
      ...disposition(
        failure === "system_configuration_error" ? "system_configuration_error" : failure,
        input.dropboxError ?? "Live Dropbox Sign status could not be verified",
      ),
    };
  }

  const status = input.dropboxLiveStatus;

  if (status === "signed" || status === "complete") {
    return { ...base, ...disposition("signed_or_completed", `Dropbox status=${status}`) };
  }
  if (status === "declined") {
    return { ...base, ...disposition("declined", "Dropbox packet declined") };
  }
  if (status === "cancelled") {
    return { ...base, ...disposition("cancelled", "Dropbox packet cancelled") };
  }
  if (status === "voided") {
    return { ...base, ...disposition("voided", "Dropbox packet voided") };
  }
  if (status === "expired") {
    return { ...base, ...disposition("expired", "Dropbox packet expired") };
  }
  if (status === "deleted") {
    return { ...base, ...disposition("deleted", "Dropbox packet deleted") };
  }
  if (status === "invalid") {
    return { ...base, ...disposition("invalid_packet", "Dropbox packet invalid") };
  }
  if (status === "error") {
    return { ...base, ...disposition("error_status", "Dropbox packet error status") };
  }
  if (status === "unknown" || !isEligibleDropboxStatus(status)) {
    if (P246_TERMINAL_DROPBOX_STATUSES.has(status)) {
      return {
        ...base,
        ...disposition("packet_not_outstanding", `Dropbox status=${status} is terminal / not outstanding`),
      };
    }
    return {
      ...base,
      ...disposition("packet_not_outstanding", `Dropbox status=${status} is not reminder-eligible`),
    };
  }

  if (!input.dropboxSummary || !packetIncludesEmail(input.dropboxSummary, email!)) {
    return {
      ...base,
      ...disposition(
        "packet_email_mismatch",
        `Candidate email ${email} is not a signer on signature request ${signatureRequestId}`,
      ),
    };
  }

  if (status === "partially_signed") {
    if (!candidateSignerStillOutstanding(input.dropboxSummary, email!)) {
      return {
        ...base,
        ...disposition(
          "signed_or_completed",
          "Candidate signer already signed; other signers may remain outstanding",
        ),
      };
    }
  }

  if (!isEligibleDropboxStatus(status)) {
    return {
      ...base,
      ...disposition("packet_not_outstanding", `Dropbox status=${status} is not reminder-eligible`),
    };
  }

  if (reminder?.needsRecruiterFollowUp) {
    return {
      ...base,
      ...disposition("needs_recruiter_follow_up", "Already routed to recruiter follow-up after Reminder 4"),
    };
  }

  if ((reminder?.reminderCount ?? 0) >= P246_MAX_REMINDERS) {
    return {
      ...base,
      nextReminderNumber: null,
      ...disposition(
        "maximum_reminders_reached",
        `Already sent ${reminder?.reminderCount ?? 0} automated reminders for this signature request`,
      ),
    };
  }

  const next = nextReminderNumber(reminder?.reminderCount ?? 0);
  if (!next) {
    return {
      ...base,
      ...disposition("maximum_reminders_reached", "No further automated reminders allowed"),
    };
  }

  const idempotencyKey = buildP246IdempotencyKey(workflow.candidateId, signatureRequestId, next);
  if (hasIdempotencyKey(store, workflow.candidateId, signatureRequestId, idempotencyKey)) {
    return {
      ...base,
      nextReminderNumber: next,
      idempotencyKey,
      ...disposition(
        "duplicate_reminder_prevented",
        `Idempotency key already used: ${idempotencyKey}`,
      ),
    };
  }

  const cadence = isCadenceSatisfied({
    nextReminderNumber: next,
    originalPaperworkSentAt: workflow.paperworkSentAt,
    lastReminderAt: reminder?.lastReminderAt ?? null,
    nowMs,
  });

  if (!cadence.ok) {
    if (cadence.reason === "missing_original_send_date") {
      return {
        ...base,
        nextReminderNumber: next,
        idempotencyKey,
        ...disposition("missing_original_send_date", "paperworkSentAt is missing; cannot verify Reminder 1 cadence"),
      };
    }
    const hoursLeft = Number.isFinite(cadence.remainingMs)
      ? Math.ceil(cadence.remainingMs / (60 * 60 * 1000))
      : null;
    return {
      ...base,
      nextReminderNumber: next,
      idempotencyKey,
      ...disposition(
        next === 1 || (reminder?.reminderCount ?? 0) === 0 ? "cooldown_not_met" : "recently_reminded",
        `Cadence not met for Reminder ${next}${hoursLeft != null ? ` (~${hoursLeft}h remaining)` : ""}`,
      ),
    };
  }

  return {
    ...base,
    eligible: true,
    eligibilityResult: "eligible",
    exclusionReason: null,
    nextReminderNumber: next,
    idempotencyKey,
  };
}
