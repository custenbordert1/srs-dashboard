import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { OnboardingPreviewCandidateInput } from "@/lib/autonomous-onboarding-engine/types";
import { buildAutonomousOnboardingDashboardSnapshot } from "@/lib/autonomous-onboarding-engine/build-autonomous-onboarding-dashboard";
import {
  buildOnboardingWorkspaceCandidateSnapshot,
  isAutonomousOnboardingPipelineCandidate,
} from "@/lib/autonomous-onboarding-engine/build-onboarding-workspace-snapshot";
import type { AutonomousOnboardingPreviewResult } from "@/lib/autonomous-onboarding-engine/types";
import { P67_PREVIEW_MODE } from "@/lib/autonomous-onboarding-engine/types";

/**
 * Read-only preview runner — never writes candidate, workflow, onboarding, or email state.
 */
export function runAutonomousOnboardingPreview(input: {
  candidates: ScoredCandidateWorkflowRow[];
  onboardingRecords: CandidateOnboardingRecord[];
  fetchedAt?: string;
}): AutonomousOnboardingPreviewResult {
  const fetchedAt = input.fetchedAt ?? new Date().toISOString();
  const dashboard = buildAutonomousOnboardingDashboardSnapshot({
    candidates: input.candidates,
    onboardingRecords: input.onboardingRecords,
    fetchedAt,
  });

  const warnings = [
    "Preview mode — no emails sent, no training assigned, no production writes.",
    "Automation hooks are defined only and will not execute.",
  ];

  if (dashboard.candidates.length === 0) {
    warnings.push("No MTD candidates are in the post-paperwork onboarding pipeline yet.");
  }

  const missingUrls = dashboard.candidates.flatMap((row) =>
    row.training.modules.filter((module) => !module.url).map((module) => module.module.key),
  );
  if (missingUrls.length > 0) {
    warnings.push("Some training module URLs are not configured — preview shows placeholders.");
  }

  return {
    ok: true,
    previewMode: P67_PREVIEW_MODE,
    fetchedAt,
    dashboard,
    warnings,
  };
}

export function buildAutonomousOnboardingCandidatePreview(input: {
  row: ScoredCandidateWorkflowRow;
  onboarding: CandidateOnboardingRecord | null;
  fetchedAt?: string;
}) {
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
  if (!isAutonomousOnboardingPipelineCandidate(previewRow)) {
    return null;
  }
  return buildOnboardingWorkspaceCandidateSnapshot({
    row: previewRow,
    onboarding: input.onboarding,
    referenceAt: input.fetchedAt,
  });
}
