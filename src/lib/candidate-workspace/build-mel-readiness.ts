import type { MelReadinessItem } from "@/lib/candidate-workspace/types";
import type { CandidateWorkflowStatus, PaperworkStatus } from "@/lib/candidate-workflow-types";
import type { CandidateRecruitingActions } from "@/lib/candidate-recruiting-actions";

const POST_INTERVIEW_STATUSES = new Set<CandidateWorkflowStatus>([
  "Qualified",
  "Paperwork Needed",
  "Paperwork Sent",
  "Signed",
  "Awaiting DD Verification",
  "Ready for MEL",
  "Loaded in MEL",
  "Training Needed",
  "Active Rep",
]);

export function buildMelReadinessChecklist(input: {
  workflowStatus: CandidateWorkflowStatus;
  paperworkStatus: PaperworkStatus;
  recruitingActions: CandidateRecruitingActions;
}): MelReadinessItem[] {
  const interviewComplete =
    POST_INTERVIEW_STATUSES.has(input.workflowStatus) && !input.recruitingActions.recommendInterview;
  const paperworkSigned =
    input.paperworkStatus === "signed" ||
    input.workflowStatus === "Signed" ||
    input.workflowStatus === "Ready for MEL" ||
    input.workflowStatus === "Loaded in MEL" ||
    input.workflowStatus === "Active Rep";
  const availabilityVerified =
    input.workflowStatus === "Ready for MEL" ||
    input.workflowStatus === "Loaded in MEL" ||
    input.workflowStatus === "Active Rep";
  const transportationVerified = availabilityVerified;
  const readyForMel =
    input.workflowStatus === "Ready for MEL" ||
    input.workflowStatus === "Loaded in MEL" ||
    input.workflowStatus === "Active Rep";

  return [
    { id: "interview", label: "Interview complete", complete: interviewComplete },
    { id: "paperwork", label: "Paperwork signed", complete: paperworkSigned },
    { id: "availability", label: "Availability verified", complete: availabilityVerified },
    { id: "transportation", label: "Transportation verified", complete: transportationVerified },
    { id: "ready-mel", label: "Ready for MEL", complete: readyForMel },
  ];
}
