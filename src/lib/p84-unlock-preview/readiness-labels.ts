import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { BreezyJob } from "@/lib/breezy-api";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import { buildPaperworkSendEligibility } from "@/lib/autonomous-paperwork-send-engine/build-paperwork-send-eligibility";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";

export const READINESS_LABELS = {
  questionnaireReady: "Questionnaire Ready",
  workflowReady: "Workflow Ready",
  p84SendEligible: "P84 Send Eligible",
  paperworkAlreadySent: "Paperwork Already Sent",
} as const;

export type PaperworkReadinessClassification = {
  questionnaireReady: boolean;
  workflowReady: boolean;
  p84SendEligible: boolean;
  paperworkAlreadySent: boolean;
  labels: {
    questionnaireReady: typeof READINESS_LABELS.questionnaireReady;
    workflowReady: typeof READINESS_LABELS.workflowReady;
    p84SendEligible: typeof READINESS_LABELS.p84SendEligible;
    paperworkAlreadySent: typeof READINESS_LABELS.paperworkAlreadySent;
  };
};

function hasActivePaperwork(row: ScoredCandidateWorkflowRow): boolean {
  return Boolean(
    row.signatureRequestId &&
      (row.paperworkStatus === "sent" ||
        row.paperworkStatus === "viewed" ||
        row.workflowStatus === "Paperwork Sent"),
  );
}

export function isQuestionnaireReady(row: ScoredCandidateWorkflowRow): boolean {
  return row.candidateGrade.paperworkReady === true;
}

export function isWorkflowReady(row: ScoredCandidateWorkflowRow): boolean {
  return row.workflowStatus === "Paperwork Needed" && row.actionType === "send-paperwork";
}

export function classifyPaperworkReadiness(input: {
  row: ScoredCandidateWorkflowRow;
  jobsByPositionId: Map<string, BreezyJob>;
  onboarding?: CandidateOnboardingRecord | null;
}): PaperworkReadinessClassification {
  const p84 = buildPaperworkSendEligibility({
    row: input.row,
    onboarding: input.onboarding ?? null,
    jobsByPositionId: input.jobsByPositionId,
  });
  const paperworkAlreadySent =
    hasActivePaperwork(input.row) ||
    input.row.workflowStatus === "Paperwork Sent" ||
    input.row.paperworkStatus === "signed";

  return {
    questionnaireReady: isQuestionnaireReady(input.row),
    workflowReady: isWorkflowReady(input.row),
    p84SendEligible: p84.eligible,
    paperworkAlreadySent,
    labels: READINESS_LABELS,
  };
}

export function withPublishedJobPreview(
  jobsByPositionId: Map<string, BreezyJob>,
  row: ScoredCandidateWorkflowRow,
): Map<string, BreezyJob> {
  const jobs = new Map(jobsByPositionId);
  if (row.positionId?.trim() && !jobs.has(row.positionId)) {
    jobs.set(row.positionId, {
      jobId: row.positionId,
      name: row.positionName ?? "Preview job",
      city: row.city,
      state: row.state,
      zip: row.zipCode,
      status: "published",
    } as BreezyJob);
  }
  return jobs;
}

export function simulateP84Eligibility(input: {
  row: ScoredCandidateWorkflowRow;
  onboarding: CandidateOnboardingRecord | null;
  jobsByPositionId: Map<string, BreezyJob>;
  applyJobPublish: boolean;
  applyRecruiterAssignment: boolean;
  applyP83Advancement: boolean;
}): boolean {
  const jobs = input.applyJobPublish
    ? withPublishedJobPreview(input.jobsByPositionId, input.row)
    : input.jobsByPositionId;
  const hypothetical: ScoredCandidateWorkflowRow = {
    ...input.row,
    assignedRecruiter:
      input.applyRecruiterAssignment && isUnassignedRecruiter(input.row.assignedRecruiter)
        ? "Preview Recruiter"
        : input.row.assignedRecruiter,
    workflowStatus: input.applyP83Advancement ? "Paperwork Needed" : input.row.workflowStatus,
    actionType: input.applyP83Advancement ? "send-paperwork" : input.row.actionType,
  };
  return buildPaperworkSendEligibility({
    row: hypothetical,
    onboarding: input.onboarding,
    jobsByPositionId: jobs,
  }).eligible;
}
