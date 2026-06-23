import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { isMelReadyStatus, isPaperworkPendingStatus } from "@/lib/candidate-action-sla";
import type { AutonomousRecruitingSnapshot } from "@/lib/autonomous-recruiting-engine/types";
import type { ExecutionCorrelation } from "@/lib/autonomous-recruiting-execution/execution-correlation";
import type { PlacementFunnelStage } from "@/lib/placement-command-center/types";
import type { PlacementRecommendation } from "@/lib/placement-command-center/types";

export function buildPlacementFunnel(input: {
  autopilotSnapshot: AutonomousRecruitingSnapshot;
  scoredRows: ScoredCandidateWorkflowRow[];
  correlations: ExecutionCorrelation[];
  placementRecommendations: PlacementRecommendation[];
}): PlacementFunnelStage[] {
  const { autopilotSnapshot, scoredRows, correlations, placementRecommendations } = input;

  const coverageNeeds = autopilotSnapshot.coverageNeeds.filter(
    (row) => row.coverageStatus === "Critical" || row.coverageStatus === "At Risk",
  ).length;

  const jobsPosted = correlations.filter(
    (row) =>
      (row.type === "posting" || row.type === "refresh") &&
      ["approved", "executing", "completed"].includes(row.status),
  ).length;

  const applicantsScored = scoredRows.length;

  const candidatesRecommended = autopilotSnapshot.hiringRecommendations.filter(
    (row) => row.recommendedAction !== "Reject",
  ).length;

  const paperworkTriggered = scoredRows.filter(
    (row) =>
      row.workflowStatus === "Paperwork Sent" ||
      row.workflowStatus === "Paperwork Needed" ||
      isPaperworkPendingStatus(row.workflowStatus),
  ).length;

  const paperworkCompleted = scoredRows.filter(
    (row) => row.workflowStatus === "Signed" || row.paperworkStatus === "signed",
  ).length;

  const readyForMel = scoredRows.filter((row) => isMelReadyStatus(row.workflowStatus)).length;

  const placementRecommended = placementRecommendations.length;

  const coverageFilled = correlations.filter(
    (row) => row.type === "hiring" && row.status === "completed",
  ).length;

  const outcomeVerified = correlations.filter(
    (row) => row.status === "completed" && row.accountabilityActionId,
  ).length;

  return [
    { id: "coverage-need", label: "Coverage Need", count: coverageNeeds },
    { id: "job-posted", label: "Job Posted", count: jobsPosted },
    { id: "applicants-scored", label: "Applicants Scored", count: applicantsScored },
    { id: "candidate-recommended", label: "Candidate Recommended", count: candidatesRecommended },
    { id: "paperwork-triggered", label: "Paperwork Triggered", count: paperworkTriggered },
    { id: "paperwork-completed", label: "Paperwork Completed", count: paperworkCompleted },
    { id: "ready-for-mel", label: "Ready For MEL", count: readyForMel },
    {
      id: "placement-recommended",
      label: "Placement Recommendation",
      count: placementRecommended,
    },
    { id: "coverage-filled", label: "Coverage Filled", count: coverageFilled },
    { id: "outcome-verified", label: "Outcome Verified", count: outcomeVerified },
  ];
}
