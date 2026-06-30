export const P106_3_SOURCE_PHASE = "P106.3";

export type ClosedAdMappingConfidence = "high" | "medium" | "low" | "none";

export type ClosedAdProjectMappingStatus =
  | "published"
  | "closed_ad_mapped_project"
  | "project_mapping_review"
  | "project_not_mappable";

export type ClosedAdProjectMappingResult = {
  status: ClosedAdProjectMappingStatus;
  confidence: ClosedAdMappingConfidence;
  passesPublishedJobGate: boolean;
  sourcePositionId: string | null;
  mappedPublishedJobId: string | null;
  mappedProjectName: string | null;
  mappedCity: string | null;
  mappedState: string | null;
  reason: string;
};

export type BlockedJobRecoveryGroup = {
  positionId: string;
  jobTitle: string;
  city: string;
  state: string;
  breezyStatus: string;
  candidateCount: number;
  candidateIds: string[];
  mappingStatus: ClosedAdProjectMappingStatus;
  recommendedAction: string;
};

export type BlockedJobRecoveryReport = {
  sourcePhase: typeof P106_3_SOURCE_PHASE;
  generatedAt: string;
  totalBlockedCandidates: number;
  recoveredByMappingCount: number;
  wouldSendAfterMappingCount: number;
  groups: BlockedJobRecoveryGroup[];
};
