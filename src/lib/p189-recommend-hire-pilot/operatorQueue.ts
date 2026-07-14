import { hasApprovalEvidence } from "@/lib/p187-1-canary-cohort-readiness/eligibility";
import { P188_1_RECOMMENDED_STAGE } from "@/lib/p188-1-hiring-recommendation-workflow/types";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import type { P189FrozenCohort } from "@/lib/p189-recommend-hire-pilot/types";

export type P189OperatorQueueItem = {
  candidateId: string;
  recruiter: string | null;
  job: string | null;
  cityState: string;
  currentStage: string | null;
  recommendedStage: string | null;
  readyForOperatorApproval: boolean;
  blocked: boolean;
  conflict: boolean;
  duplicate: boolean;
  blockers: string[];
};

export type P189OperatorQueueReport = {
  recommendationCount: number;
  readyForOperatorApproval: number;
  blocked: number;
  conflicts: number;
  duplicates: number;
  items: P189OperatorQueueItem[];
};

/**
 * Production Operator Approval queue view after Recommend Hire (read-only).
 * Does not perform Operator Approval.
 */
export function buildP189OperatorApprovalQueue(input: {
  cohort: P189FrozenCohort;
  workflowsById: Map<string, CandidateWorkflowRecord>;
  jobByCandidate?: Record<string, string | null>;
  cityStateByCandidate?: Record<string, string>;
}): P189OperatorQueueReport {
  const items: P189OperatorQueueItem[] = [];
  let ready = 0;
  let blocked = 0;
  let conflicts = 0;
  let duplicates = 0;
  let recommendationCount = 0;
  const seenRecommended = new Set<string>();

  for (const member of input.cohort.members) {
    const wf = input.workflowsById.get(member.candidateId);
    const isRecommended = wf?.recommendedStage === P188_1_RECOMMENDED_STAGE;
    let duplicate = false;
    if (isRecommended) {
      recommendationCount += 1;
      if (seenRecommended.has(member.candidateId)) {
        duplicate = true;
        duplicates += 1;
      }
      seenRecommended.add(member.candidateId);
    }

    const blockers: string[] = [];
    let conflict = false;

    if (!wf) blockers.push("workflow_missing");
    if (!isRecommended) blockers.push("not_recommended");
    if (
      wf &&
      hasApprovalEvidence({
        notes: wf.notes ?? [],
        progressionReason: wf.progressionReason,
      })
    ) {
      blockers.push("already_operator_approved");
      conflict = true;
    }
    if (
      wf &&
      (wf.paperworkStatus === "sent" ||
        wf.paperworkStatus === "viewed" ||
        Boolean(wf.paperworkSentAt) ||
        wf.workflowStatus === "Paperwork Needed" ||
        wf.workflowStatus === "Paperwork Sent")
    ) {
      blockers.push("paperwork_active_or_historical");
      conflict = true;
    }
    if (wf && (!wf.assignedRecruiter || wf.assignedRecruiter === "Unassigned")) {
      blockers.push("recruiter_unresolved");
    }

    const readyForOperatorApproval = isRecommended && blockers.length === 0;
    if (readyForOperatorApproval) ready += 1;
    else {
      blocked += 1;
      if (conflict) conflicts += 1;
    }

    items.push({
      candidateId: member.candidateId,
      recruiter: wf?.assignedRecruiter ?? member.recruiter,
      job: input.jobByCandidate?.[member.candidateId] ?? member.jobLabel ?? member.jobId,
      cityState:
        input.cityStateByCandidate?.[member.candidateId] ||
        [member.city, member.state].filter(Boolean).join(", ") ||
        "—",
      currentStage: wf?.workflowStatus ?? null,
      recommendedStage: wf?.recommendedStage ?? null,
      readyForOperatorApproval,
      blocked: !readyForOperatorApproval,
      conflict,
      duplicate,
      blockers,
    });
  }

  return {
    recommendationCount,
    readyForOperatorApproval: ready,
    blocked,
    conflicts,
    duplicates,
    items,
  };
}
