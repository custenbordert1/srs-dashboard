import type { OnboardingPreviewCandidateInput } from "@/lib/autonomous-onboarding-engine/types";
import { isPaperworkSigned } from "@/lib/autonomous-onboarding-engine/state-machine";

/** P80 pipeline begins only after paperwork is complete. */
export function isOnboardingPipelineEligible(row: OnboardingPreviewCandidateInput): boolean {
  if (
    row.workflowStatus === "Disqualified" ||
    row.workflowStatus === "Withdrawn"
  ) {
    return false;
  }

  return isPaperworkSigned({
    candidateId: row.candidateId,
    workflowStatus: row.workflowStatus,
    paperworkStatus: row.paperworkStatus,
    onboardingStatus: null,
    trainingComplete: false,
    acknowledgementsComplete: false,
  });
}
