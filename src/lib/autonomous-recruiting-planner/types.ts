import type { UserRole } from "@/lib/auth/types";
import type { HiringForecastHorizon } from "@/lib/workforce-capacity-forecast/types";

export type PlanningHorizon = "7d" | "14d" | "30d";

export type PlannerHorizon = Extract<HiringForecastHorizon, PlanningHorizon>;

export type PlannerConfidenceLevel = "high" | "medium" | "low";

export type PlannerEffortLevel = "low" | "medium" | "high";

export type ProjectOutlookStatus = "on-track" | "needs-intervention" | "needs-resources";

export type ResourceAllocationKind =
  | "recruiter-assignment"
  | "territory-assignment"
  | "priority-project"
  | "candidate-recovery";

export type GoalKind =
  | "coverage-95"
  | "open-calls-50"
  | "hires-20"
  | "critical-territories";

export type AutonomousRecruitingPlannerScope = {
  role: UserRole;
  territoryStates: string[];
  territoryLabel: string;
  dmName?: string;
  recruiterName?: string;
  scopedToTerritory: boolean;
  scopedToRecruiter: boolean;
};

export type PlannerOutcomeMetrics = {
  coveragePercent: number;
  completionPercent: number;
  expectedHires: number;
  openCallsReduced: number;
  riskReduction: number;
  criticalTerritories: number;
};

export type RecruitingPlan = {
  id: string;
  horizon: PlannerHorizon;
  label: string;
  optimizationScore: number;
  confidenceScore: number;
  outcomes: PlannerOutcomeMetrics;
  headline: string;
  keyActions: string[];
};

export type ResourceAllocationRecommendation = {
  id: string;
  kind: ResourceAllocationKind;
  title: string;
  detail: string;
  fromLabel?: string;
  toLabel?: string;
  expectedCoverageGain: number;
  expectedHireGain: number;
  expectedOpenCallReduction: number;
  priorityScore: number;
  confidenceScore: number;
};

export type ProjectPlanOutlook = {
  projectId: string;
  projectName: string;
  dmName: string;
  status: ProjectOutlookStatus;
  currentCoveragePercent: number;
  projectedCoveragePercent: number;
  openCalls: number;
  riskScore: number;
  reason: string;
  recommendedActions: string[];
};

export type TerritoryActionPlan = {
  territoryId: string;
  territoryLabel: string;
  dmName: string;
  actions: Array<{
    id: string;
    title: string;
    expectedImpact: string;
    effort: PlannerEffortLevel;
    confidence: PlannerConfidenceLevel;
    impactScore: number;
    priorityScore: number;
  }>;
};

export type RecruiterWorkPlan = {
  recruiterName: string;
  weekLabel: string;
  candidatePriorities: Array<{ id: string; label: string; reason: string; priorityScore: number }>;
  territoryPriorities: Array<{ territory: string; reason: string; priorityScore: number }>;
  followUpPriorities: Array<{ id: string; label: string; dueLabel: string; priorityScore: number }>;
  capacityState: string;
  workloadSummary: string;
};

export type StrategyTradeOff = {
  dimension: string;
  bestPlanValue: string;
  alternativeValue: string;
  tradeOff: string;
};

export type ExecutiveStrategyView = {
  bestPlan: RecruitingPlan;
  alternativePlans: RecruitingPlan[];
  tradeOffs: StrategyTradeOff[];
  expectedOutcomes: string[];
  headline: string;
};

export type GoalTarget = {
  kind: GoalKind;
  label: string;
  targetValue: number;
  currentValue: number;
  gap: number;
  achievable: boolean;
  requiredActions: string[];
  projectedValue: number;
};

export type GoalPlanningResult = {
  goals: GoalTarget[];
  overallAchievable: boolean;
  summary: string;
};

export type RiskConstraintSummary = {
  recruiterCapacityBlocked: number;
  dmCapacityBlocked: number;
  territoryRiskBlocked: number;
  candidateAvailabilityBlocked: number;
  constraints: string[];
};

export type AutonomousRecruitingPlannerSnapshot = {
  generatedAt: string;
  planDate: string;
  scope: AutonomousRecruitingPlannerScope;
  plans: RecruitingPlan[];
  resourceAllocation: ResourceAllocationRecommendation[];
  projectOutlooks: ProjectPlanOutlook[];
  territoryActionPlans: TerritoryActionPlan[];
  recruiterWorkPlans: RecruiterWorkPlan[];
  executiveStrategy: ExecutiveStrategyView;
  goalPlanning: GoalPlanningResult;
  riskConstraints: RiskConstraintSummary;
};

export type PlannerGoalParams = {
  targetCoveragePercent?: number;
  targetOpenCallReductionPercent?: number;
  targetHireIncreasePercent?: number;
  reduceCriticalTerritories?: boolean;
};
