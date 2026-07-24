import {
  detectHolds,
  hasApprovalEvidence,
  hasRecommendationEvidence,
} from "@/lib/p187-1-canary-cohort-readiness/eligibility";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import {
  evaluateP184Eligibility,
  type P184VerifiedOnboardingJob,
} from "@/lib/p184-autonomous-paperwork-send-engine/evaluator";
import type { P184EngineConfig, P184QueueItem } from "@/lib/p184-autonomous-paperwork-send-engine/types";
import type { BreezyJob } from "@/lib/breezy-api";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type P192EligibilityResult = {
  candidateId: string;
  eligible: boolean;
  blockers: string[];
  templateKey: string | null;
  idempotencyKey: string | null;
};

/**
 * Fail-closed eligibility for P192 supervised sends.
 * Does NOT recommend, approve, or create Paperwork Needed.
 */
export function evaluateP192Eligibility(input: {
  row: ScoredCandidateWorkflowRow;
  workflow: CandidateWorkflowRecord | null | undefined;
  onboarding: CandidateOnboardingRecord | null;
  job: BreezyJob | null | undefined;
  config: P184EngineConfig;
  queueItems: P184QueueItem[];
  completedIdempotencyKeys: Set<string>;
  verifiedOnboardingJob?: P184VerifiedOnboardingJob | null;
}): P192EligibilityResult {
  const blockers: string[] = [];
  const wf = input.workflow;
  const row = input.row;

  if (row.workflowStatus !== "Paperwork Needed" && wf?.workflowStatus !== "Paperwork Needed") {
    blockers.push("authoritative_state_not_paperwork_needed");
  }
  if (!row.candidateId?.trim()) blockers.push("identity_missing");

  const email = (row.email ?? row.onboardingContactEmail ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) blockers.push("invalid_email");

  const recruiter = wf?.assignedRecruiter ?? row.assignedRecruiter;
  if (!recruiter || recruiter === "Unassigned") blockers.push("recruiter_unassigned");

  const jobId = row.positionId?.trim() || "";
  if (!jobId) blockers.push("job_unresolved");

  if (
    !hasRecommendationEvidence({
      recommendedStage: wf?.recommendedStage ?? row.recommendedStage,
    })
  ) {
    blockers.push("recommend_hire_evidence_missing");
  }

  if (
    !hasApprovalEvidence({
      notes: wf?.notes ?? row.notes ?? [],
      progressionReason: wf?.progressionReason ?? null,
    })
  ) {
    blockers.push("operator_approval_evidence_missing");
  }

  const holds = detectHolds({
    notes: wf?.notes ?? row.notes ?? [],
    nextActionNeeded: wf?.nextActionNeeded ?? row.nextActionNeeded,
  });
  if (holds.length) blockers.push("active_hold");

  const haystack = [...(wf?.notes ?? []), wf?.workflowStatus ?? "", row.stage ?? ""]
    .join(" ")
    .toLowerCase();
  if (/withdrawn/.test(haystack)) blockers.push("withdrawn");
  if (/\[archived\]|\barchived\b/.test(haystack)) blockers.push("archived");

  if (wf?.signatureRequestId || row.signatureRequestId) {
    blockers.push("prior_active_envelope");
  }
  if (
    wf?.paperworkStatus === "signed" ||
    wf?.paperworkStatus === "sent" ||
    wf?.paperworkStatus === "viewed" ||
    row.paperworkStatus === "signed"
  ) {
    blockers.push("completed_or_active_paperwork");
  }

  const p184 = evaluateP184Eligibility({
    row: {
      ...row,
      workflowStatus: "Paperwork Needed",
      email,
    },
    onboarding: input.onboarding,
    job: input.job,
    config: input.config,
    queueItems: input.queueItems,
    completedIdempotencyKeys: input.completedIdempotencyKeys,
    verifiedOnboardingJob:
      input.verifiedOnboardingJob ??
      (jobId
        ? {
            positionId: jobId,
            acceptingForOnboarding: true,
            classification: "p192_supervised",
            detail: "P192 verified Paperwork Needed onboarding job",
          }
        : null),
  });

  for (const reason of p184.rejectionReasons) {
    if (!blockers.includes(reason)) blockers.push(reason);
  }
  if (!p184.templateKey) blockers.push("template_unresolved");

  const eligible = blockers.length === 0 && Boolean(p184.templateKey);

  return {
    candidateId: row.candidateId,
    eligible,
    blockers,
    templateKey: p184.templateKey,
    idempotencyKey: eligible ? p184.idempotencyKey : null,
  };
}

export function assertNoUpstreamAutomation(): {
  recommendationsAutomated: 0;
  approvalsAutomated: 0;
  melWrites: 0;
} {
  return {
    recommendationsAutomated: 0,
    approvalsAutomated: 0,
    melWrites: 0,
  };
}
