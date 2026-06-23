import type { ControlCenterSnapshot } from "@/lib/hiring-automation-engine/types";

export type CoverageStatus = "Healthy" | "Watch" | "At Risk" | "Critical";

export type TerritoryCoverageNeed = {
  territoryKey: string;
  territoryLabel: string;
  dmName: string;
  states: string[];
  openCalls: number;
  activeReps: number;
  pipelineCandidates: number;
  applicantCount: number;
  coverageStatus: CoverageStatus;
  coverageNeedScore: number;
  drivers: string[];
  recommendedAction: string;
};

export type PostingApprovalStatus = "pending" | "approved" | "auto-approved";

export type RecommendedAd = {
  id: string;
  title: string;
  city: string;
  state: string;
  territory: string;
  reason: string;
  expectedApplicants: { min: number; max: number };
  priority: "high" | "medium" | "low";
  approvalStatus: PostingApprovalStatus;
  coverageNeedScore?: number;
  positionId?: string;
  breezyJobId?: string;
  adType: "create-new-ad" | "close-pause-ad" | "refresh-ad";
};

export type HiringRecommendationAction = "Hire Now" | "Interview" | "Hold" | "Reject";

export type HiringRecommendation = {
  candidateId: string;
  candidateName: string;
  positionName: string;
  city: string;
  state: string;
  territory: string;
  recommendedAction: HiringRecommendationAction;
  grade: string;
  confidence: string;
  coverageContext: string;
  reasons: string[];
};

export type ApprovalRuleStatus = "enabled" | "disabled";

export type ApprovalRuleCondition = {
  coverageNeedScoreMin?: number;
  applicantCountMax?: number;
  adType?: "create-new-ad" | "close-pause-ad" | "refresh-ad";
  priority?: "high" | "medium" | "low";
};

export type ApprovalRule = {
  id: string;
  name: string;
  status: ApprovalRuleStatus;
  condition: ApprovalRuleCondition;
  action: "auto-approve";
  lastTriggered?: string;
  successRate: number;
  triggerCount: number;
  successCount: number;
};

export type AutopilotKpis = {
  coverageNeedsDetected: number;
  adsRecommended: number;
  adsAutoApproved: number;
  candidatesRecommendedForHire: number;
  estimatedHoursSaved: number;
  hoursSavedFormula: string;
};

export type PipelineFlowStep = {
  id: string;
  label: string;
  count: number;
};

export type AutomationRunsSummary = {
  pending: number;
  approved: number;
  executed: number;
  failed: number;
  rejected: number;
  generatedAt: string;
};

export type AutonomousRecruitingSnapshot = {
  fetchedAt: string;
  territoryStates: string[] | null;
  kpis: AutopilotKpis;
  pipelineFlow: PipelineFlowStep[];
  coverageNeeds: TerritoryCoverageNeed[];
  postingRecommendations: RecommendedAd[];
  hiringRecommendations: HiringRecommendation[];
  approvalRules: ApprovalRule[];
  automationRuns: AutomationRunsSummary;
};

export function summarizeAutomationRuns(snapshot: ControlCenterSnapshot): AutomationRunsSummary {
  return {
    pending: snapshot.pending.length,
    approved: snapshot.approved.length,
    executed: snapshot.executed.length,
    failed: snapshot.failed.length,
    rejected: snapshot.rejected.length,
    generatedAt: snapshot.generatedAt,
  };
}
