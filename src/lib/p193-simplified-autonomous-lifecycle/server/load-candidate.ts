import "server-only";

import {
  projectCandidateRowToP193,
  toP193CandidateStatusViewModel,
  type P193CandidateStatusViewModel,
  type P193LegacyRowProjectionInput,
} from "@/lib/p193-simplified-autonomous-lifecycle/client-projection";
import {
  listP193Records,
  readP193LifecycleStore,
} from "@/lib/p193-simplified-autonomous-lifecycle/server/persistence";

/**
 * Server-only candidate status load.
 * Prefer durable P193 store; fall back to pure legacy projection when provided.
 */
export async function loadP193CandidateStatus(input: {
  candidateId: string;
  legacyRow?: P193LegacyRowProjectionInput | null;
}): Promise<P193CandidateStatusViewModel> {
  const candidateId = input.candidateId.trim();
  if (!candidateId) {
    return toP193CandidateStatusViewModel({
      record: null,
      candidateId: "",
    });
  }

  const store = await readP193LifecycleStore();
  const existing = store.records[candidateId] ?? null;
  if (existing) {
    return toP193CandidateStatusViewModel({
      record: existing,
      candidateId,
      projectedFromLegacy: false,
    });
  }

  if (input.legacyRow) {
    const projected = projectCandidateRowToP193({
      ...input.legacyRow,
      candidateId,
    });
    return toP193CandidateStatusViewModel({
      record: projected,
      candidateId,
      projectedFromLegacy: true,
    });
  }

  return toP193CandidateStatusViewModel({
    record: null,
    candidateId,
  });
}

export async function loadP193StoreSummary(): Promise<{
  recordCount: number;
  candidateIdsSample: string[];
}> {
  const records = await listP193Records();
  return {
    recordCount: records.length,
    candidateIdsSample: records.slice(0, 5).map((r) => r.candidateId.slice(0, 6)),
  };
}
