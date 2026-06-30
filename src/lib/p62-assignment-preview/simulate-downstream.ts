import type { BreezyJob } from "@/lib/breezy-api";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { buildCandidateAdvancementDecision } from "@/lib/candidate-advancement-engine/build-advancement-decision";
import { buildPaperworkSendEligibility } from "@/lib/autonomous-paperwork-send-engine/build-paperwork-send-eligibility";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import type { PaperworkByGrade } from "@/lib/candidate-onboarding-engine/types";
import type { DownstreamSimulationStep } from "@/lib/p62-assignment-preview/types";

export function simulateDownstreamAfterAssignment(input: {
  row: ScoredCandidateWorkflowRow;
  assignedRecruiter: string;
  jobsByPositionId: Map<string, BreezyJob>;
  onboarding: CandidateOnboardingRecord | null;
  paperworkByGrade: PaperworkByGrade;
  assignmentApplied: boolean;
}): {
  steps: DownstreamSimulationStep[];
  expectedWorkflowStatus: string;
  expectedActionType: string;
  p83Action: string;
  p83ShouldAdvance: boolean;
  p84EligibleAfterSimulation: boolean;
  p84BlockingReasonsAfterSimulation: string[];
  stillBlockedAfterAssignment: boolean;
  remainingBlocker: string | null;
} {
  const steps: DownstreamSimulationStep[] = [];

  if (!input.assignmentApplied || !input.assignedRecruiter.trim()) {
    return {
      steps: [
        {
          step: "p62_assigned",
          status: "blocked",
          detail: "Recruiter assignment not applied in preview — human review required.",
        },
      ],
      expectedWorkflowStatus: input.row.workflowStatus,
      expectedActionType: input.row.actionType ?? "none",
      p83Action: "none",
      p83ShouldAdvance: false,
      p84EligibleAfterSimulation: false,
      p84BlockingReasonsAfterSimulation: ["Recruiter not assigned."],
      stillBlockedAfterAssignment: true,
      remainingBlocker: "P62 assignment pending human review",
    };
  }

  steps.push({
    step: "p62_assigned",
    status: "simulated",
    detail: `Assigned recruiter ${input.assignedRecruiter} (preview only — not persisted).`,
  });

  const afterP62: ScoredCandidateWorkflowRow = {
    ...input.row,
    assignedRecruiter: input.assignedRecruiter,
  };

  const p83 = buildCandidateAdvancementDecision(afterP62, {
    jobsByPositionId: input.jobsByPositionId,
    paperworkByGrade: input.paperworkByGrade,
    requireApproval: false,
  });

  let afterP83 = afterP62;
  if (p83.action === "send-paperwork" && p83.shouldAdvance) {
    afterP83 = {
      ...afterP62,
      workflowStatus: "Paperwork Needed",
      actionType: "send-paperwork",
      nextActionNeeded: "Send paperwork",
    };
    steps.push({
      step: "p83_advancement",
      status: "simulated",
      detail: "Advanced to Paperwork Needed with actionType send-paperwork (preview only).",
    });
  } else {
    steps.push({
      step: "p83_advancement",
      status: "blocked",
      detail: p83.reason,
    });
  }

  const p84 = buildPaperworkSendEligibility({
    row: afterP83,
    onboarding: input.onboarding,
    jobsByPositionId: input.jobsByPositionId,
  });

  steps.push({
    step: "p84_recheck",
    status: p84.eligible ? "simulated" : "blocked",
    detail: p84.eligible
      ? "P84 preview eligible — liveSend remains false."
      : p84.blockingReasons[0] ?? "P84 gates not satisfied.",
  });

  return {
    steps,
    expectedWorkflowStatus: afterP83.workflowStatus,
    expectedActionType: afterP83.actionType ?? "none",
    p83Action: p83.action,
    p83ShouldAdvance: p83.shouldAdvance,
    p84EligibleAfterSimulation: p84.eligible,
    p84BlockingReasonsAfterSimulation: p84.blockingReasons,
    stillBlockedAfterAssignment: !p84.eligible,
    remainingBlocker: p84.eligible ? null : p84.blockingReasons[0] ?? p83.reason,
  };
}
