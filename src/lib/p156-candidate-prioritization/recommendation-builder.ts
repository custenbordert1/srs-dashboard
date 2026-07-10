import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import { isMelReadyStatus } from "@/lib/candidate-action-sla";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import { classifyPaperworkStage } from "@/lib/executive-paperwork-dashboard/classify-paperwork-stage";
import type { CoverageStatus } from "@/lib/autonomous-recruiting-engine/types";
import { buildRecruiterActionDecision } from "@/lib/recruiter-action-engine/build-action-decision";

export function buildP156RecommendedNextAction(input: {
  row: ScoredCandidateWorkflowRow;
  onboarding: CandidateOnboardingRecord | null;
  coverageStatus: CoverageStatus;
  openDemand: number;
  referenceMs: number;
}): string {
  const { row, onboarding, coverageStatus, openDemand, referenceMs } = input;
  const action = buildRecruiterActionDecision(row, referenceMs);
  const paperworkStage = classifyPaperworkStage({ row, onboarding });

  if (isMelReadyStatus(row.workflowStatus)) {
    return "Load candidate into MEL for project assignment";
  }

  if (isUnassignedRecruiter(row.assignedRecruiter)) {
    if (coverageStatus === "Critical" || openDemand >= 15) {
      return "Assign recruiter immediately — high-demand territory";
    }
    return "Assign recruiter and schedule initial review";
  }

  if (paperworkStage === "awaitingRecruiterAction" || row.workflowStatus === "Paperwork Needed") {
    return "Send onboarding paperwork";
  }

  if (paperworkStage === "approvalQueue") {
    return "Approve paperwork send from queue";
  }

  if (paperworkStage === "sent" || paperworkStage === "viewed") {
    return "Follow up on signature completion";
  }

  if (row.recruitingActions.needsFollowUp || row.followUpDueAt) {
    return action.requiredAction || "Complete scheduled follow-up";
  }

  if (row.recruitingActions.recommendInterview || row.workflowStatus === "Qualified") {
    return "Schedule interview";
  }

  if (coverageStatus === "Critical") {
    return `Accelerate hire — ${action.requiredAction}`;
  }

  return action.requiredAction || row.nextActionNeeded || "Review candidate";
}
