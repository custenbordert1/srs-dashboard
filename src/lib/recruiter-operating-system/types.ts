import type { UserRole } from "@/lib/auth/types";
import type { AutopilotRecommendation } from "@/lib/recruiting-autopilot/types";
import type {
  CommandCenterDrawerContext,
  CommandCenterWorkQueueItem,
} from "@/lib/unified-recruiting-command-center/types";

export type RecruiterCandidateHeat = "hot" | "warm" | "cold" | "at-risk";

export type RecruiterOutreachMethod = "call" | "text" | "email" | "dm-escalation";

export type RecruiterOperatingSystemScope = {
  recruiterName: string;
  recruiterLabel: string;
  territoryStates: string[];
  role: UserRole;
  scopedToRecruiter: boolean;
};

export type RecruiterOperatingSystemKpis = {
  assignedOpenCalls: number;
  activeCandidates: number;
  candidatesRequiringFollowUp: number;
  readyForPlacementCandidates: number;
  interviewsScheduled: number;
  territoryCoverageImpact: number;
  recruiterProductivityScore: number;
};

export type RecruiterActionQueueCategory =
  | "candidate-follow-up"
  | "re-engagement"
  | "store-coverage"
  | "territory-recommendation"
  | "dm-escalation";

export type RecruiterActionQueueItem = CommandCenterWorkQueueItem & {
  category: RecruiterActionQueueCategory;
  candidateId?: string;
  candidateName?: string;
  storeName?: string;
  projectName?: string;
  placementLikelihood: number;
  coverageImpact: number;
  responsivenessScore: number;
  urgencyScore: number;
  priorityScore: number;
};

export type RecruiterCandidatePriorityRow = {
  candidateId: string;
  candidateName: string;
  heat: RecruiterCandidateHeat;
  score: number;
  workflowStatus: string;
  city: string;
  state: string;
  projectName: string;
  storeName: string;
  lastActivityAt: string | null;
  appliedDate: string | null;
  recommendedNextAction: string;
  outreachMethod: RecruiterOutreachMethod;
  recommendedTiming: string;
  placementLikelihood: number;
  territoryDemandScore: number;
};

export type RecruiterDailyPlanAction = {
  rank: number;
  id: string;
  candidateId?: string;
  candidateName?: string;
  storeName?: string;
  projectName?: string;
  title: string;
  reason: string;
  expectedImpact: string;
  recommendedNextStep: string;
  impactScore: number;
};

export type ReEngagementSegment = "previous-applicant" | "stalled" | "abandoned" | "past-worker";

export type ReEngagementCandidate = {
  candidateId: string;
  candidateName: string;
  segment: ReEngagementSegment;
  opportunityScore: number;
  placementLikelihood: number;
  territoryImpact: number;
  lastTouchAt: string | null;
  appliedDate: string | null;
  city: string;
  state: string;
  recommendedAction: string;
};

export type PipelineStageBucket = {
  stage: string;
  count: number;
  avgDaysInStage: number;
  conversionRatePercent: number | null;
  stuckCount: number;
  followUpGapCount: number;
  highValueCount: number;
};

export type PipelineBottleneck = {
  id: string;
  stage: string;
  label: string;
  severity: "high" | "medium" | "low";
  stuckCandidates: number;
  avgDaysInStage: number;
  detail: string;
};

export type RecruiterProductivityTrend = {
  horizon: "7d" | "30d" | "90d";
  callsCompleted: number;
  followUpsCompleted: number;
  candidatesMovedForward: number;
  placementsInfluenced: number;
  coverageContribution: number;
};

export type RecruiterRecommendationKind =
  | "contact-candidate"
  | "re-engage"
  | "fill-store-first"
  | "focus-on-project"
  | "escalate-to-dm"
  | "increase-follow-up-frequency";

export type RecruiterRecommendation = {
  id: string;
  kind: RecruiterRecommendationKind;
  title: string;
  detail: string;
  impactScore: number;
  confidenceScore: number;
  expectedResult: string;
  source?: AutopilotRecommendation;
};

export type RecruiterOperatingSystemSnapshot = {
  generatedAt: string;
  planDate: string;
  scope: RecruiterOperatingSystemScope;
  kpis: RecruiterOperatingSystemKpis;
  actionQueue: RecruiterActionQueueItem[];
  candidatePriorities: RecruiterCandidatePriorityRow[];
  dailyPlan: RecruiterDailyPlanAction[];
  reEngagementCenter: ReEngagementCandidate[];
  pipelineHealth: {
    stages: PipelineStageBucket[];
    bottlenecks: PipelineBottleneck[];
    totalCandidates: number;
  };
  productivityMetrics: RecruiterProductivityTrend[];
  recommendations: RecruiterRecommendation[];
  drawerContextsByQueueId: Record<string, CommandCenterDrawerContext>;
};
