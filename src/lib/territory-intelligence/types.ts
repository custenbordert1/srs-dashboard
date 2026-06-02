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
