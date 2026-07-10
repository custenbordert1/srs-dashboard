import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { normalizeP1851Stage } from "@/lib/p185-1-paperwork-eligibility-recovery/stageNormalization";
import type { P1851JobMappingResult } from "@/lib/p185-1-paperwork-eligibility-recovery/types";
import type { P1851EnvelopeLifecycle } from "@/lib/p185-1-paperwork-eligibility-recovery/types";
import type {
  P1852EvidenceItem,
  P1852SelectionClass,
  P1852SelectionConfidence,
  P1852SelectionResolution,
} from "@/lib/p185-2-selected-hire-recovery/types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const AUTHORITATIVE_STAGES = new Set([
  "selected",
  "approved",
  "hiring",
  "paperwork_needed",
]);

const ACTIVE_PACKET: Set<P1851EnvelopeLifecycle> = new Set([
  "sent_unverified",
  "confirmed_sent",
  "viewed",
]);

function bucketFor(c: P1852SelectionClass): P1852SelectionResolution["reviewBucket"] {
  switch (c) {
    case "verified_selected_new_packet":
      return "A";
    case "template_blocked":
      return "B";
    case "unresolved_job":
      return "C";
    case "likely_selected_needs_review":
      return "D";
    case "conflicting_selection_state":
    case "withdrawn_after_selection":
      return "E";
    case "verified_selected_existing_packet":
      return "F";
    case "verified_selected_completed_packet":
      return "G";
    case "hired_without_paperwork":
      return "I";
    default:
      return "H";
  }
}

function confidenceFromAuth(count: number): P1852SelectionConfidence {
  if (count >= 2) return "high";
  if (count === 1) return "high";
  return "none";
}

/**
 * Deterministic selection-evidence resolver.
 * Supporting evidence alone never authorizes sending.
 */
export function resolveP1852Selection(input: {
  row: ScoredCandidateWorkflowRow;
  evidence: P1852EvidenceItem[];
  mapping: P1851JobMappingResult;
  envelopeLifecycle: P1851EnvelopeLifecycle | null;
  templateReady: boolean;
  templateBlockingReason?: string | null;
}): P1852SelectionResolution {
  const { row, mapping } = input;
  const normalizedStage = normalizeP1851Stage(row.workflowStatus || row.stage);
  const authoritative: P1852EvidenceItem[] = [];
  const supporting: P1852EvidenceItem[] = [];
  const conflicting: P1852EvidenceItem[] = [];

  for (const item of input.evidence) {
    if (item.authority === "authoritative") authoritative.push(item);
    else if (item.authority === "supporting") supporting.push(item);
    else if (item.authority === "ambiguous") conflicting.push(item);
  }

  // Exact workflow stages that are authoritative when present
  if (AUTHORITATIVE_STAGES.has(normalizedStage)) {
    authoritative.push({
      source: "breezy_workflow_current_stage",
      authority: "authoritative",
      detail: `Current workflow status: ${row.workflowStatus}`,
      timestamp: row.updatedDate ?? null,
      actor: null,
    });
  }

  const email = (row.email ?? row.onboardingContactEmail ?? "").trim().toLowerCase();
  const emailValid = EMAIL_RE.test(email);
  const blockingReasons: string[] = [];

  const primary = authoritative[0] ?? null;
  const hasAuth = authoritative.length > 0;
  const selectionConfidence = hasAuth
    ? confidenceFromAuth(authoritative.length)
    : supporting.length > 0
      ? "low"
      : "none";

  const base = (
    classification: P1852SelectionClass,
    opts: Partial<P1852SelectionResolution>,
  ): P1852SelectionResolution => ({
    candidateId: row.candidateId,
    currentStage: row.workflowStatus || row.stage || "",
    normalizedStage,
    authoritativeEvidence: authoritative,
    supportingEvidence: supporting,
    conflictingEvidence: conflicting,
    evidenceSource: primary?.source ?? null,
    evidenceTimestamp: primary?.timestamp ?? null,
    actor: primary?.actor ?? null,
    selectionConfidence,
    proposedPaperworkAction: opts.proposedPaperworkAction ?? "none",
    canAutoNormalize: opts.canAutoNormalize ?? false,
    requiresHumanReview: opts.requiresHumanReview ?? false,
    blockingReasons: opts.blockingReasons ?? blockingReasons,
    classification,
    reviewBucket: bucketFor(classification),
  });

  if (normalizedStage === "withdrawn" || normalizedStage === "archived" || normalizedStage === "not_qualified") {
    if (hasAuth) {
      conflicting.push({
        source: "current_stage",
        authority: "ambiguous",
        detail: `Withdrawn/archived after selection (${row.workflowStatus})`,
        timestamp: null,
        actor: null,
      });
      return base("withdrawn_after_selection", {
        requiresHumanReview: true,
        blockingReasons: ["Withdrawn or archived after selection evidence."],
        proposedPaperworkAction: "exception_review",
      });
    }
    return base("blocked_other", {
      blockingReasons: ["Withdrawn, archived, or not qualified."],
    });
  }

  if (normalizedStage === "hired" || normalizedStage === "ready_for_mel") {
    return base("hired_without_paperwork", {
      requiresHumanReview: true,
      proposedPaperworkAction: "exception_review",
      blockingReasons: ["Hired / Ready for MEL — explicit missing-paperwork confirmation required."],
    });
  }

  if (
    input.envelopeLifecycle === "signed" ||
    row.paperworkStatus === "signed" ||
    normalizedStage === "signed" ||
    normalizedStage === "completed"
  ) {
    return base(hasAuth ? "verified_selected_completed_packet" : "verified_selected_completed_packet", {
      proposedPaperworkAction: "none",
      blockingReasons: hasAuth ? ["Paperwork already completed."] : ["Paperwork completed."],
    });
  }

  if (
    (input.envelopeLifecycle && ACTIVE_PACKET.has(input.envelopeLifecycle)) ||
    Boolean(row.signatureRequestId) ||
    row.paperworkStatus === "sent" ||
    row.paperworkStatus === "viewed" ||
    normalizedStage === "paperwork_sent" ||
    normalizedStage === "awaiting_signature" ||
    Boolean(row.paperworkSentAt)
  ) {
    return base("verified_selected_existing_packet", {
      proposedPaperworkAction: "monitor_envelope",
      blockingReasons: [
        `Active or prior packet present (${input.envelopeLifecycle ?? row.paperworkStatus ?? "sent"}).`,
      ],
    });
  }

  if (!hasAuth) {
    if (supporting.length > 0) {
      return base("likely_selected_needs_review", {
        requiresHumanReview: true,
        proposedPaperworkAction: "operator_confirm",
        blockingReasons: ["Supporting evidence only — operator confirmation required."],
      });
    }
    return base("applied_not_selected", {
      proposedPaperworkAction: "await_selection",
      blockingReasons: ["No authoritative hiring-selection evidence."],
    });
  }

  if (!emailValid) {
    return base("missing_contact", {
      requiresHumanReview: true,
      blockingReasons: [email ? "Invalid email." : "Email missing."],
      proposedPaperworkAction: "fix_email",
    });
  }

  if (!mapping.resolvedPositionId || mapping.mappingMethod === "unresolved" || mapping.ambiguity) {
    return base("unresolved_job", {
      requiresHumanReview: true,
      blockingReasons: ["Selected candidate has unresolved or ambiguous job mapping."],
      proposedPaperworkAction: "resolve_job",
    });
  }

  if (!input.templateReady) {
    return base("template_blocked", {
      requiresHumanReview: true,
      blockingReasons: [input.templateBlockingReason ?? "Required template not ready."],
      proposedPaperworkAction: "configure_template",
    });
  }

  if (!mapping.acceptingForOnboarding && mapping.onboardingJobClassification === "unknown") {
    return base("unresolved_job", {
      requiresHumanReview: true,
      blockingReasons: ["Onboarding job state unknown."],
      proposedPaperworkAction: "resolve_job",
    });
  }

  // Closed historical job OK when selected (acceptingForOnboarding from P185.1 mapping)
  return base("verified_selected_new_packet", {
    canAutoNormalize: true,
    proposedPaperworkAction: "normalize_and_enqueue",
    blockingReasons: [],
  });
}
