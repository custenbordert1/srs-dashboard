export type ForecastHorizonDays = 30 | 60 | 90;

export type CapacityStatus = "overloaded" | "stable" | "underused";

export type DataTrustLevel = "high" | "partial" | "degraded";

/** Model confidence in forecast inputs — not backtested statistical accuracy. */
export type ForecastConfidenceLevel = "low" | "moderate" | "high";

export type RecommendationPriority = "critical" | "high" | "medium" | "low";

export type ProjectRiskLevel = "critical" | "high" | "medium" | "low";

export type HiringForecastHorizon = {
  horizonDays: ForecastHorizonDays;
  /** Projected hires across the horizon using trailing velocity + pipeline conversion. */
  projectedHires: number;
  projectedApplicants: number;
  projectedInterviews: number;
  confidencePercent: number;
};

export type WeeklyHireForecastPoint = {
  weekLabel: string;
  weekIndex: number;
  projectedHires: number;
  projectedApplicants: number;
};

export type RecruiterCapacityRow = {
  recruiter: string;
  capacityScore: number;
  status: CapacityStatus;
  assignedCandidates: number;
  openFollowUps: number;
  overdueFollowUps: number;
  candidateBacklogPressure: number;
  openJobPressure: number;
};

export type DmCapacityRow = {
  dmName: string;
  capacityScore: number;
  status: CapacityStatus;
  openOpportunities: number;
  activePipelineCandidates: number;
  territoryCoveragePressure: number;
  candidateBacklogPressure: number;
};

export type TerritoryShortageForecastRow = {
  dmName: string;
  territoryLabel: string;
  shortageScore: number;
  projectedShortage: number;
  openOpportunities: number;
  activeReps: number;
  pipelineCandidates: number;
  likelyMissCoverage: boolean;
  reasons: string[];
};

export type ProjectCompletionRiskRow = {
  projectNo: string;
  projectName: string;
  dmName: string;
  territoryLabel: string;
  riskScore: number;
  riskLevel: ProjectRiskLevel;
  openOpportunities: number;
  pipelineCandidates: number;
  nearestDeadlineDays: number | null;
  reasons: string[];
  suggestedAction: string;
};

export type ExecutiveForecastRecommendation = {
  id: string;
  kind:
    | "refresh-job-ads"
    | "increase-pay"
    | "move-recruiter-focus"
    | "prioritize-candidates"
    | "escalate-dm-territory"
    | "automation";
  title: string;
  rationale: string;
  expectedImpact: string;
  priority: RecommendationPriority;
  territoryLabel: string | null;
  owner: string | null;
};

export type ExecutiveForecastSummary = {
  territoriesAtRisk: number;
  overloadedRecruiters: number;
  overloadedDms: number;
  topRiskTerritory: { dmName: string; territoryLabel: string } | null;
  topRecommendation: ExecutiveForecastRecommendation | null;
  forecastConfidence: ForecastConfidenceLevel;
  narrative: string;
};

export type ExecutiveRecruitingForecastKpis = {
  projectedHires30: number;
  projectedHires60: number;
  projectedHires90: number;
  projectedApplicants90: number;
  overloadedRecruiters: number;
  overloadedDms: number;
  territoriesAtRisk: number;
  projectsAtRisk: number;
};

export type ExecutiveRecruitingForecastSnapshot = {
  generatedAt: string;
  dataTrust: DataTrustLevel;
  forecastConfidence: ForecastConfidenceLevel;
  executiveSummary: ExecutiveForecastSummary;
  assumptions: string[];
  partialSync: boolean;
  kpis: ExecutiveRecruitingForecastKpis;
  hiringForecasts: HiringForecastHorizon[];
  weeklyHireForecast: WeeklyHireForecastPoint[];
  recruiterCapacity: RecruiterCapacityRow[];
  dmCapacity: DmCapacityRow[];
  territoryShortages: TerritoryShortageForecastRow[];
  projectCompletionRisks: ProjectCompletionRiskRow[];
  recommendations: ExecutiveForecastRecommendation[];
};
