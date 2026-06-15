import type { AiActionKind } from "@/lib/ai-action-engine/types";
import type { DistrictManager } from "@/lib/dm-territory-map";

/** Operational action categories surfaced in the Action Center queue. */
export type ActionRecommendationCategory =
  | "critical-territory"
  | "coverage-risk"
  | "zero-applicant-jobs"
  | "paperwork-aging"
  | "open-calls-at-risk"
  | "recruiter-follow-up-risk"
  | "project-risk"
  | "rep-shortage"
  | "staffing-shortage"
  | "recruiter-overload"
  | "dm-escalation";

export type ActionRecommendationStatus = "open" | "in-progress" | "resolved";

export type ActionOwnerRole = "dm" | "recruiter" | "executive" | "operations";

export type ActionRecommendationSource =
  | "territory-intelligence"
  | "workforce-ops"
  | "candidate-queue"
  | "project-risk"
  | "recruiter-workload"
  | "rep-capacity";

export type ActionRecommendationCard = {
  id: string;
  category: ActionRecommendationCategory;
  categoryLabel: string;
  issue: string;
  impact: string;
  impactScore: number;
  owner: string;
  ownerRole: ActionOwnerRole;
  suggestedAction: string;
  dueDate: string | null;
  status: ActionRecommendationStatus;
  dmName?: DistrictManager;
  state?: string;
  city?: string;
  jobId?: string;
  candidateId?: string;
  opportunityId?: string;
  source: ActionRecommendationSource;
  /** Future automation hook — no execution in P19. */
  automationKind?: AiActionKind;
  manualOnly: true;
};

export type TerritoryPlaybookStep = {
  order: number;
  action: string;
  automationKind?: AiActionKind;
};

export type TerritoryPlaybook = {
  id: string;
  dmName: DistrictManager;
  territoryLabel: string;
  problem: string;
  whyItMatters: string;
  impactScore: number;
  recommendedActions: TerritoryPlaybookStep[];
};

export type ProjectRiskLevel = "critical" | "high" | "moderate" | "healthy";

export type ProjectRiskRow = {
  opportunityId: string;
  projectName: string;
  client: string;
  location: string;
  dmName: string;
  riskLevel: ProjectRiskLevel;
  riskReason: string;
  openCalls: number;
  coveragePercent: number;
  applicantVelocityLabel: string;
  repAvailabilityScore: number;
};

export type RecruiterOverloadLevel = "balanced" | "elevated" | "overloaded";

export type RecruiterWorkloadRow = {
  recruiterName: string;
  assignedCount: number;
  followUpsDue: number;
  paperworkPending: number;
  readyForMel: number;
  workloadScore: number;
  overloadLevel: RecruiterOverloadLevel;
  recommendedRedistribution: string;
};

export type RepCapacityLabel = "can-absorb" | "near-capacity" | "at-risk";

export type RepCapacityRow = {
  dmName: DistrictManager;
  activeReps: number;
  recentlyActiveReps: number;
  inactiveReps: number;
  openOpportunities: number;
  capacityScore: number;
  capacityLabel: RepCapacityLabel;
  recommendation: string;
};

export type TerritoryActionCenterSnapshot = {
  fetchedAt: string;
  priorityQueue: ActionRecommendationCard[];
  executiveRollup: ActionRecommendationCard[];
  dmActionQueue: ActionRecommendationCard[];
  recruiterActionQueue: ActionRecommendationCard[];
  territoryPlaybooks: TerritoryPlaybook[];
  projectRisks: ProjectRiskRow[];
  recruiterWorkloads: RecruiterWorkloadRow[];
  repCapacities: RepCapacityRow[];
  /** Company-wide actions sorted by impact (max 25). */
  actionBoard: ActionRecommendationCard[];
  meta: {
    totalActions: number;
    criticalCount: number;
    manualOnly: true;
  };
};
