import type { InitialPaperworkExecutionSummary } from "@/lib/recruiting/initial-paperwork-execution-engine";

export const P150_SOURCE_PHASE = "P150";
export const P150_DEFAULT_MAX_SENDS = 10;

export type PaperworkProductionCategory =
  | "READY_TO_SEND"
  | "WAITING"
  | "COOLDOWN"
  | "ALREADY_SENT"
  | "MISSING_JOB"
  | "LOW_CONFIDENCE"
  | "BLOCKED"
  | "MANUAL_REVIEW"
  | "NOT_REQUIRING_PAPERWORK";

export type ClassifiedPaperworkCandidate = {
  candidateId: string;
  candidateName: string;
  email: string | null;
  recruiter: string;
  project: string;
  workflowStatus: string;
  paperworkStatus: string;
  category: PaperworkProductionCategory;
  recommendedAction: string | null;
  confidence: number | null;
  advancementAction: string | null;
  advancementConfidence: number | null;
  blockers: string[];
  primaryBlockerReason: string;
  inPaperworkQueue: boolean;
};

export type PaperworkClassificationReport = {
  sourcePhase: typeof P150_SOURCE_PHASE;
  generatedAt: string;
  candidatesEvaluated: number;
  inPaperworkQueue: number;
  categoryCounts: Record<PaperworkProductionCategory, number>;
  blockerSummary: Record<string, number>;
  eligibilitySummary: Record<string, number>;
  candidates: ClassifiedPaperworkCandidate[];
  queueZeroExplanation: string[];
  executeBatchCalled: false;
  breezyWrites: false;
};

export type ControlledProductionActivationSummary = Omit<
  InitialPaperworkExecutionSummary,
  "sourcePhase"
> & {
  sourcePhase: typeof P150_SOURCE_PHASE;
  maxSendsLimit: number;
  capReached: boolean;
  stoppedOnError: boolean;
  cooldownBlocked: number;
  classification: PaperworkClassificationReport;
  rollbackRecommendation: string;
};
