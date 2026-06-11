import type { BestRepMatchRow } from "@/lib/rep-intelligence/rep-types";
import type { StaffingRiskLevel } from "@/lib/coverage-risk-engine/types";

export type ScoredRepRecommendation = BestRepMatchRow & {
  confidenceScore: number;
  qualityScore: number;
  availabilityScore: number;
  travelTimeMinutes: number | null;
  overnightRequired: boolean;
  estimatedTravelCostUsd: number | null;
};

export type OpportunityRepRecommendation = {
  opportunityId: string;
  projectName: string;
  client: string;
  city: string;
  state: string;
  territoryOwner: string;
  bestRep: ScoredRepRecommendation | null;
  alternatives: ScoredRepRecommendation[];
  confidenceScore: number;
  fillProbability: number;
};

export type PrioritizedOpenCall = {
  opportunityId: string;
  projectName: string;
  client: string;
  city: string;
  state: string;
  territoryOwner: string;
  priorityScore: number;
  coverageRiskScore: number;
  deadlinePressure: number;
  territoryHealthScore: number;
  applicantAvailability: number;
  revenueImpactScore: number;
  staffingRisk: StaffingRiskLevel;
};

export type RoutePlanStop = {
  opportunityId: string;
  projectName: string;
  city: string;
  state: string;
  order: number;
  distanceFromPreviousMiles: number | null;
  driveTimeMinutes: number | null;
};

export type RoutePlan = {
  routeId: string;
  stops: RoutePlanStop[];
  totalMiles: number;
  totalDriveTimeMinutes: number;
  overnightRecommended: boolean;
  estimatedTotalCostUsd: number;
  hotelNights: number;
  mileageCostUsd: number;
  hotelCostUsd: number;
};

export type CoverageSimulationDelta = {
  territoryCoveragePercent: number;
  coverageRiskScore: number;
  openCallsImpacted: number;
  atRiskTerritories: number;
  deltaCoveragePercent: number;
  deltaRiskScore: number;
};

export type CoverageOptimizationExecutiveMetrics = {
  optimizationSavingsUsd: number;
  territoriesWithNoViableReps: string[];
  highestCostTerritories: Array<{ territory: string; estimatedCostUsd: number }>;
  averageFillProbability: number;
};

export type CoverageOptimizationSnapshot = {
  fetchedAt: string;
  recommendations: OpportunityRepRecommendation[];
  prioritizedOpenCalls: PrioritizedOpenCall[];
  executive: CoverageOptimizationExecutiveMetrics;
};
