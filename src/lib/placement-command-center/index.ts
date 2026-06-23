export { buildHiringReadinessRows, resolveHiringReadinessStatus } from "@/lib/placement-command-center/build-hiring-readiness";
export { buildPlacementRecommendations } from "@/lib/placement-command-center/build-placement-intelligence";
export { buildPlacementFunnel } from "@/lib/placement-command-center/build-placement-funnel";
export { buildPlacementCommandCenterSnapshot } from "@/lib/placement-command-center/build-placement-dashboard-snapshot";
export type {
  AutoPlacementOpportunity,
  CoverageGapAwaitingCandidate,
  HiringReadinessRow,
  HiringReadinessStatus,
  PaperworkBottleneck,
  PlacementCommandCenterSnapshot,
  PlacementConfidence,
  PlacementFunnelStage,
  PlacementQueueItem,
  PlacementRecommendation,
  TimeToFillMetric,
} from "@/lib/placement-command-center/types";

export const P60_SOURCE_PHASE = "P60";
export const P60_SOURCE_MODULE = "placement-command-center";
