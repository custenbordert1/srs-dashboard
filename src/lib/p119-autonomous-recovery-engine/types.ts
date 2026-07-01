import type { PaperworkBlockerCategory } from "@/lib/p106-autonomous-paperwork-engine/types";
import type { QueueDepth } from "@/lib/p118-autonomous-paperwork-operations-center/types";

export const P119_SOURCE_PHASE = "P119";
export const P119_DEFAULT_MODE = "dryRun" as const;

export type RecoveryCategory =
  | "AUTO_RECOVERABLE"
  | "REQUIRES_MAPPING_APPROVAL"
  | "UNPUBLISHED_JOB"
  | "INVALID_EMAIL"
  | "DUPLICATE_RISK"
  | "AWAITING_SIGNATURE"
  | "READY_AFTER_SIGNATURE"
  | "READY_AFTER_JOB_POSTED"
  | "MANUAL_RECRUITER_REVIEW"
  | "DO_NOT_RECOVER";

export type RecoveryActionType =
  | "Approve Mapping"
  | "Publish Job"
  | "Contact Candidate"
  | "Fix Email"
  | "Wait for Signature"
  | "Reject Mapping"
  | "Escalate"
  | "Ignore"
  | "Auto Repair";

export type RecoveryEffort = "low" | "medium" | "high";

export type RecoveryCandidateAnalysis = {
  candidateId: string;
  candidateName: string;
  positionId: string | null;
  positionTitle: string | null;
  blockerCategory: PaperworkBlockerCategory | null;
  recoveryCategory: RecoveryCategory;
  recoveryReason: string;
  estimatedUnlock: number;
  estimatedEffort: RecoveryEffort;
  confidence: number;
  blockingSystem: string;
  recommendedNextAction: string;
  recoveryScore: number;
  autoRepairable: boolean;
};

export type RecoveryActionQueueItem = {
  actionId: string;
  actionType: RecoveryActionType;
  priority: number;
  expectedUnlockCount: number;
  estimatedPaperworkIncrease: number;
  estimatedRecruiterMinutes: number;
  businessImpact: "high" | "medium" | "low";
  reason: string;
  candidateIds: string[];
  recoveryCategories: RecoveryCategory[];
  sourcePhase: string;
};

export type RecoveryDistribution = {
  category: RecoveryCategory;
  count: number;
  estimatedUnlock: number;
  averageScore: number;
};

export type RecoveryOpportunity = {
  candidateId: string;
  candidateName: string;
  recoveryCategory: RecoveryCategory;
  recoveryScore: number;
  estimatedUnlock: number;
  recommendedNextAction: string;
};

export type LargestBlocker = {
  blockerCategory: string;
  count: number;
  recoveryCategory: RecoveryCategory;
  estimatedUnlock: number;
};

export type ImpactSimulationScenario = {
  scenario: string;
  actionsIncluded: number;
  expectedPaperworkUnlocked: number;
  candidateIds: string[];
};

export type ImpactSimulation = {
  top5: ImpactSimulationScenario;
  top10: ImpactSimulationScenario;
  allRecoverable: ImpactSimulationScenario;
};

export type RecoveryTrendPoint = {
  label: string;
  blockedCount: number;
  recoverableCount: number;
  averageRecoveryScore: number;
};

export type AutonomousRecoveryReport = {
  sourcePhase: typeof P119_SOURCE_PHASE;
  generatedAt: string;
  mode: typeof P119_DEFAULT_MODE;
  summary: string;
  goNoGo: "GO" | "NO-GO";
  goNoGoReason: string;
  health: {
    currentMode: string;
    runnerScheduleEnabled: boolean;
    lastRunAt: string | null;
    blockedCount: number;
    readyToSend: number;
  };
  recoveryDistribution: RecoveryDistribution[];
  recoveryCandidates: RecoveryCandidateAnalysis[];
  actionQueue: RecoveryActionQueueItem[];
  topOpportunities: RecoveryOpportunity[];
  largestBlockers: LargestBlocker[];
  executiveSummary: {
    highestImpactActions: RecoveryActionQueueItem[];
    topRecoveryOpportunities: RecoveryOpportunity[];
    largestBlockers: LargestBlocker[];
    estimatedPaperworkUnlocked: number;
    estimatedRecruiterHoursSaved: number;
    recoveryDistribution: RecoveryDistribution[];
    recoveryTrend: RecoveryTrendPoint[];
  };
  impactSimulation: ImpactSimulation;
  topRecommendations: string[];
  queueDepth: QueueDepth;
  warnings: string[];
};
