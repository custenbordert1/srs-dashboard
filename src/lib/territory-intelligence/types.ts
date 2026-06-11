import type { TerritoryHealthScore } from "@/lib/dm-dashboard/territory-health-score";
import type { DistrictManager } from "@/lib/dm-territory-map";
import type { CoverageHealthTier } from "@/lib/territory-intelligence/coverage-tier";

/** Canonical territory KPIs — single rollup model for DM Portal and Command Center. */
export type TerritoryMetrics = {
  coveragePercent: number;
  coverageTier: CoverageHealthTier;
  territoryHealth: TerritoryHealthScore;
  activeReps: number;
  openCalls: number;
  openJobs: number;
  applicantsLast7Days: number;
  hired: number;
  paperworkSent: number;
  readyForMel: number;
};

/** Organization- or territory-scoped recruiting pipeline counts. */
export type RecruitingPipelineMetrics = {
  applicantsLast7Days: number;
  paperworkSent: number;
  readyForMel: number;
  hired: number;
};

export type TerritoryRollupRow = {
  dmName: DistrictManager;
  states: string[];
  metrics: TerritoryMetrics;
  attentionScore: number;
};

export type TerritoryDemandSignals = {
  /** Sum of shortage bars when MEL coverage risk is unavailable. */
  shortageSum: number;
  unstaffedMelCount: number;
};

export type TerritoryOnboardingSignals = {
  paperworkSent: number;
  paperworkSigned: number;
  ddApproved: number;
  hired: number;
};

export type ApplicantVelocityTrend = {
  direction: "up" | "down" | "flat";
  current7d: number;
  prior7d: number;
  delta: number;
};

/** P9.3 territory intelligence center metrics per DM. */
export type TerritoryIntelligenceCenterMetrics = {
  openCalls: number;
  activeReps: number;
  coveragePercent: number;
  coverageTier: CoverageHealthTier;
  zeroApplicantJobs: number;
  lowApplicantFlowJobs: number;
  coverageRiskScore: number;
  recruiterWorkloadScore: number;
  hiresLast7Days: number;
  applicantVelocity: ApplicantVelocityTrend;
};

export type TerritoryRecommendation = {
  id: string;
  severity: "critical" | "high" | "medium";
  message: string;
  dmName: DistrictManager;
  state?: string;
  city?: string;
};

export type TerritoryHeatMapCell = {
  id: string;
  label: string;
  state: string;
  city?: string;
  tier: CoverageHealthTier;
  score: number;
  openJobs: number;
  zeroApplicantJobs: number;
};

export type TerritoryIntelligenceTerritoryRow = {
  dmName: DistrictManager;
  states: string[];
  metrics: TerritoryIntelligenceCenterMetrics;
  attentionScore: number;
  recommendations: TerritoryRecommendation[];
  heatMap: TerritoryHeatMapCell[];
};

export type TerritoryIntelligenceExecutiveRollup = {
  highestRiskTerritories: TerritoryIntelligenceTerritoryRow[];
  healthiestTerritories: TerritoryIntelligenceTerritoryRow[];
};

export type TerritoryIntelligenceCenterSnapshot = {
  fetchedAt: string;
  territories: TerritoryIntelligenceTerritoryRow[];
  executiveRollup: TerritoryIntelligenceExecutiveRollup;
  orgHeatMap: TerritoryHeatMapCell[];
};
