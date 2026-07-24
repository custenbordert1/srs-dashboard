import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import type {
  CandidateWorkflowState,
  RecruiterAssignmentSource,
  RecruiterRosters,
} from "@/lib/candidate-workflow-types";

export type { RecruiterAssignmentSource };

/** Minimum confidence (0–100) required before persisting an automatic assignment. */
export const RECRUITER_ASSIGNMENT_CONFIDENCE_THRESHOLD = 65;

export type RecruiterAssignmentDecision = {
  candidateId: string;
  recruiter: string;
  confidence: number;
  reason: string;
  territoryState: string | null;
  dmName: string | null;
  shouldAssign: boolean;
};

export type RecruiterAssignmentEngineInput = {
  candidates: BreezyCandidate[];
  workflows: CandidateWorkflowState;
  rosters: RecruiterRosters;
  jobsByPositionId?: Map<string, Pick<BreezyJob, "state">>;
};

export type RecruiterAssignmentMetrics = {
  autoAssignmentRate: number;
  manualAssignmentRequired: number;
  averageConfidence: number;
  totalCandidates: number;
  autoAssignedCount: number;
  unassignedEligible: number;
};

export type RecruiterAssignmentEngineResult = {
  decisions: RecruiterAssignmentDecision[];
  assigned: number;
  skipped: number;
  metrics: RecruiterAssignmentMetrics;
};
