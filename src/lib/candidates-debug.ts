/** Temporary pipeline diagnostics — remove when candidate table render is stable. */

export function logCandidatesDebug(
  stage: string,
  count: number,
  meta?: Record<string, unknown>,
): void {
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
  if (Array.isArray(record.data)) return record.data.length;
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
  console.info("[candidates-debug] filters_applied", meta);
}
