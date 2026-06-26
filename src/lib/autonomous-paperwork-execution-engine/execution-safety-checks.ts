import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import { buildPaperworkExecutionEligibility } from "@/lib/autonomous-paperwork-execution-engine/build-execution-eligibility";
import type { CandidateOnboardingPolicy } from "@/lib/candidate-onboarding-engine/types";
import type { P71FeatureFlags } from "@/lib/autonomous-paperwork-execution-engine/types";
import { canExecutePaperwork } from "@/lib/autonomous-paperwork-execution-engine/feature-flags-store";

export type PreExecutionSafetyResult = {
  safe: boolean;
  blockingReasons: string[];
};

export function runPreExecutionSafetyChecks(input: {
  row: ScoredCandidateWorkflowRow;
  onboarding: CandidateOnboardingRecord | null;
  policy: CandidateOnboardingPolicy;
  flags: P71FeatureFlags;
}): PreExecutionSafetyResult {
  const eligibility = buildPaperworkExecutionEligibility({
    row: input.row,
    onboarding: input.onboarding,
    policy: input.policy,
    flags: input.flags,
  });

  const blockingReasons = [...eligibility.blockingReasons];

  if (!canExecutePaperwork(input.flags)) {
    blockingReasons.push("Execution mode does not allow live Dropbox Sign sends.");
  }

  if (input.row.paperworkStatus === "signed" || input.row.workflowStatus === "Signed") {
    blockingReasons.push("Candidate has already signed paperwork.");
  }

  if (input.onboarding?.status === "sent" || input.onboarding?.status === "sending") {
    const duplicate = blockingReasons.some((reason) => /duplicate|active signature/i.test(reason));
    if (!duplicate && input.row.signatureRequestId) {
      blockingReasons.push("Active paperwork packet already exists.");
    }
  }

  return {
    safe: blockingReasons.length === 0,
    blockingReasons: [...new Set(blockingReasons)],
  };
}
