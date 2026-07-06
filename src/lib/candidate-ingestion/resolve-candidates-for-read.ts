import {
  fetchBreezyCandidates,
  type BreezyApiFailure,
  type BreezyCandidatesSuccess,
} from "@/lib/breezy-api";
import {
  runCandidateLookupRescue,
  runFreshnessRescue,
  shouldRunFreshnessRescue,
  type CandidateLookupQuery,
  type CandidateLookupRescueResult,
  type FreshnessRescueResult,
} from "@/lib/candidate-ingestion/fresh-candidate-ingestion-rescue";
import {
  isIngestionStoreUsable,
  listIngestedCandidates,
  readIngestionStore,
} from "@/lib/candidate-ingestion/ingestion-store";

async function readIngestedSnapshot(
  store: Awaited<ReturnType<typeof readIngestionStore>>,
): Promise<BreezyCandidatesSuccess> {
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
      store.lastFreshnessRescueAt
        ? `Last freshness rescue: ${store.lastFreshnessRescueAt}.`
        : "No freshness rescue recorded.",
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
  freshnessRescue?: FreshnessRescueResult;
  candidateLookupRescue?: CandidateLookupRescueResult;
};

export async function resolveCandidatesForRead(input?: {
  scanMode?: "preview" | "fast" | "full" | "all";
  force?: boolean;
  candidateLookup?: CandidateLookupQuery;
}): Promise<ResolvedCandidatesRead | BreezyApiFailure> {
  let store = await readIngestionStore();
  let freshnessRescue: FreshnessRescueResult | undefined;
  let candidateLookupRescue: CandidateLookupRescueResult | undefined;

  if (isIngestionStoreUsable(store)) {
    if (shouldAttemptFreshnessRescue(store, input)) {
      const rescued = await runFreshnessRescue({ force: input?.force === true });
      store = rescued.store;
      freshnessRescue = rescued.result;
    }

    if (input?.candidateLookup && (input.candidateLookup.email || input.candidateLookup.name)) {
      const lookup = await runCandidateLookupRescue(input.candidateLookup, {
        force: input?.force === true,
      });
      store = lookup.store;
      candidateLookupRescue = lookup.result;
    }

    const ingested = await readIngestedSnapshot(store);
    return {
      ...ingested,
      fromIngestionStore: true,
      freshnessRescue,
      candidateLookupRescue,
    };
  }

  const scanMode = input?.scanMode ?? "preview";
  const breezy = await fetchBreezyCandidates({ scanMode, force: input?.force });
  if (!breezy.ok) return breezy;
  return { ...breezy, fromIngestionStore: false, freshnessRescue, candidateLookupRescue };
}

function shouldAttemptFreshnessRescue(
  store: Awaited<ReturnType<typeof readIngestionStore>>,
  input?: { force?: boolean; candidateLookup?: CandidateLookupQuery },
): boolean {
  if (input?.force === true) return true;
  if (input?.candidateLookup?.email || input?.candidateLookup?.name) return true;
  return shouldRunFreshnessRescue(store);
}

export async function resolveCandidatesForAutomation(): Promise<
  ResolvedCandidatesRead | BreezyApiFailure
> {
  return resolveCandidatesForRead({ scanMode: "fast" });
}
