import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type {
  P1851CandidateRecovery,
  P1851EnvelopeLifecycle,
  P1851HiringEvidence,
  P1851JobMappingResult,
  P1851PaperworkNeedClass,
} from "@/lib/p185-1-paperwork-eligibility-recovery/types";
import { normalizeP1851Stage } from "@/lib/p185-1-paperwork-eligibility-recovery/stageNormalization";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ACTIVE_ENVELOPE: Set<P1851EnvelopeLifecycle> = new Set([
  "sent_unverified",
  "confirmed_sent",
  "viewed",
]);

const TERMINAL_BAD: Set<P1851EnvelopeLifecycle> = new Set([
  "declined",
  "canceled",
  "expired",
  "failed",
]);

function reviewBucket(classification: P1851PaperworkNeedClass): P1851CandidateRecovery["reviewBucket"] {
  switch (classification) {
    case "eligible_new_packet":
      return "A";
    case "eligible_replacement_packet":
      return "B";
    case "awaiting_hiring_approval":
    case "ambiguous_candidate_state":
      return "C";
    case "unresolved_job":
      return "D";
    case "already_active_packet":
    case "paperwork_completed":
      return "E";
    default:
      return "F";
  }
}

export function classifyP1851PaperworkNeed(input: {
  row: ScoredCandidateWorkflowRow;
  mapping: P1851JobMappingResult;
  hiringEvidence: P1851HiringEvidence;
  envelopeLifecycle: P1851EnvelopeLifecycle | null;
  completedIdempotency?: boolean;
  templateAvailable?: boolean;
}): P1851CandidateRecovery {
  const { row, mapping, hiringEvidence, envelopeLifecycle } = input;
  const normalizedStage = normalizeP1851Stage(row.workflowStatus || row.stage);
  const email = (row.email ?? row.onboardingContactEmail ?? "").trim().toLowerCase();
  const emailValid = EMAIL_RE.test(email);

  const mk = (
    classification: P1851PaperworkNeedClass,
    proposedAction: string,
    eligibilityNote: string,
  ): P1851CandidateRecovery => ({
    candidateId: row.candidateId,
    classification,
    normalizedStage,
    currentStage: row.workflowStatus || row.stage || "",
    mapping,
    hiringEvidence,
    envelopeLifecycle,
    proposedAction,
    eligibilityNote,
    reviewBucket: reviewBucket(classification),
  });

  if (normalizedStage === "withdrawn" || normalizedStage === "archived" || normalizedStage === "not_qualified") {
    return mk("withdrawn_or_archived", "none", "Candidate withdrawn, archived, or not qualified.");
  }
  if (normalizedStage === "hired" || normalizedStage === "ready_for_mel") {
    return mk("hired_no_action", "none", "Candidate already hired / ready for MEL.");
  }

  if (
    envelopeLifecycle === "signed" ||
    row.paperworkStatus === "signed" ||
    normalizedStage === "signed" ||
    normalizedStage === "completed"
  ) {
    return mk("paperwork_completed", "none", "Paperwork signed or completed.");
  }

  if (envelopeLifecycle && ACTIVE_ENVELOPE.has(envelopeLifecycle)) {
    return mk(
      "already_active_packet",
      "monitor_envelope",
      `Active envelope (${envelopeLifecycle}) — do not create another.`,
    );
  }

  if (row.signatureRequestId && !envelopeLifecycle) {
    return mk(
      "already_active_packet",
      "reconcile_envelope",
      "Signature request present but reconciliation incomplete — block duplicate send.",
    );
  }

  if (envelopeLifecycle && TERMINAL_BAD.has(envelopeLifecycle)) {
    if (hiringEvidence.present && mapping.resolvedPositionId && emailValid) {
      return mk(
        "eligible_replacement_packet",
        "replacement_review",
        `Envelope ${envelopeLifecycle} — replacement requires explicit operator approval.`,
      );
    }
    return mk(
      "eligible_replacement_packet",
      "replacement_review",
      `Envelope ${envelopeLifecycle} but hiring/job/email gates incomplete — review only.`,
    );
  }

  if (!emailValid) {
    return mk("invalid_contact", "fix_email", email ? "Invalid email format." : "Email missing.");
  }

  if (mapping.ambiguity || mapping.mappingMethod === "unresolved" || !mapping.resolvedPositionId) {
    if (hiringEvidence.present) {
      return mk("unresolved_job", "resolve_job_mapping", "Hiring evidence present but job unresolved.");
    }
    return mk("unresolved_job", "resolve_job_mapping", "Job mapping unresolved.");
  }

  if (!hiringEvidence.present) {
    if (normalizedStage === "applied" || normalizedStage === "review" || normalizedStage === "contacted") {
      return mk(
        "applied_not_selected",
        "await_selection",
        "No positive hiring-selection evidence — do not advance to Paperwork Needed.",
      );
    }
    if (normalizedStage === "interview" || normalizedStage === "unknown") {
      return mk(
        "awaiting_hiring_approval",
        "human_review",
        "Stage suggests progress but selection evidence missing — human review required.",
      );
    }
    return mk(
      "awaiting_hiring_approval",
      "human_review",
      "Missing hiring-selection evidence.",
    );
  }

  if (!mapping.acceptingForOnboarding) {
    return mk(
      "blocked_other",
      "review_job_state",
      `Job not accepting for onboarding (${mapping.onboardingJobClassification}).`,
    );
  }

  if (input.completedIdempotency) {
    return mk("blocked_other", "none", "Completed idempotency key present.");
  }

  if (input.templateAvailable === false) {
    return mk("blocked_other", "configure_template", "Required template unavailable.");
  }

  if (
    normalizedStage === "paperwork_needed" ||
    hiringEvidence.sources.some((s) => s.startsWith("workflow_status:Paperwork Needed")) ||
    hiringEvidence.present
  ) {
    // Eligible new packet only with full gate set
    return mk(
      "eligible_new_packet",
      "enqueue_p184",
      `Verified for new packet. Evidence: ${hiringEvidence.detail}`,
    );
  }

  return mk("ambiguous_candidate_state", "human_review", "Could not classify confidently.");
}
