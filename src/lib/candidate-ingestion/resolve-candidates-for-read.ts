import {
  fetchBreezyCandidates,
  type BreezyApiFailure,
  type BreezyCandidatesSuccess,
} from "@/lib/breezy-api";
import {
  isIngestionStoreUsable,
  listIngestedCandidates,
  readIngestionStore,
} from "@/lib/candidate-ingestion/ingestion-store";

async function readIngestedSnapshot(): Promise<BreezyCandidatesSuccess | null> {
  const store = await readIngestionStore();
  if (!isIngestionStoreUsable(store)) return null;
  const candidates = listIngestedCandidates(store);
  const scanned = new Set(store.scannedPositionIds).size;
  const total = store.publishedPositionsTotal;
  const fetchedAt = store.lastChunkAt ?? store.updatedAt;
  return {
    ok: true,
    candidates,
    fetchedAt,
    companyId: "",
    totalPositionsAvailable: total,
    totalPositions: total,
    positionsScanned: scanned,
    totalCandidatesPulled: candidates.length,
    totalCandidatesFetched: candidates.length,
    truncated: !store.cycleComplete,
    hydrationComplete: store.cycleComplete,
    scanMode: "all",
    syncNotes: [
      `Durable ingestion store: ${scanned}/${total} positions scanned.`,
      store.cycleComplete ? "Full position cycle complete." : "Ingestion cycle in progress.",
    ],
    skippedCandidatesReason: {
      sanitizeRejected: 0,
      missingAppliedDate: 0,
      duplicateCandidateId: 0,
      outsideDateRange: 0,
      positionPaginationIncomplete: 0,
      positionFetchFailed: 0,
      positionScanTimedOut: 0,
      positionsNotScanned: Math.max(0, total - scanned),
    },
  };
}

export type ResolvedCandidatesRead = BreezyCandidatesSuccess & {
  fromIngestionStore: boolean;
};

export async function resolveCandidatesForRead(input?: {
  scanMode?: "preview" | "fast" | "full" | "all";
}): Promise<ResolvedCandidatesRead | BreezyApiFailure> {
  const ingested = await readIngestedSnapshot();
  if (ingested) {
    return { ...ingested, fromIngestionStore: true };
  }

  const scanMode = input?.scanMode ?? "preview";
  const breezy = await fetchBreezyCandidates({ scanMode });
  if (!breezy.ok) return breezy;
  return { ...breezy, fromIngestionStore: false };
}

export async function resolveCandidatesForAutomation(): Promise<
  ResolvedCandidatesRead | BreezyApiFailure
> {
  return resolveCandidatesForRead({ scanMode: "fast" });
}
