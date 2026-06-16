import type { UserRole } from "@/lib/auth/types";
import type { PredictiveRiskTrend } from "@/lib/predictive-territory-risk/types";

export type RecruiterCapacityState = "underutilized" | "healthy" | "busy" | "overloaded";

export type HiringForecastHorizon = "7d" | "14d" | "30d" | "60d";

export type CoverageForecastScope = "territory" | "dm" | "project" | "company";

export type StaffingRiskKind =
  | "recruiter-overload"
  | "dm-overload"
  | "coverage-shortage"
  | "completion-risk";

export type ResourceBalancingKind =
  | "move-recruiter"
  | "reassign-territory"
  | "shift-priorities"
  | "increase-recruiting-effort";

export type WorkforceCapacityForecastScope = {
  role: UserRole;
  territoryStates: string[];
  territoryLabel: string;
  dmName?: string;
  recruiterName?: string;
  scopedToTerritory: boolean;
  scopedToRecruiter: boolean;
};

export type RecruiterCapacityRow = {
  recruiterName: string;
  activeWorkload: number;
  followUpVolume: number;
  candidateVolume: number;
  territoryLoad: number;
  openCallLoad: number;
  capacityPercent: number;
  state: RecruiterCapacityState;
  spareCapacityPercent: number;
  needsHelp: boolean;
};

export type DmCapacityRow = {
  dmName: string;
  territoryCount: number;
  recruiterCount: number;
  openCalls: number;
  riskLoad: number;
  followUpBacklog: number;
  capacityScore: number;
  state: RecruiterCapacityState;
  atRisk: boolean;
};

export type HiringForecastPoint = {
  horizon: HiringForecastHorizon;
  expectedHires: number;
  confidenceLow: number;
  confidenceHigh: number;
  confidenceScore: number;
};

export type CoverageForecastPoint = {
  horizon: HiringForecastHorizon;
  coveragePercent: number;
  openCallReduction: number;
  completionPercent: number;
  riskTrend: PredictiveRiskTrend;
};

export type CoverageForecastRow = {
  entityId: string;
  scope: CoverageForecastScope;
  label: string;
  dmName?: string;
  currentCoveragePercent: number;
  currentOpenCalls: number;
  forecasts: CoverageForecastPoint[];
};

export type StaffingRiskArea = {
  id: string;
  kind: StaffingRiskKind;
  label: string;
  dmName?: string;
  recruiterName?: string;
  riskScore: number;
  severity: "critical" | "high" | "moderate";
  reason: string;
};

export type ResourceBalancingRecommendation = {
  id: string;
  kind: ResourceBalancingKind;
  title: string;
  detail: string;
  fromLabel?: string;
  toLabel?: string;
  expectedHireGain: number;
  expectedCoverageGain: number;
  expectedOpenCallReduction: number;
  confidenceScore: number;
  priorityScore: number;
};

export type CapacityPlanningDashboard = {
  recruitersNeedingHelp: RecruiterCapacityRow[];
  recruitersWithSpareCapacity: RecruiterCapacityRow[];
  dmsAtRisk: DmCapacityRow[];
  projectsRequiringStaffingSupport: Array<{
    projectId: string;
    projectName: string;
    dmName: string;
    openCalls: number;
    coveragePercent: number;
    riskScore: number;
  }>;
};

export type ExecutivePlanningOutlook = {
  headline: string;
  hiringForecast: HiringForecastPoint[];
  capacitySummary: {
    overloadedRecruiters: number;
    underutilizedRecruiters: number;
    dmsAtRisk: number;
    averageRecruiterCapacity: number;
    averageDmCapacityScore: number;
  };
  topRisks: StaffingRiskArea[];
  recommendedActions: ResourceBalancingRecommendation[];
};

export type WorkforceCapacityForecastSnapshot = {
  generatedAt: string;
  planDate: string;
  scope: WorkforceCapacityForecastScope;
  recruiterCapacity: RecruiterCapacityRow[];
  dmCapacity: DmCapacityRow[];
  hiringForecast: HiringForecastPoint[];
  coverageForecasts: CoverageForecastRow[];
  staffingRisks: StaffingRiskArea[];
  capacityPlanning: CapacityPlanningDashboard;
  resourceBalancing: ResourceBalancingRecommendation[];
  executiveOutlook: ExecutivePlanningOutlook;
};
