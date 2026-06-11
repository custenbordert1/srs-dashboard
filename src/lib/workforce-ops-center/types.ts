import type { DistrictManager } from "@/lib/dm-territory-map";
import type { MelOpportunityPriority } from "@/lib/mel-matching/matching-engine-types";

export type MelOpportunityManagementRow = {
  opportunityId: string;
  projectName: string;
  client: string;
  storeName: string;
  city: string;
  state: string;
  territoryOwner: string;
  priority: MelOpportunityPriority;
  status: "open" | "filled" | "aging" | "coverage-gap";
  isStaffed: boolean;
  openStatus: boolean;
  agingDays: number | null;
  completionPercent: number;
};

export type MelOpportunityManagementSummary = {
  openByTerritory: number;
  filled: number;
  aging: number;
  coverageGaps: number;
  completionRatePercent: number;
  rows: MelOpportunityManagementRow[];
};

export type MelPipelineStatus = "ready" | "push-pending" | "assigned" | "loaded" | "completed" | "stalled";

export type MelPipelineItem = {
  candidateId: string;
  candidateName: string;
  recruiterName: string;
  dmName: string;
  state: string;
  city: string;
  workflowStatus: string;
  pipelineStatus: MelPipelineStatus;
  melReady: boolean;
  assignmentStatus: "unassigned" | "matched" | "assigned";
  completionStatus: "pending" | "in-progress" | "complete";
  topOpportunityId: string | null;
  topProjectName: string | null;
  fitPercent: number | null;
  daysInPipeline: number | null;
};

export type WorkforceHealthMetrics = {
  openCalls: number;
  filledCalls: number;
  coveragePercent: number;
  repUtilizationPercent: number;
  activeReps: number;
  newReps30Days: number;
  inactiveReps: number;
  atRiskTerritories: number;
};

export type WorkforceOpsExecutiveRollup = {
  recruitingToMelConversionPercent: number;
  avgTimeToFillDays: number | null;
  territoryFillRates: Array<{
    dmName: DistrictManager;
    fillRatePercent: number;
    openCalls: number;
    filledCalls: number;
  }>;
  workforceCapacityScore: number;
  repActivationTrend: Array<{ label: string; activeReps: number; newReps: number }>;
};

export type WorkforceOpsQueueItem = {
  id: string;
  category: "needs-assignment" | "missing-paperwork" | "coverage-gap" | "stalled-opportunity" | "unassigned-territory";
  severity: "critical" | "high" | "medium";
  title: string;
  detail: string;
  dmName?: DistrictManager;
  state?: string;
  candidateId?: string;
  opportunityId?: string;
};

export type TerritoryDrilldownRow = {
  dmName: DistrictManager;
  states: string[];
  recruiterPerformanceScore: number;
  dmPerformanceScore: number;
  melOpportunityScore: number;
  workforceHealthScore: number;
  openCalls: number;
  readyForMel: number;
  activeReps: number;
};

export type WorkforceOpsCenterSnapshot = {
  fetchedAt: string;
  melOpportunities: MelOpportunityManagementSummary;
  melPipeline: MelPipelineItem[];
  workforceHealth: WorkforceHealthMetrics;
  executiveRollup: WorkforceOpsExecutiveRollup;
  operationsQueue: WorkforceOpsQueueItem[];
  territoryDrilldowns: TerritoryDrilldownRow[];
};
