import type { P156PriorityLevel } from "@/lib/p156-candidate-prioritization/types";

export const P157_SOURCE_PHASE = "P157" as const;

export type P157DecisionAction =
  | "Send Paperwork"
  | "Assign Recruiter"
  | "Follow Up Today"
  | "Wait For Candidate"
  | "Ready For MEL"
  | "Review Questionnaire"
  | "Request Missing Documents"
  | "Escalate To DM"
  | "Position Closed"
  | "Candidate Duplicate"
  | "Reject Candidate"
  | "Manual Review";

export type P157DecisionSignal = {
  id: string;
  label: string;
  weight: number;
};

export type P157CandidateDecision = {
  candidateId: string;
  candidateName: string;
  email: string | null;
  action: P157DecisionAction;
  confidence: number;
  reasoning: string[];
  recruiter: string;
  dm: string;
  position: string;
  positionId: string;
  project: string | null;
  territory: string;
  state: string | null;
  workflowStatus: string;
  priorityScore: number;
  priorityLevel: P156PriorityLevel;
  openDemand: number;
  daysInPipeline: number | null;
  signals: P157DecisionSignal[];
};

export type P157DecisionDistribution = {
  action: P157DecisionAction;
  count: number;
  avgConfidence: number;
};

export type P157ExecutiveSummary = {
  totalCandidates: number;
  highConfidenceCount: number;
  manualReviewCount: number;
  blockedCount: number;
  topAction: P157DecisionAction | null;
  avgConfidence: number;
};

export type P157DecisionFilters = {
  recruiter: string | null;
  dm: string | null;
  state: string | null;
  project: string | null;
  decision: P157DecisionAction | null;
  confidenceMin: number | null;
  priorityMin: number | null;
};

export type P157DecisionDashboard = {
  generatedAt: string;
  readOnly: true;
  sourcePhase: typeof P157_SOURCE_PHASE;
  filters: P157DecisionFilters;
  summary: P157ExecutiveSummary;
  decisions: P157CandidateDecision[];
  sections: {
    recommendedActions: P157CandidateDecision[];
    highConfidence: P157CandidateDecision[];
    manualReview: P157CandidateDecision[];
    needsRecruiter: P157CandidateDecision[];
    needsDm: P157CandidateDecision[];
    needsPaperwork: P157CandidateDecision[];
    readyForMel: P157CandidateDecision[];
    blocked: P157CandidateDecision[];
    top25: P157CandidateDecision[];
  };
  distribution: P157DecisionDistribution[];
  filterOptions: {
    recruiters: string[];
    dms: string[];
    states: string[];
    projects: string[];
    decisions: P157DecisionAction[];
  };
  warnings: string[];
};

export type P157DecisionContext = {
  referenceMs: number;
  openDemand: number;
  coverageStatus: string;
  daysUntilProjectStart: number | null;
  projectName: string | null;
  recruiterWorkload: number;
  jobPublished: boolean;
  jobStatus: string | null;
  isDuplicate: boolean;
  duplicateReason: string | null;
  paperworkEligible: boolean;
  paperworkBlockers: string[];
  applicantVerdict: string;
  missingDocuments: string[];
  questionnaireComplete: boolean;
  questionnaireTechReady: boolean | null;
};
