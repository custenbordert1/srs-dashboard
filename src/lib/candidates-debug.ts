/** Opt-in pipeline diagnostics (`BREEZY_CANDIDATES_DEBUG=true`). Hot paths stay silent by default. */

function isCandidatesDebugEnabled(): boolean {
  return process.env.BREEZY_CANDIDATES_DEBUG === "true";
}

export function logCandidatesDebug(
  stage: string,
  count: number,
  meta?: Record<string, unknown>,
): void {
  if (!isCandidatesDebugEnabled()) return;
  if (meta && Object.keys(meta).length > 0) {
    console.info(`[candidates-debug] ${stage} count=${count}`, meta);
    return;
  }
  console.info(`[candidates-debug] ${stage} count=${count}`);
}

export function countRawBreezyListResponse(data: unknown): number {
  if (Array.isArray(data)) return data.length;
  if (!data || typeof data !== "object") return 0;
  const record = data as Record<string, unknown>;
  if (Array.isArray(record.candidates)) return record.candidates.length;
  if (Array.isArray(record.applicants)) return record.applicants.length;
  if (Array.isArray(record.data)) return record.data.length;
  if (Array.isArray(record.results)) return record.results.length;
  if (record.data && typeof record.data === "object") {
    const nested = record.data as Record<string, unknown>;
    if (Array.isArray(nested.candidates)) return nested.candidates.length;
  }
  return 0;
}

export function logFirstCandidateKeys(
  stage: string,
  candidate: Record<string, unknown> | null | undefined,
): void {
  if (!isCandidatesDebugEnabled()) return;
  if (!candidate) {
    console.info(`[candidates-debug] ${stage}_first_candidate_keys`, { keys: [] });
    return;
  }
  console.info(`[candidates-debug] ${stage}_first_candidate_keys`, {
    keys: Object.keys(candidate).sort(),
    candidateId: candidate.candidateId ?? candidate._id ?? candidate.id,
  });
}

export function logRecruiterTerritoryFilters(meta: {
  actingRecruiter?: string;
  sourceFilter?: string;
  workflowFilter?: string;
  stageFilter?: string;
  territoryNote?: string;
}): void {
  if (!isCandidatesDebugEnabled()) return;
  console.info("[candidates-debug] filters_applied", meta);
}
