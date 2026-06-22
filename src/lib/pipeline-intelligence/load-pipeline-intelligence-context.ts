import { applyTerritoryToCandidates } from "@/lib/auth/territory-filter";
import type { AuthSession } from "@/lib/auth/types";
import { buildBaselineWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import { buildPipelineIntelligenceSnapshot } from "@/lib/pipeline-intelligence/build-pipeline-intelligence-snapshot";
import type { PipelineIntelligenceSnapshot } from "@/lib/pipeline-intelligence/types";
import { buildRecruitingLiveSnapshot } from "@/lib/recruiting-live-snapshot";

export type PipelineIntelligenceLoadResult =
  | {
      ok: true;
      snapshot: PipelineIntelligenceSnapshot;
      partialSync: boolean;
      totalCandidates: number;
    }
  | {
      ok: false;
      error: string;
      partial?: boolean;
    };

export async function loadPipelineIntelligenceForSession(
  session: AuthSession,
): Promise<PipelineIntelligenceLoadResult> {
  const [liveSnapshot, workflows] = await Promise.all([
    buildRecruitingLiveSnapshot(),
    getCandidateWorkflowState(),
  ]);

  if (!liveSnapshot.ok) {
    return {
      ok: false,
      error: liveSnapshot.error,
      partial: Boolean(liveSnapshot.fallback),
    };
  }

  const candidates = applyTerritoryToCandidates(session, liveSnapshot.candidates.candidates);
  const rows = candidates.map((candidate) =>
    buildBaselineWorkflowRow(candidate, workflows[candidate.candidateId]),
  );
  const partialSync =
    liveSnapshot.syncStatus !== "ready" || (liveSnapshot.candidates.truncated ?? false);

  return {
    ok: true,
    snapshot: buildPipelineIntelligenceSnapshot(rows, liveSnapshot.fetchedAt),
    partialSync,
    totalCandidates: rows.length,
  };
}
