import { loadPilotConfig } from "@/lib/p122-controlled-live-paperwork-pilot/pilot-config";
import { getIngestedCandidatesSnapshot } from "@/lib/candidate-ingestion";
import { peekBreezyCandidatesCache } from "@/lib/breezy-api";
import { buildRecruitingLiveSnapshot } from "@/lib/recruiting-live-snapshot";
import {
  LIVE_SNAPSHOT_FALLBACK_RULES,
  evaluateIngestionFallback,
} from "@/lib/p143-live-snapshot-ingestion-fallback/resolve-live-snapshot-candidates";
import type { LiveSnapshotIngestionFallbackArtifact } from "@/lib/p143-live-snapshot-ingestion-fallback/types";
import { P143_SOURCE_PHASE } from "@/lib/p143-live-snapshot-ingestion-fallback/types";

export async function buildLiveSnapshotIngestionFallbackArtifact(): Promise<LiveSnapshotIngestionFallbackArtifact> {
  const generatedAt = new Date().toISOString();
  const pilotConfig = loadPilotConfig();
  const ingested = await getIngestedCandidatesSnapshot();
  const peekPreview = peekBreezyCandidatesCache({ scanMode: "preview" });
  const previewCount = peekPreview?.ok ? peekPreview.candidates.length : 0;
  const ingestionCount = ingested?.candidates.length ?? 0;

  const previewOnlyBefore = previewCount;
  const uiWouldShowBeforeFix =
    previewOnlyBefore === 0 && ingestionCount > 0 ? 0 : previewOnlyBefore;

  const snapshot = await buildRecruitingLiveSnapshot();

  return {
    sourcePhase: P143_SOURCE_PHASE,
    generatedAt,
    beforeCounts: {
      previewOnly: previewOnlyBefore,
      ingestionStore: ingestionCount > 0 ? ingestionCount : null,
      uiWouldShowBeforeFix,
    },
    afterCounts: {
      liveSnapshotCandidateCount: snapshot.ok ? snapshot.candidateCount : null,
      candidateSource: snapshot.ok ? snapshot.candidateSource : null,
      syncStatus: snapshot.ok ? snapshot.syncStatus : null,
    },
    fallbackRules: LIVE_SNAPSHOT_FALLBACK_RULES,
    uiMetadata: snapshot.ok
      ? {
          candidateSource: snapshot.candidateSource,
          candidateCount: snapshot.candidateCount,
          ingestionCandidateCount: snapshot.ingestionCandidateCount,
          previewCandidateCount: snapshot.previewCandidateCount,
          fallbackReason: snapshot.fallbackReason,
          candidatesFreshnessTimestamp: snapshot.candidatesFreshnessTimestamp,
        }
      : null,
    safetyConfirmation: {
      executeBatchCalled: false,
      breezyWrites: false,
      liveModeEnabled: pilotConfig.liveModeEnabled,
      paperworkSent: false,
      p122ExecutionUnchanged: true,
    },
  };
}

export { evaluateIngestionFallback };
