import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { hasApprovalEvidence } from "@/lib/p187-1-canary-cohort-readiness/eligibility";
import {
  P188_1_RECOMMENDED_STAGE,
  type P1881CandidateContext,
} from "@/lib/p188-1-hiring-recommendation-workflow/types";

const STALE_MS = 14 * 24 * 60 * 60 * 1000;
const PAPERWORK_ACTIVE = new Set(["sent", "viewed", "signed", "failed"]);

export type ContextEnrichment = {
  jobId?: string | null;
  jobLabel?: string | null;
  jobResolved?: boolean;
  recruiterId?: string | null;
  recruiterResolved?: boolean;
  identityResolved?: boolean;
  reviewCompleted?: boolean;
  holdFlags?: string[];
  withdrawn?: boolean;
  archived?: boolean;
  conflictingOperation?: boolean;
  expectedProductionRecordVersion?: string | null;
  nowMs?: number;
};

/**
 * Build Recommend Hire validation context from a workflow record + optional enrichments.
 */
export function buildCandidateContextFromWorkflow(
  wf: CandidateWorkflowRecord | null | undefined,
  candidateId: string,
  enrichment: ContextEnrichment = {},
): P1881CandidateContext {
  const nowMs = enrichment.nowMs ?? Date.now();
  const notes = wf?.notes ?? [];
  const recommendedStage = wf?.recommendedStage ?? null;
  const hasPriorRecommendation = Boolean(
    recommendedStage?.trim() &&
      (/hiring recommendation|recommend.?hire|recommend_hire/i.test(recommendedStage) ||
        recommendedStage === P188_1_RECOMMENDED_STAGE),
  );
  const hasPriorOperatorApproval = hasApprovalEvidence({
    notes,
    progressionReason: wf?.progressionReason ?? null,
  });
  const paperworkStatus = wf?.paperworkStatus ?? "not_sent";
  const paperworkActive =
    PAPERWORK_ACTIVE.has(paperworkStatus) ||
    Boolean(wf?.paperworkSentAt) ||
    Boolean(wf?.signatureRequestId) ||
    wf?.workflowStatus === "Paperwork Needed" ||
    wf?.workflowStatus === "Paperwork Sent" ||
    wf?.workflowStatus === "Signed";

  const holdFlags = [...(enrichment.holdFlags ?? [])];
  for (const n of notes) {
    if (/\[HOLD\]|recruiter hold|dm hold|executive hold|client hold/i.test(n)) {
      holdFlags.push(n.slice(0, 80));
    }
  }

  const withdrawn =
    enrichment.withdrawn ??
    (notes.some((n) => /withdrawn/i.test(n)) ||
      /withdrawn/i.test(wf?.nextActionNeeded ?? ""));
  const archived =
    enrichment.archived ?? notes.some((n) => /\[ARCHIVED\]|archived/i.test(n));

  const assigned = enrichment.recruiterId ?? wf?.assignedRecruiter ?? null;
  const recruiterResolved =
    enrichment.recruiterResolved ??
    Boolean(assigned?.trim() && assigned !== "Unassigned");

  const jobId = enrichment.jobId ?? null;
  const jobResolved = enrichment.jobResolved ?? Boolean(jobId?.trim());

  const updatedAt = wf?.updatedAt ?? null;
  const updatedMs = updatedAt ? Date.parse(updatedAt) : NaN;
  const stale = !Number.isFinite(updatedMs) || nowMs - updatedMs > STALE_MS;

  const productionRecordVersion = wf
    ? `${wf.updatedAt}:${wf.workflowStatus}:${(wf.history ?? []).length}:${wf.recommendedStage ?? ""}`
    : "missing";

  const reviewCompleted =
    enrichment.reviewCompleted ??
    (wf?.workflowStatus === "Needs Review" ||
      wf?.workflowStatus === "Qualified" ||
      Boolean(wf?.lastActionAt) ||
      (wf?.history ?? []).some((h) => /review|qualified|needs review/i.test(h.message)));

  return {
    candidateId,
    workflowExists: Boolean(wf),
    workflowStatus: wf?.workflowStatus ?? null,
    recommendedStage,
    progressionReason: wf?.progressionReason ?? null,
    notes,
    assignedRecruiter: wf?.assignedRecruiter ?? null,
    assignedDM: wf?.assignedDM ?? null,
    recruiterResolved,
    recruiterId: recruiterResolved ? assigned : null,
    jobResolved,
    jobId: jobResolved ? jobId : null,
    jobLabel: enrichment.jobLabel ?? null,
    identityResolved: enrichment.identityResolved ?? Boolean(candidateId.trim()),
    reviewCompleted,
    holdFlags: [...new Set(holdFlags)],
    withdrawn,
    archived,
    hasPriorRecommendation,
    hasPriorOperatorApproval,
    paperworkActive,
    paperworkStatus,
    conflictingOperation: Boolean(enrichment.conflictingOperation),
    productionRecordVersion,
    expectedProductionRecordVersion: enrichment.expectedProductionRecordVersion ?? null,
    stale,
    updatedAt,
    lastActionAt: wf?.lastActionAt ?? null,
  };
}
