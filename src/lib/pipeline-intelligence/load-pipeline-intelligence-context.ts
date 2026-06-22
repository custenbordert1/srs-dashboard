import { applyTerritoryToCandidates } from "@/lib/auth/territory-filter";
import type { AuthSession } from "@/lib/auth/types";
import { fetchBreezyCandidates, peekBreezyCandidatesCache } from "@/lib/breezy-api";
import { buildBaselineWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import { buildPipelineIntelligenceSnapshot } from "@/lib/pipeline-intelligence/build-pipeline-intelligence-snapshot";
import type { PipelineIntelligenceSnapshot } from "@/lib/pipeline-intelligence/types";

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

function emptyPipelineSnapshot(generatedAt: string): PipelineIntelligenceSnapshot {
  return buildPipelineIntelligenceSnapshot([], generatedAt);
}

/**
 * Cache-first loader — avoids buildRecruitingLiveSnapshot (KPI + intelligence rebuild)
 * so pipeline APIs respond within the client timeout budget.
 */
export async function loadPipelineIntelligenceForSession(
  session: AuthSession,
): Promise<PipelineIntelligenceLoadResult> {
  const [workflows, peekedCandidates] = await Promise.all([
    getCandidateWorkflowState(),
    Promise.resolve(peekBreezyCandidatesCache({ scanMode: "preview" })),
  ]);

  let candidatesResult = peekedCandidates;
  let candidatesFromCache = Boolean(peekedCandidates?.ok);

  if (!candidatesResult?.ok) {
    candidatesResult = await fetchBreezyCandidates({ scanMode: "preview" });
    candidatesFromCache = false;
  }

  const fetchedAt = candidatesResult.ok
    ? candidatesResult.fetchedAt
    : peekedCandidates?.fetchedAt ?? new Date().toISOString();

  if (!candidatesResult.ok) {
    if (peekedCandidates?.ok) {
      candidatesResult = peekedCandidates;
      candidatesFromCache = true;
    } else {
      return {
        ok: true,
        snapshot: emptyPipelineSnapshot(fetchedAt),
        partialSync: true,
        totalCandidates: 0,
      };
    }
  }

  const candidates = applyTerritoryToCandidates(session, candidatesResult.candidates);
  const rows = candidates.map((candidate) =>
    buildBaselineWorkflowRow(candidate, workflows[candidate.candidateId]),
  );
  const partialSync =
    candidatesFromCache ||
    Boolean(candidatesResult.truncated) ||
    (candidatesResult.warnings?.length ?? 0) > 0;

  return {
    ok: true,
    snapshot: buildPipelineIntelligenceSnapshot(rows, fetchedAt),
    partialSync,
    totalCandidates: rows.length,
  };
}
