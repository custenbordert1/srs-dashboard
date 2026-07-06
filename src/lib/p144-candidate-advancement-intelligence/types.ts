import type { CandidateAdvancementEvaluation } from "@/lib/recruiting/candidate-advancement-engine";
import { ADVANCEMENT_SCORE_WEIGHTS } from "@/lib/recruiting/candidate-advancement-engine";

export const P144_SOURCE_PHASE = "P144";
export const P144_MODE = "readOnly" as const;

export type AutomationPreviewQueueRow = {
  candidateId: string;
  candidateName: string;
  project: string;
  recruiter: string;
  suggestedAction: string;
  reason: string;
  confidence: number;
  advancementScore: number;
  automationEligible: boolean;
  previewOnly: true;
  approveDisabled: true;
  rejectDisabled: true;
};

export type CandidateAdvancementExecutiveMetrics = {
  automationCandidatesToday: number;
  readyToAdvance: number;
  manualReviewQueue: number;
  highestProbabilityHires: number;
  highestRiskCandidates: number;
  averageAdvancementScore: number;
  averageHireProbability: number;
  pipelineHealthScore: number;
};

export type CandidateAdvancementValidationReport = {
  topAutomationCandidates: CandidateAdvancementEvaluation[];
  topManualReviewCandidates: CandidateAdvancementEvaluation[];
  averageAdvancementScore: number;
  averageHireProbability: number;
  distributionByRecruiter: Array<{ recruiter: string; count: number; avgScore: number }>;
  distributionByProject: Array<{ project: string; count: number; avgScore: number }>;
  pipelineBottlenecks: string[];
  largestBlockers: Array<{ blocker: string; count: number }>;
  automationEligibleCount: number;
};

export type CandidateAdvancementIntelligenceSnapshot = {
  sourcePhase: typeof P144_SOURCE_PHASE;
  generatedAt: string;
  mode: typeof P144_MODE;
  partialSync: boolean;
  candidatesEvaluated: number;
  scoreWeights: typeof ADVANCEMENT_SCORE_WEIGHTS;
  evaluations: CandidateAdvancementEvaluation[];
  executive: CandidateAdvancementExecutiveMetrics;
  automationPreviewQueue: AutomationPreviewQueueRow[];
  validation: CandidateAdvancementValidationReport;
  executeBatchCalled: false;
  breezyWrites: false;
  paperworkSent: false;
  liveModeEnabled: boolean;
};
