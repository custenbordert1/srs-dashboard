import type { UserRole } from "@/lib/auth/types";
import type { ExecutiveAlertStatus } from "@/lib/alerts/executive-alert-status-types";

export type CandidateOpportunitySource =
  | "previous-applicant"
  | "stalled"
  | "abandoned"
  | "past-worker"
  | "declined-previously"
  | "unfinished-onboarding"
  | "inactive";

export type CandidateReEngagementSegment =
  | "hot"
  | "warm"
  | "cold"
  | "dormant"
  | "former-worker"
  | "high-value";

export type OutreachRecommendationKind =
  | "call-today"
  | "text-today"
  | "email-today"
  | "escalate-to-recruiter"
  | "escalate-to-dm"
  | "fast-track-placement";

export type ReEngagementWorkflowAction =
  | "contacted"
  | "interested"
  | "not-interested"
  | "schedule-follow-up"
  | "escalate";

export type CandidateReEngagementScope = {
  recruiterName: string;
  recruiterLabel: string;
  territoryStates: string[];
  role: UserRole;
  scopedToRecruiter: boolean;
};

export type ReEngagementOpportunity = {
  candidateId: string;
  candidateName: string;
  source: CandidateOpportunitySource;
  segment: CandidateReEngagementSegment;
  reEngagementScore: number;
  placementProbability: number;
  territoryImpact: number;
  projectImpact: number;
  rankingScore: number;
  territory: string;
  state: string;
  city: string;
  projectName: string;
  storeName: string;
  assignedRecruiter: string;
  lastTouchAt: string | null;
  appliedDate: string | null;
  recommendedAction: string;
  recommendedTiming: string;
  expectedOutcome: string;
  outreach: ReEngagementOutreachRecommendation;
  workflowStatus: ExecutiveAlertStatus;
  workflowAlertId: string;
  followUpDueAt: string | null;
};

export type ReEngagementOutreachRecommendation = {
  kind: OutreachRecommendationKind;
  label: string;
  impactScore: number;
  confidenceScore: number;
  expectedResult: string;
};

export type TerritoryRecoveryForecast = {
  state: string;
  territoryLabel: string;
  recoverableCandidates: number;
  potentialPlacements: number;
  coverageImprovementPercent: number;
  openCallReduction: number;
  recoveryOpportunityScore: number;
};

export type CandidateReEngagementExecutiveSummary = {
  recoverableCandidates: number;
  potentialPlacements: number;
  estimatedCoverageGainPercent: number;
  topRecoveryTerritories: Array<{
    state: string;
    label: string;
    recoverableCandidates: number;
    recoveryOpportunityScore: number;
  }>;
};

export type CandidateReEngagementIntelligenceSnapshot = {
  generatedAt: string;
  planDate: string;
  scope: CandidateReEngagementScope;
  executiveSummary: CandidateReEngagementExecutiveSummary;
  top25: ReEngagementOpportunity[];
  top100: ReEngagementOpportunity[];
  territoryForecasts: TerritoryRecoveryForecast[];
  segmentCounts: Record<CandidateReEngagementSegment, number>;
  outreachRecommendations: ReEngagementOutreachRecommendation[];
};
