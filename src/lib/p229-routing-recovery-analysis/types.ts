/** P229 — Routing Quality Recovery & Eligibility Expansion (read-only). */

import type { P228CoverageTier, P228EligibilityBlocker } from "@/lib/p228-production-readiness/types";

export const P229_PHASE = "P229" as const;
export const P229_EXECUTION_MODE = "read_only" as const;
export const P229_SCHEMA_VERSION = 1 as const;

export const P229_BATCH_OPTIONS = [5, 10, 20, 50] as const;
export type P229BatchSize = (typeof P229_BATCH_OPTIONS)[number];

/** Primary recovery buckets (most-blocking path wins). */
export const P229_CATEGORIES = ["A", "B", "C", "D", "E", "F"] as const;
export type P229Category = (typeof P229_CATEGORIES)[number];

export const P229_CATEGORY_LABELS: Record<P229Category, string> = {
  A: "Automatically recoverable",
  B: "Recoverable after geocode refresh",
  C: "Recoverable after Position.Location repair",
  D: "Recoverable after DM routing",
  E: "Requires operator review",
  F: "Not recoverable",
};

/** Routing blockers in scope for P229. */
export const P229_ROUTING_BLOCKERS = [
  "coverage_unknown",
  "missing_assigned_dm",
  "missing_location",
] as const;
export type P229RoutingBlocker = (typeof P229_ROUTING_BLOCKERS)[number];

export type P229RecoveryCapability =
  | "automatic"
  | "authoritative_data"
  | "operator_review"
  | "cannot_recover";

export type P229LocationProposal = {
  currentCity: string;
  currentState: string;
  currentZip: string;
  proposedCity: string | null;
  proposedState: string | null;
  proposedZip: string | null;
  wouldChange: boolean;
  authoritativeSource: string | null;
  ambiguous: boolean;
  conflictingValues: string[];
};

export type P229DmProposal = {
  currentAssignedDM: string;
  proposedAssignedDM: string | null;
  expectedDmFromRouting: string | null;
  routingState: string | null;
  wouldChange: boolean;
  authoritativeSource: string | null;
  ambiguous: boolean;
};

export type P229CoverageProposal = {
  currentKnown: boolean;
  currentMiles: number | null;
  currentTier: P228CoverageTier;
  proposedKnown: boolean;
  proposedMiles: number | null;
  proposedTier: P228CoverageTier;
  geocodeCacheHit: boolean;
  needsGeocodeRefresh: boolean;
  authoritativeSource: string | null;
};

export type P229CandidateOpportunity = {
  candidateId: string;
  redactedCandidateId: string;
  name: string;
  email: string;
  city: string;
  state: string;
  zip: string;
  positionId: string;
  positionName: string;
  workflowStatus: string;
  paperworkStatus: string;
  assignedDM: string;
  assignedRecruiter: string;
  listMembershipSource: string;
  nearestActiveWorkMiles: number | null;
  coverageKnown: boolean;
  coverageTier: P228CoverageTier;
  currentBlockers: P228EligibilityBlocker[];
  routingBlockers: P229RoutingBlocker[];
  primaryCategory: P229Category;
  secondaryCategories: P229Category[];
  recoveryCapability: P229RecoveryCapability;
  locationProposal: P229LocationProposal;
  dmProposal: P229DmProposal;
  coverageProposal: P229CoverageProposal;
  simulatedBlockers: P228EligibilityBlocker[];
  simulatedEligible: boolean;
  routingClearedAfterSim: boolean;
  notes: string[];
};

export type P229CategoryCounts = Record<P229Category, number>;

export type P229MarketRow = {
  state: string;
  city: string;
  blockedTotal: number;
  coverageUnknown: number;
  missingAssignedDm: number;
  missingLocation: number;
  recoverableA: number;
  recoverableB: number;
  recoverableC: number;
  recoverableD: number;
  operatorReviewE: number;
  notRecoverableF: number;
};

export type P229StateMarketRow = {
  state: string;
  blockedTotal: number;
  coverageUnknown: number;
  missingAssignedDm: number;
  missingLocation: number;
  recoverableTotal: number;
  byCategory: P229CategoryCounts;
};

export type P229RoutingScoreSnapshot = {
  score: number;
  level: "Low" | "Medium" | "High";
  coverageUnknownCount: number;
  coverageUnknownPct: number;
  missingDmCount: number;
  missingDmPct: number;
  missingLocationCount: number;
  over60Count: number;
  workflowActive: number;
};

export type P229BatchFeasibility = {
  batchSize: P229BatchSize;
  feasibleNow: boolean;
  feasibleProjected: boolean;
  feasibleRoutingReady: boolean;
  note: string;
};

export type P229EligibilitySimulation = {
  currentEligible: number;
  projectedEligible: number;
  increase: number;
  workflowActiveEvaluated: number;
  routingBlockedCurrent: number;
  routingClearedProjected: number;
  routingClearedIncrease: number;
  /** Would pass hard send gates if stage were Paperwork Needed + not_sent (capacity estimate). */
  potentialSendReadyIfPaperworkNeeded: number;
  remainingBlockersAfterSim: Array<{ blocker: P228EligibilityBlocker | "eligible"; count: number }>;
  batchFeasibility: P229BatchFeasibility[];
};

export type P229OperationalImpact = {
  additionalPaperworkCandidates: number;
  additionalWeeklyOnboardingCapacityLow: number;
  additionalWeeklyOnboardingCapacityHigh: number;
  expectedRecruiterWorkloadDelta: string;
  expectedDmWorkloadDelta: string;
  notes: string[];
};

export type P229AnalysisResult = {
  phase: typeof P229_PHASE;
  schemaVersion: typeof P229_SCHEMA_VERSION;
  executionMode: typeof P229_EXECUTION_MODE;
  generatedAt: string;
  categoryCounts: P229CategoryCounts;
  opportunities: P229CandidateOpportunity[];
  eligibility: P229EligibilitySimulation;
  routingCurrent: P229RoutingScoreSnapshot;
  routingProjected: P229RoutingScoreSnapshot;
  markets: {
    topRecoverableStates: P229StateMarketRow[];
    topRecoverableCities: P229MarketRow[];
    highestCoverageUnknown: P229StateMarketRow[];
    highestMissingDm: P229StateMarketRow[];
    highestMissingLocation: P229StateMarketRow[];
  };
  operationalImpact: P229OperationalImpact;
  engineeringPriorities: string[];
  safety: {
    candidateWrites: false;
    workflowChanges: false;
    recruiterAssignments: false;
    dmAssignments: false;
    dropboxSign: false;
    melWrites: false;
    breezyWrites: false;
    deployment: false;
    commits: false;
    simulationPersistence: false;
  };
};
