import type { ActionRecommendationCard } from "@/lib/territory-action-engine/types";
import type { DistrictManager } from "@/lib/dm-territory-map";
import type { ProjectRiskLevel } from "@/lib/territory-action-engine/types";

export type CompanyHealthTier = "critical" | "at-risk" | "stable" | "healthy";

export type CompanyHealthTrend = "up" | "down" | "flat";

export type CompanyHealthScore = {
  score: number;
  tier: CompanyHealthTier;
  trend: CompanyHealthTrend;
  drivers: string[];
};

export type ExecutiveRiskSummary = {
  id: string;
  label: string;
  count: number;
  topIssue: string;
};

export type ExecutiveProjectWarRoomRow = {
  opportunityId: string;
  projectName: string;
  client: string;
  state: string;
  dmName: string;
  openCalls: number;
  coveragePercent: number;
  applicantCount: number;
  riskLevel: ProjectRiskLevel;
  owner: string;
  recommendation: string;
};

export type ExecutiveTerritoryWarRoomRow = {
  dmName: DistrictManager;
  states: string[];
  coveragePercent: number;
  openCalls: number;
  repPool: number;
  riskScore: number;
  priorityActions: string[];
  riskTier: CompanyHealthTier;
};

export type RecruiterWarRoomStatus = "reassign" | "balanced" | "needs-help";

export type ExecutiveRecruiterWarRoomRow = {
  recruiterName: string;
  assignedCandidates: number;
  followUpsDue: number;
  paperwork: number;
  readyForMel: number;
  workloadScore: number;
  status: RecruiterWarRoomStatus;
  recommendation: string;
};

export type ProjectForecastOutcome = "likely-to-finish" | "at-risk" | "likely-to-miss";

export type ProjectForecastRow = {
  opportunityId: string;
  projectName: string;
  client: string;
  outcome: ProjectForecastOutcome;
  confidenceScore: number;
  reason: string;
};

export type ExecutiveOperationsCenterSnapshot = {
  fetchedAt: string;
  companyHealth: CompanyHealthScore;
  riskSummaries: {
    criticalActions: ExecutiveRiskSummary;
    projectRisk: ExecutiveRiskSummary;
    territoryRisk: ExecutiveRiskSummary;
    recruiterRisk: ExecutiveRiskSummary;
    coverageRisk: ExecutiveRiskSummary;
  };
  actionBoard: ActionRecommendationCard[];
  projectWarRoom: ExecutiveProjectWarRoomRow[];
  territoryWarRoom: ExecutiveTerritoryWarRoomRow[];
  recruiterWarRoom: ExecutiveRecruiterWarRoomRow[];
  projectForecasts: ProjectForecastRow[];
};
