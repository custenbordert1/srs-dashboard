import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { P1851HiringEvidence } from "@/lib/p185-1-paperwork-eligibility-recovery/types";
import { normalizeP1851Stage } from "@/lib/p185-1-paperwork-eligibility-recovery/stageNormalization";

export type P1851HiringEvidenceInput = {
  row: ScoredCandidateWorkflowRow;
  /** Candidate IDs previously in P181/P152/P178 operator paperwork scopes */
  operatorQueueIds?: Set<string>;
  /** P109 approved mapping is job-mapping evidence only — not hiring selection. */
  hasP109ApprovedMapping?: boolean;
  /** Explicit recruiter/DM approval audit flags */
  approvalAuditSources?: string[];
  /** requiredAction / next action already indicates send paperwork */
  forceFromAction?: boolean;
};

/**
 * Positive hiring-selection evidence required before Paperwork Needed.
 * Missing evidence → human review (awaiting_hiring_approval / applied_not_selected), never auto-advance.
 */
export function collectP1851HiringEvidence(input: P1851HiringEvidenceInput): P1851HiringEvidence {
  const sources: string[] = [];
  const stage = normalizeP1851Stage(input.row.workflowStatus || input.row.stage);
  const action = `${input.row.requiredAction ?? ""} ${input.row.nextActionNeeded ?? ""} ${input.row.actionType ?? ""}`.toLowerCase();

  if (stage === "paperwork_needed") {
    sources.push("workflow_status:Paperwork Needed");
  }
  if (stage === "selected" || stage === "approved" || stage === "hiring") {
    sources.push(`workflow_status:${input.row.workflowStatus}`);
  }
  if (/send\s*paperwork|ready\s*for\s*onboarding|paperwork\s*needed/.test(action)) {
    sources.push(`action:${input.row.requiredAction || input.row.actionType || "paperwork"}`);
  }
  if (input.operatorQueueIds?.has(input.row.candidateId)) {
    sources.push("operator_queue:P181/P152/P178");
  }
  // Note: P109 approved mapping is intentionally NOT hiring-selection evidence.
  for (const src of input.approvalAuditSources ?? []) {
    sources.push(src);
  }
  if (input.forceFromAction) {
    sources.push("trusted_onboarding_next_action");
  }

  // recommendedStage alone is weak — only count with another signal
  if (
    normalizeP1851Stage(input.row.recommendedStage) === "paperwork_needed" &&
    sources.length > 0
  ) {
    sources.push("recommendedStage:Paperwork Needed");
  }

  return {
    present: sources.length > 0,
    sources: [...new Set(sources)],
    detail: sources.length > 0 ? sources.join("; ") : null,
  };
}
