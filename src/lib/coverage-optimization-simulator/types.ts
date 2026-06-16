import type { AutopilotRecommendation } from "@/lib/recruiting-autopilot/types";
import type { UserRole } from "@/lib/auth/types";

export type SimulatorScenarioKind =
  | "increase-pay"
  | "expand-radius"
  | "add-recruiter"
  | "add-budget"
  | "re-engage-candidates"
  | "territory-blitz"
  | "refresh-job-postings";

export type ResourceAllocationKind =
  | "move-recruiter"
  | "reassign-territory"
  | "prioritize-project"
  | "reallocate-budget";

export type CoverageImpactMetrics = {
  additionalCandidates: number;
  additionalHires: number;
  coveragePercent: number;
  openCallsReduced: number;
  riskReduction: number;
};

export type CoverageImpactComparison = {
  current: CoverageImpactMetrics;
  projected: CoverageImpactMetrics;
  difference: CoverageImpactMetrics;
};

export type SimulatorScenarioDefinition = {
  kind: SimulatorScenarioKind;
  label: string;
  description: string;
  autopilotKinds: AutopilotRecommendation["kind"][];
  baseRoiMultiplier: number;
};

export type SimulatorScenarioResult = {
  id: string;
  kind: SimulatorScenarioKind;
  label: string;
  territoryId?: string;
  territoryLabel?: string;
  dmName?: string;
  projectId?: string;
  projectLabel?: string;
  impact: CoverageImpactComparison;
  expectedRoiScore: number;
  confidenceScore: number;
  confidenceLow: number;
  confidenceHigh: number;
  reasoning: string;
};

export type RecommendationSimulationTest = {
  recommendationId: string;
  recommendationTitle: string;
  recommendationKind: AutopilotRecommendation["kind"];
  entityLabel: string;
  expectedImpact: CoverageImpactMetrics;
  simulatedImpact: CoverageImpactMetrics;
  confidenceLow: number;
  confidenceHigh: number;
  alignmentScore: number;
};

export type ResourceAllocationSimulation = {
  id: string;
  kind: ResourceAllocationKind;
  label: string;
  fromLabel?: string;
  toLabel?: string;
  impact: CoverageImpactComparison;
  expectedRoiScore: number;
  confidenceScore: number;
};

export type TerritorySimulatorOption = {
  entityId: string;
  entityType: "territory" | "dm" | "project" | "store-cluster";
  label: string;
  dmName: string;
  states: string[];
  currentCoveragePercent: number;
  openCalls: number;
  riskScore: number;
};

export type OptimizationSuggestion = {
  rank: 1 | 2;
  scenario: SimulatorScenarioResult;
  expectedRoiScore: number;
  confidenceScore: number;
};

export type ForecastComparison = {
  currentForecast: CoverageImpactMetrics;
  optimizedForecast: CoverageImpactMetrics;
  coverageImprovement: number;
  candidateImprovement: number;
  hiringImprovement: number;
  riskReduction: number;
};

export type CoverageOptimizationSimulatorScope = {
  role: UserRole;
  territoryStates: string[];
  territoryLabel: string;
  dmName?: string;
  recruiterName?: string;
  scopedToTerritory: boolean;
  scopedToRecruiter: boolean;
};

export type CoverageOptimizationSimulatorSnapshot = {
  generatedAt: string;
  planDate: string;
  scope: CoverageOptimizationSimulatorScope;
  baseline: CoverageImpactMetrics;
  scenarios: SimulatorScenarioResult[];
  topRoiScenarios: SimulatorScenarioResult[];
  recommendationTests: RecommendationSimulationTest[];
  resourceAllocations: ResourceAllocationSimulation[];
  optimizationSuggestions: OptimizationSuggestion[];
  forecastComparison: ForecastComparison;
  territoryOptions: TerritorySimulatorOption[];
  activeScenarioId: string | null;
};
