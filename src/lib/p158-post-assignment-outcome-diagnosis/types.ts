import type { P157DecisionAction } from "@/lib/p157-recruiter-decision-engine/types";

export const P158_2_SOURCE_PHASE = "P158.2" as const;

export type P1582BlockerCode =
  | "missing_questionnaire"
  | "missing_resume"
  | "low_confidence"
  | "duplicate"
  | "active_signature_request"
  | "already_sent"
  | "invalid_email"
  | "already_contacted_cooldown"
  | "project_closed"
  | "operational_fit_mismatch"
  | "workflow_state_issue"
  | "other";

export type P1582BlockerClass =
  | "true_business_requirement"
  | "safe_to_automate"
  | "artificial_workflow_gate"
  | "remain_manual_review";

export type P1582CandidateDiagnosis = {
  candidateId: string;
  candidateName: string;
  recruiter: string;
  dm: string;
  postAssignmentAction: P157DecisionAction | "Blocked";
  confidence: number;
  workflowStatus: string;
  paperworkStage: string | null;
  primaryBlocker: P1582BlockerCode;
  blockerReason: string;
  blockerClass: P1582BlockerClass;
  automatable: boolean;
  recommendedFix: string;
  allBlockers: string[];
  signals: string[];
};

export type P1582BlockerCount = {
  code: P1582BlockerCode;
  count: number;
  blockerClass: P1582BlockerClass;
  automatableCount: number;
};

export type P1582DiagnosisSummary = {
  candidatesDiagnosed: number;
  sendPaperworkCount: number;
  manualReviewCount: number;
  blockedCount: number;
  otherActionCount: number;
  blockerCounts: P1582BlockerCount[];
  classCounts: Record<P1582BlockerClass, number>;
  safestNextChange: string;
  estimatedPaperworkLift: number;
};

export type P1582OutcomeDiagnosis = {
  generatedAt: string;
  readOnly: true;
  sourcePhase: typeof P158_2_SOURCE_PHASE;
  simulationOnly: true;
  summary: P1582DiagnosisSummary;
  candidates: P1582CandidateDiagnosis[];
  warnings: string[];
};
