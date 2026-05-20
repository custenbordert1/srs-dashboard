import type { BestRepMatchRow } from "@/lib/rep-intelligence/rep-types";

export type StaffingRiskLevel = "GREEN" | "YELLOW" | "RED";

export type NearbyRepCounts = {
  within10: number;
  within25: number;
  within50: number;
  activeWithin50: number;
  inactiveWithin50: number;
};

export type OpportunityCoverageRow = {
  opportunityId: string;
  projectName: string;
  client: string;
  storeName: string;
  city: string;
  state: string;
  territoryOwner: string;
  priority: string;
  nearby: NearbyRepCounts;
  activeRepDensity: number;
  skillMatchScore: number;
  recentLoginScore: number;
  territoryAlignmentScore: number;
  pipelineScore: number;
  coverageScore: number;
  staffingRisk: StaffingRiskLevel;
  recommendedAction: string;
  topRecommendedReps: BestRepMatchRow[];
};

export type StateStaffingDensityRow = {
  state: string;
  territoryOwner: string;
  openOpportunities: number;
  activeReps: number;
  densityRatio: number;
  staffingRisk: StaffingRiskLevel;
};

export type HighOpportunityLowRepMarket = {
  state: string;
  territoryOwner: string;
  openOpportunities: number;
  activeReps: number;
  gapScore: number;
};

export type CoverageRiskExecutiveSummary = {
  totalOpenOpportunities: number;
  highRiskProjectCount: number;
  yellowRiskProjectCount: number;
  zeroNearbyRepProjects: number;
  averageCoverageScore: number;
  lowDensityStates: StateStaffingDensityRow[];
  highOpportunityLowRepMarkets: HighOpportunityLowRepMarket[];
};

export type DmCoverageRiskAlerts = {
  highRiskProjects: OpportunityCoverageRow[];
  noNearbyReps: OpportunityCoverageRow[];
  recruitingUrgency: OpportunityCoverageRow[];
  bestAvailableReps: Array<{
    opportunityId: string;
    projectName: string;
    storeName: string;
    state: string;
    staffingRisk: StaffingRiskLevel;
    topRep: BestRepMatchRow | null;
  }>;
};

export type CoverageRiskSnapshot = {
  fetchedAt: string;
  territoryStates: string[] | null;
  opportunities: OpportunityCoverageRow[];
  executiveSummary: CoverageRiskExecutiveSummary;
  dmAlerts: DmCoverageRiskAlerts;
};
