import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { RecruiterActionPriority } from "@/lib/candidate-workflow-types";

export type ProgressionStageType =
  | "contact-candidate"
  | "schedule-interview"
  | "send-paperwork"
  | "ready-for-mel"
  | "escalate"
  | "none";

export const PROGRESSION_STAGE_LABELS: Record<ProgressionStageType, string> = {
  "contact-candidate": "Contact Candidate",
  "schedule-interview": "Schedule Interview",
  "send-paperwork": "Send Paperwork",
  "ready-for-mel": "Ready For MEL",
  escalate: "Escalate",
  none: "No Progression",
};

export type CandidateProgressionDecision = {
  candidateId: string;
  recommendedStage: string;
  progressionStageType: ProgressionStageType;
  progressionReason: string;
  progressionConfidence: number;
  progressionPriority: RecruiterActionPriority;
  shouldPersist: boolean;
};

export type CandidateProgressionEngineInput = {
  candidates: ScoredCandidateWorkflowRow[];
  referenceMs?: number;
};

export type ProgressionMetrics = {
  candidatesReadyToAdvance: number;
  stalledCandidates: number;
  progressionSlaCompliance: number;
  progressionBottlenecks: string[];
  totalWithProgression: number;
  highPriorityCount: number;
};

export type CandidateProgressionEngineResult = {
  decisions: CandidateProgressionDecision[];
  generated: number;
  skipped: number;
  metrics: ProgressionMetrics;
};
