import type { PaperworkStatus } from "@/lib/candidate-workflow-types";
import type {
  P193LifecycleState,
  P193PaperworkEnvelopeStatus,
} from "@/lib/p193-simplified-autonomous-lifecycle/types";

/**
 * Migration adapter: map legacy P186–P192 / CandidateWorkflowStatus
 * onto the simplified P193 lifecycle. Read-only projection — does not
 * mutate legacy modules.
 */
export function mapLegacyWorkflowToP193State(input: {
  workflowStatus?: string | null;
  recommendedStage?: string | null;
  paperworkStatus?: PaperworkStatus | string | null;
  signatureRequestId?: string | null;
  notes?: string[];
  p186State?: string | null;
}): P193LifecycleState {
  const status = (input.workflowStatus ?? "").trim();
  const paperwork = (input.paperworkStatus ?? "").toLowerCase();
  const notes = (input.notes ?? []).join(" ");
  const p186 = (input.p186State ?? "").toLowerCase();

  if (/\[HOLD\]|on hold/i.test(notes) || status.toLowerCase().includes("hold")) return "Hold";
  if (/not qualified|disqualified|rejected|withdrawn/i.test(status)) return "Rejected";
  if (paperwork === "expired" || /expired/i.test(status)) return "Expired";

  if (
    status === "Ready for MEL" ||
    status === "Loaded in MEL" ||
    status === "Training Needed" ||
    status === "Active Rep" ||
    /ready.?for.?assignment/i.test(status)
  ) {
    return "Ready For Assignment";
  }

  if (status === "Signed" || paperwork === "signed" || p186.includes("signed")) {
    return "Signed";
  }

  if (paperwork === "viewed" || status === "Paperwork Sent") {
    if (paperwork === "viewed") return "Awaiting Signature";
    return input.signatureRequestId ? "Awaiting Signature" : "Paperwork Sent";
  }

  if (paperwork === "sent") return "Paperwork Sent";

  if (status === "Paperwork Needed" || status === "Operator Approved") {
    return "Qualified";
  }

  if (
    status === "Qualified" ||
    /hire|recommend|qualified/i.test(input.recommendedStage ?? "")
  ) {
    return "Qualified";
  }

  if (status === "Needs Review" || /needs human|ai reviewing/i.test(status)) {
    return "Needs Human Review";
  }

  if (status === "Applied" || !status) return "Applied";

  // Conservative default for unknown legacy stages
  return "Needs Human Review";
}

export function mapPaperworkStatusToP193(
  paperworkStatus: PaperworkStatus | string | null | undefined,
): P193PaperworkEnvelopeStatus {
  switch ((paperworkStatus ?? "").toLowerCase()) {
    case "sent":
      return "sent";
    case "viewed":
      return "viewed";
    case "signed":
      return "signed";
    case "declined":
      return "declined";
    case "failed":
      return "failed";
    case "expired":
      return "expired";
    default:
      return "not_sent";
  }
}

/** Dashboard card grouping for envelopes in flight. */
export function mapStateToDashboardCard(
  state: P193LifecycleState,
  paperworkStatus: P193PaperworkEnvelopeStatus,
): string {
  if (state === "Applied") return "New Applicants";
  if (state === "AI Reviewing") return "AI Reviewing";
  if (state === "Qualified") return "Qualified";
  if (state === "Needs Human Review") return "Needs Human Review";
  if (state === "Expired") return "Expired";
  if (state === "Signed" || state === "Ready For Assignment") {
    return state === "Ready For Assignment" ? "Ready For Assignment" : "Signed";
  }
  if (paperworkStatus === "viewed") return "Viewed";
  if (state === "Paperwork Sent" || state === "Awaiting Signature") return "Paperwork Pending";
  if (state === "Rejected" || state === "Hold") return "Needs Human Review";
  return "New Applicants";
}
