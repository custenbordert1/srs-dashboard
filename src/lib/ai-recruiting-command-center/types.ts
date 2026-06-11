import type { DistrictManager } from "@/lib/dm-territory-map";

export type AiInsightCategory = "recommendation" | "prediction" | "explanation" | "action";

export type AiInsightSeverity = "critical" | "high" | "medium" | "low";

export type AiInsight = {
  id: string;
  category: AiInsightCategory;
  severity: AiInsightSeverity;
  title: string;
  explanation: string;
  action: string;
  source: string;
  score: number;
  territory?: string;
  entityId?: string;
};

export type ExecutiveBriefingSection = {
  title: string;
  items: string[];
};

export type ExecutiveBriefing = {
  generatedAt: string;
  topRisks: ExecutiveBriefingSection;
  topWins: ExecutiveBriefingSection;
  hiringTrends: ExecutiveBriefingSection;
  coverageChanges: ExecutiveBriefingSection;
  criticalAlerts: ExecutiveBriefingSection;
  summary: string;
};

export type TerritoryAiAdvisorEntry = {
  dmName: DistrictManager | string;
  coverageRiskExplanation: string;
  applicantShortageExplanation: string;
  recommendedActions: string[];
  predictedIssues: string[];
  attentionScore: number;
};

export type RecruiterAiCoachSnapshot = {
  pipelineSummary: string;
  followUpSummary: string;
  conversionSummary: string;
  productivityTrend: string;
  candidatesToContact: Array<{ candidateId: string; name: string; reason: string }>;
  jobsNeedingApplicants: Array<{ jobId: string; title: string; reason: string }>;
  followUpsDueToday: Array<{ candidateId: string; name: string; reason: string }>;
};

export type OpportunityRiskPrediction = {
  opportunityId: string;
  projectName: string;
  fillProbability: number;
  coverageRisk: number;
  deadlineRisk: number;
  staffingShortageRisk: number;
  overallRiskScore: number;
  explanation: string;
};

export type ExecutiveAiAnswer = {
  question: string;
  answer: string;
  confidence: number;
  relatedInsightIds: string[];
};

export type AiCommandCenterSnapshot = {
  fetchedAt: string;
  briefing: ExecutiveBriefing;
  insightsFeed: AiInsight[];
  territoryAdvisor: TerritoryAiAdvisorEntry[];
  recruiterCoach: RecruiterAiCoachSnapshot;
  opportunityRisks: OpportunityRiskPrediction[];
  suggestedQuestions: string[];
};
