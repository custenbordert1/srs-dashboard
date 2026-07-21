import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";

const TERMINAL = new Set([
  "Not Qualified",
  "Active Rep",
  "Loaded in MEL",
  "Withdrawn",
  "Archived",
]);

const PAST_SENT_STAGES = new Set([
  "Paperwork Sent",
  "Signed",
  "Awaiting DD Verification",
  "Ready for MEL",
  "Loaded in MEL",
  "Training Needed",
  "Active Rep",
]);

/**
 * State-machine gate before re-scoring / sending.
 * Returns null when eligible to continue; otherwise a skip reason.
 */
export function evaluateP243StateMachine(row: ScoredCandidateWorkflowRow): string | null {
  const stage = String(row.workflowStatus ?? "");
  const paperwork = String(row.paperworkStatus ?? "not_sent");
  const sig = String(row.signatureRequestId ?? "").trim();

  if (TERMINAL.has(stage)) return `terminal_stage:${stage}`;
  if (PAST_SENT_STAGES.has(stage)) return `past_sent_stage:${stage}`;
  if (paperwork === "sent" || paperwork === "viewed" || paperwork === "signed") {
    return `paperwork_status:${paperwork}`;
  }
  if (sig) return "signature_request_exists";
  if (!["Applied", "Needs Review", "Qualified", "Paperwork Needed"].includes(stage)) {
    return `unsupported_stage:${stage || "empty"}`;
  }
  return null;
}

/** Hard block — never send paperwork twice. */
export function isNeverSendTwiceBlocked(row: ScoredCandidateWorkflowRow): boolean {
  const reason = evaluateP243StateMachine(row);
  if (!reason) return false;
  return (
    reason.startsWith("paperwork_status:") ||
    reason === "signature_request_exists" ||
    reason.startsWith("past_sent_stage:")
  );
}
