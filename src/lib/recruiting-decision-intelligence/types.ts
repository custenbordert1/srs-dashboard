import type { DmAlertPriority } from "@/lib/dm-dashboard/dm-alert-priority";
import type { JobVariantQueueStatus } from "@/lib/job-management/job-draft-types";
import type {
  CoverageHealthMetrics,
  NeedsAttentionAlert,
} from "@/lib/recruiting-decision-intelligence/needs-attention-alerts";

export type RecruiterSuggestedActionType =
  | "increase-pay"
  | "expand-radius"
  | "clone-metro"
  | "repost"
  | "escalate-priority"
  | "merge-cities"
  | "route-coverage"
  | "close-stale-duplicate";

export type RecruiterSuggestedAction = {
  id: string;
  type: RecruiterSuggestedActionType;
  title: string;
  reason: string;
  impactEstimate: string;
  urgency: DmAlertPriority;
  jobId?: string;
  city?: string;
  state?: string;
  relatedVariantDraftId?: string;
  relatedEscalationId?: string;
  /** Recommendations only — never triggers automation. */
  manualOnly: true;
};

export type CoverageJobSignals = {
  jobId: string;
  jobTitle: string;
  city: string;
  state: string;
  nearbyActiveReps25Mi: number;
  pendingVariantsNearby: number;
  approvedUnpublishedVariantsNearby: number;
  publishedVariantsNearby: number;
  strongerApplicantFlowCities: string[];
  territorySaturationScore: number;
  openOpportunityCount: number;
  staffingRiskScore: number;
  recommendedExpansionCities: string[];
  recommendedExpansionRadiusMiles: number;
  daysWithoutHire: number | null;
  jobAgeDays: number | null;
};

export type CoverageRecommendation = CoverageJobSignals & {
  summaryBullets: string[];
};

export type VariantPerformanceMarker = "best" | "weakest" | "aging" | null;

export type VariantPerformanceRow = {
  draftId: string;
  variantGroupId: string;
  variantIndex: number;
  sourceJobId: string;
  title: string;
  cityTarget: string;
  state: string;
  queueStatus: JobVariantQueueStatus;
  published: boolean;
  applicants: number;
  interviews: number;
  hires: number;
  conversionPercent: number | null;
  ageDays: number;
  marker: VariantPerformanceMarker;
  warning?: string;
};

export type TerritoryMarketRow = {
  label: string;
  city: string;
  state: string;
  score: number;
  openJobs: number;
  applicants7d: number;
  escalationCount: number;
};

export type TerritoryIntelligenceSnapshot = {
  territoryLabel: string;
  territoryStates: string[];
  staffingPressureScore: number;
  strongestMarkets: TerritoryMarketRow[];
  weakestMarkets: TerritoryMarketRow[];
  fastestGrowingMarkets: TerritoryMarketRow[];
  highestEscalationZones: TerritoryMarketRow[];
  bestConversionTerritory: string | null;
  highestRiskTerritory: string | null;
  topRiskCities: TerritoryMarketRow[];
  topOpportunityCities: TerritoryMarketRow[];
};

export type {
  CoverageHealthMetrics,
  NeedsAttentionAlert,
  NeedsAttentionAlertKind,
} from "@/lib/recruiting-decision-intelligence/needs-attention-alerts";

export type RecruiterDecisionIntelligenceSnapshot = {
  fetchedAt: string;
  coverageRecommendations: CoverageRecommendation[];
  suggestedActions: RecruiterSuggestedAction[];
  variantPerformance: VariantPerformanceRow[];
  territory: TerritoryIntelligenceSnapshot;
  recommendedNextActions: RecruiterSuggestedAction[];
  needsAttentionAlerts: NeedsAttentionAlert[];
  coverageHealth: CoverageHealthMetrics;
};
