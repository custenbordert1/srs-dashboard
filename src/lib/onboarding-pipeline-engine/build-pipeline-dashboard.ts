import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { OnboardingPreviewCandidateInput } from "@/lib/autonomous-onboarding-engine/types";
import { buildOnboardingPipelineExecutiveSummary } from "@/lib/onboarding-pipeline-engine/build-executive-summary";
import { buildOnboardingPipelineRecord } from "@/lib/onboarding-pipeline-engine/build-pipeline-record";
import { isOnboardingPipelineEligible } from "@/lib/onboarding-pipeline-engine/is-pipeline-eligible";
import type { OnboardingPipelineDashboardSnapshot } from "@/lib/onboarding-pipeline-engine/types";
import { P80_PREVIEW_MODE } from "@/lib/onboarding-pipeline-engine/types";

function toPreviewInput(row: ScoredCandidateWorkflowRow): OnboardingPreviewCandidateInput {
  return {
    candidateId: row.candidateId,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    appliedDate: row.appliedDate,
    workflowStatus: row.workflowStatus,
    paperworkStatus: row.paperworkStatus,
    paperworkError: row.paperworkError,
    paperworkSentAt: row.paperworkSentAt,
    paperworkSignedAt: row.paperworkSignedAt,
    signatureRequestId: row.signatureRequestId,
    assignedRecruiter: row.assignedRecruiter,
  };
}

export function buildOnboardingPipelineDashboardSnapshot(input: {
  candidates: ScoredCandidateWorkflowRow[];
  onboardingRecords: CandidateOnboardingRecord[];
  fetchedAt?: string;
}): OnboardingPipelineDashboardSnapshot {
  const fetchedAt = input.fetchedAt ?? new Date().toISOString();
  const onboardingByCandidate = new Map(
    input.onboardingRecords.map((record) => [record.candidateId, record] as const),
  );

  const records = input.candidates
    .map((row) => toPreviewInput(row))
    .filter(isOnboardingPipelineEligible)
    .map((row) =>
      buildOnboardingPipelineRecord({
        row,
        onboarding: onboardingByCandidate.get(row.candidateId) ?? null,
        referenceAt: fetchedAt,
      }),
    )
    .sort((a, b) => a.candidateName.localeCompare(b.candidateName));

  const summary = buildOnboardingPipelineExecutiveSummary(records);
  const stalledRecords = records.filter((row) => row.stalled);

  return {
    fetchedAt,
    previewMode: P80_PREVIEW_MODE,
    summary,
    records,
    stalledRecords,
  };
}
