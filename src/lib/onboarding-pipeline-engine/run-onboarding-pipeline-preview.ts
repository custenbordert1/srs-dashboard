import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { buildOnboardingPipelineDashboardSnapshot } from "@/lib/onboarding-pipeline-engine/build-pipeline-dashboard";
import { buildOnboardingPipelineRecord } from "@/lib/onboarding-pipeline-engine/build-pipeline-record";
import { isOnboardingPipelineEligible } from "@/lib/onboarding-pipeline-engine/is-pipeline-eligible";
import type {
  OnboardingPipelinePreviewResult,
  OnboardingPipelineRecord,
} from "@/lib/onboarding-pipeline-engine/types";
import { P80_PREVIEW_MODE } from "@/lib/onboarding-pipeline-engine/types";
import type { OnboardingPreviewCandidateInput } from "@/lib/autonomous-onboarding-engine/types";

/**
 * Read-only P80 preview runner — never sends email, writes MEL, or mutates production data.
 */
export function runOnboardingPipelinePreview(input: {
  candidates: ScoredCandidateWorkflowRow[];
  onboardingRecords: CandidateOnboardingRecord[];
  fetchedAt?: string;
}): OnboardingPipelinePreviewResult {
  const fetchedAt = input.fetchedAt ?? new Date().toISOString();
  const dashboard = buildOnboardingPipelineDashboardSnapshot({
    ...input,
    fetchedAt,
  });

  const warnings = [
    "Preview mode — no emails sent, no MEL writes, no production data changes.",
    "P81 welcome workflow tasks are generated as preview-only records.",
    "All automation actions are generated as preview-only stubs.",
  ];

  if (dashboard.records.length === 0) {
    warnings.push("No candidates with completed paperwork are in the onboarding pipeline yet.");
  }

  if (dashboard.stalledRecords.length > 0) {
    warnings.push(
      `${dashboard.stalledRecords.length} onboarding record(s) are stalled — recruiter preview actions are available.`,
    );
  }

  return {
    ok: true,
    previewMode: P80_PREVIEW_MODE,
    fetchedAt,
    dashboard,
    warnings,
  };
}

export function buildOnboardingPipelineCandidatePreview(input: {
  row: ScoredCandidateWorkflowRow;
  onboarding: CandidateOnboardingRecord | null;
  fetchedAt?: string;
}): OnboardingPipelineRecord | null {
  const previewRow: OnboardingPreviewCandidateInput = {
    candidateId: input.row.candidateId,
    firstName: input.row.firstName,
    lastName: input.row.lastName,
    email: input.row.email,
    appliedDate: input.row.appliedDate,
    workflowStatus: input.row.workflowStatus,
    paperworkStatus: input.row.paperworkStatus,
    paperworkError: input.row.paperworkError,
    paperworkSentAt: input.row.paperworkSentAt,
    paperworkSignedAt: input.row.paperworkSignedAt,
    signatureRequestId: input.row.signatureRequestId,
    assignedRecruiter: input.row.assignedRecruiter,
  };

  if (!isOnboardingPipelineEligible(previewRow)) {
    return null;
  }

  return buildOnboardingPipelineRecord({
    row: previewRow,
    onboarding: input.onboarding,
    referenceAt: input.fetchedAt,
    context: {
      assignedDM: input.row.assignedDM,
      positionName: input.row.positionName,
      suggestedProjects: [],
    },
  });
}
