export type FunnelRiskLevel = "critical" | "warning" | "healthy";

export type RecruiterTaskType =
  | "interview-needed"
  | "paperwork-follow-up"
  | "technology-verification"
  | "transportation-confirmation"
  | "ready-for-mel-review"
  | "recruiter-outreach"
  | "assign-recruiter";

export type RecruiterCopilotRecommendation = {
  headline: string;
  why: string;
  recommendedAction: string;
  expectedOutcome: string;
};

export type CandidateAutomationState = {
  candidateId: string;
  stage: string;
  nextAction: string;
  owner: string;
  risk: FunnelRiskLevel;
  automationEligible: boolean;
};

export type CandidateFunnelAutomation = CandidateAutomationState & {
  copilot: RecruiterCopilotRecommendation;
  taskType: RecruiterTaskType | null;
  taskLabel: string | null;
  riskReasons: string[];
};

export type RecruiterTask = {
  id: string;
  candidateId: string;
  candidateName: string;
  type: RecruiterTaskType;
  label: string;
  owner: string;
  risk: FunnelRiskLevel;
  href: string;
};

export type WorkloadBalanceRecommendation = {
  recruiter: string;
  candidatesOwned: number;
  activeTasks: number;
  overdueTasks: number;
  pipelineVolume: number;
  recommendation: string;
  severity: FunnelRiskLevel;
};

export type EnhancedHiringForecast = {
  readyForMel7d: number;
  readyForMel30d: number;
  expectedHires30d: number;
  paperworkBottleneckCount: number;
  interviewBottleneckCount: number;
  assumptions: string;
};

export type ExecutiveAutomationRollups = {
  recruiterCapacityRisk: string | null;
  pipelineBlockers: string[];
  automationOpportunities: string[];
};

export const RECRUITER_TASK_LABELS: Record<RecruiterTaskType, string> = {
  "interview-needed": "Interview needed",
  "paperwork-follow-up": "Paperwork follow-up",
  "technology-verification": "Technology verification",
  "transportation-confirmation": "Transportation confirmation",
  "ready-for-mel-review": "Ready for MEL review",
  "recruiter-outreach": "Recruiter outreach",
  "assign-recruiter": "Assign recruiter",
};
