export {
  P143_SOURCE_PHASE,
  type IngestionFallbackReason,
  type LiveSnapshotCandidateMetadata,
  type LiveSnapshotCandidateSource,
  type LiveSnapshotIngestionFallbackArtifact,
  type LiveSnapshotIngestionFallbackRules,
} from "@/lib/p143-live-snapshot-ingestion-fallback/types";
export {
  LIVE_SNAPSHOT_FALLBACK_RULES,
  LIVE_SNAPSHOT_INGESTION_UNDERCOUNT_RATIO,
  evaluateIngestionFallback,
  resolveLiveSnapshotCandidates,
  type ResolveLiveSnapshotCandidatesInput,
  type ResolveLiveSnapshotCandidatesResult,
} from "@/lib/p143-live-snapshot-ingestion-fallback/resolve-live-snapshot-candidates";
