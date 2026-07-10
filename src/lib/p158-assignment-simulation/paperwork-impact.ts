import type { BreezyCandidate } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import { decideCandidateAction } from "@/lib/p157-recruiter-decision-engine/decision-engine";
import type { P156PrioritizedCandidate } from "@/lib/p156-candidate-prioritization/types";
import type { P158AssignmentQueueItem } from "@/lib/p158-autonomous-recruiter-assignment/types";
import type { P1581PostAssignmentOutcome } from "@/lib/p158-assignment-simulation/types";
import type { PaperworkAutomationAuditEvent } from "@/lib/p145-controlled-paperwork-automation/types";

export type P1581OutcomeCounts = {
  readyForPaperwork: number;
  manualReview: number;
  followUp: number;
  blocked: number;
  outcomes: P1581PostAssignmentOutcome[];
};

const PAPERWORK_ACTIONS = new Set(["Send Paperwork", "Ready For MEL"]);
const FOLLOW_UP_ACTIONS = new Set(["Follow Up Today", "Wait For Candidate"]);
const BLOCKED_ACTIONS = new Set([
  "Candidate Duplicate",
  "Position Closed",
  "Reject Candidate",
]);

export function projectPostAssignmentOutcomes(input: {
  simulatedAssignments: P158AssignmentQueueItem[];
  workflows: Record<string, CandidateWorkflowRecord>;
  candidatesById: Map<string, BreezyCandidate>;
  priorityById: Map<string, P156PrioritizedCandidate>;
  onboardingByCandidate: Map<string, CandidateOnboardingRecord>;
  auditEvents: PaperworkAutomationAuditEvent[];
  jobsByPositionId: Map<string, { status?: string }>;
  scoringMetaByCandidate: Map<
    string,
    {
      openDemand: number;
      coverageStatus: string;
      daysUntilProjectStart: number | null;
      projectName: string | null;
      jobStatus: string | null;
      jobPublished: boolean;
    }
  >;
  recruiterLoads: Map<string, number>;
  referenceMs: number;
}): P1581OutcomeCounts {
  const outcomes: P1581PostAssignmentOutcome[] = [];
  let readyForPaperwork = 0;
  let manualReview = 0;
  let followUp = 0;
  let blocked = 0;

  for (const item of input.simulatedAssignments) {
    if (!item.recommendedRecruiter) continue;

    const candidate = input.candidatesById.get(item.candidateId);
    const workflow = input.workflows[item.candidateId];
    if (!candidate || !workflow) continue;

    const simulatedWorkflow: CandidateWorkflowRecord = {
      ...workflow,
      assignedRecruiter: item.recommendedRecruiter,
      recruiterAssignmentSource: "auto",
      recruiterAssignmentConfidence: item.confidence,
    };

    const row = buildScoredWorkflowRow(candidate, simulatedWorkflow, {
      job: input.jobsByPositionId.has(candidate.positionId)
        ? (input.jobsByPositionId.get(candidate.positionId) as never)
        : undefined,
    });

    const priority = input.priorityById.get(item.candidateId);
    if (!priority) continue;

    const meta = input.scoringMetaByCandidate.get(item.candidateId) ?? {
      openDemand: item.openDemand,
      coverageStatus: "Healthy",
      daysUntilProjectStart: null,
      projectName: null,
      jobStatus: null,
      jobPublished: false,
    };

    const decision = decideCandidateAction({
      row,
      candidate,
      onboarding: input.onboardingByCandidate.get(item.candidateId) ?? null,
      auditEvents: input.auditEvents,
      priority: {
        ...priority,
        recruiter: item.recommendedRecruiter,
      },
      scoringMeta: meta,
      recruiterWorkload: input.recruiterLoads.get(item.recommendedRecruiter) ?? 1,
      referenceMs: input.referenceMs,
    });

    outcomes.push({
      candidateId: item.candidateId,
      candidateName: item.candidateName,
      recruiter: item.recommendedRecruiter,
      p157Action: decision.action,
      confidence: decision.confidence,
    });

    if (PAPERWORK_ACTIONS.has(decision.action)) readyForPaperwork += 1;
    else if (BLOCKED_ACTIONS.has(decision.action)) blocked += 1;
    else if (FOLLOW_UP_ACTIONS.has(decision.action)) followUp += 1;
    else if (decision.action === "Manual Review") manualReview += 1;
    else if (decision.action === "Assign Recruiter") manualReview += 1;
    else manualReview += 1;
  }

  return {
    readyForPaperwork,
    manualReview,
    followUp,
    blocked,
    outcomes: outcomes.sort((a, b) => b.confidence - a.confidence),
  };
}
