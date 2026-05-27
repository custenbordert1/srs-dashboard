import type { BreezyCandidate, BreezyCandidatesSuccess } from "@/lib/breezy-api";
import {
  pickRichestCandidatesSnapshot,
  shouldAcceptCandidatesCacheWrite,
} from "@/lib/breezy-candidates-cache";

/** Prefer table row count when committed rows exceed snapshot metadata. */
export function buildTableBackedCandidatesSnapshot(
  rows: BreezyCandidate[],
  meta: BreezyCandidatesSuccess | null | undefined,
): BreezyCandidatesSuccess | null {
  if (rows.length === 0) return meta ?? null;
  if (!meta) {
    return {
      ok: true,
      candidates: rows,
      fetchedAt: new Date().toISOString(),
      companyId: "",
      totalCandidatesPulled: rows.length,
      totalCandidatesFetched: rows.length,
    };
  }
  if (meta.candidates.length >= rows.length) return meta;
  return {
    ...meta,
    ok: true,
    candidates: rows,
    totalCandidatesPulled: rows.length,
    totalCandidatesFetched: rows.length,
  };
}

export type AuthoritativeCandidatesDisplayInput = {
  tableRows: BreezyCandidate[];
  breezySnapshot: BreezyCandidatesSuccess | null | undefined;
  liveData: BreezyCandidatesSuccess | null | undefined;
  recoverableSnapshot: BreezyCandidatesSuccess | null | undefined;
  highWaterSnapshot: BreezyCandidatesSuccess | null | undefined;
  startupSnapshot: BreezyCandidatesSuccess | null | undefined;
};

/**
 * Single display snapshot for the Candidates tab: richest table/backed, restore, and
 * high-water sources; live API payload only when it is not poorer than that baseline.
 */
export function resolveAuthoritativeCandidatesDisplaySnapshot(
  input: AuthoritativeCandidatesDisplayInput,
): BreezyCandidatesSuccess | null {
  const tableBacked = buildTableBackedCandidatesSnapshot(input.tableRows, input.breezySnapshot);
  const baseline = pickRichestCandidatesSnapshot([
    tableBacked,
    input.breezySnapshot,
    input.recoverableSnapshot,
    input.highWaterSnapshot,
    input.startupSnapshot,
  ]);

  const candidates: BreezyCandidatesSuccess[] = [];
  if (baseline) candidates.push(baseline);
  if (input.liveData) {
    if (!baseline) {
      candidates.push(input.liveData);
    } else {
      const decision = shouldAcceptCandidatesCacheWrite(input.liveData, baseline, {
        layer: "ui",
        downgradeSource: "resolveAuthoritativeCandidatesDisplaySnapshot",
      });
      if (decision.accepted) candidates.push(input.liveData);
    }
  }

  if (candidates.length === 0) return null;
  return pickRichestCandidatesSnapshot(candidates);
}
