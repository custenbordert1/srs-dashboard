import {
  fetchBreezyCandidates,
  fetchBreezyJobs,
  resolveBreezyCompany,
  scanBreezyPublishedPositionsBatch,
  type BreezyCandidate,
} from "@/lib/breezy-api";
import {
  candidateNeedsQuestionnaireEnrichment,
  enrichCandidateWithQuestionnaireDetail,
} from "@/lib/candidate-ingestion/enrich-candidate-questionnaires";
import {
  mergeIngestedCandidates,
  readIngestionStore,
  writeIngestionStore,
} from "@/lib/candidate-ingestion/ingestion-store";
import type { CandidateIngestionStoreFile } from "@/lib/candidate-ingestion/types";

export const P1532_SOURCE_PHASE = "P153.2";
export const FRESHNESS_RESCUE_MAX_POSITIONS = 25;
export const FRESHNESS_RESCUE_STORE_AGE_MS = 5 * 60 * 1000;
export const FRESHNESS_RESCUE_POSITION_WINDOW_MS = 60 * 60 * 1000;

export type FreshnessRescueResult = {
  ran: boolean;
  reason: string;
  positionsRescanned: number;
  newCandidates: number;
  rescuedCandidateIds: string[];
  storeAgeMs: number;
};

export type CandidateLookupQuery = {
  email?: string;
  name?: string;
};

export type CandidateLookupRescueResult = {
  ran: boolean;
  found: boolean;
  candidateId: string | null;
  source: "ingestion_store" | "position_rescue" | "fast_scan" | "position_targeted" | "none";
  merged: boolean;
};

async function enrichRescuedCandidates(
  store: CandidateIngestionStoreFile,
  candidateIds: string[],
  companyId: string,
): Promise<CandidateIngestionStoreFile> {
  let next = store;
  for (const candidateId of candidateIds.slice(0, 10)) {
    const candidate = next.candidates[candidateId];
    if (!candidate || !candidateNeedsQuestionnaireEnrichment(candidate)) continue;
    const result = await enrichCandidateWithQuestionnaireDetail({ candidate, companyId });
    if (!result.attempted) continue;
    next = {
      ...next,
      candidates: {
        ...next.candidates,
        [candidateId]: result.candidate,
      },
    };
  }
  return next;
}

function storeFetchedAtMs(store: CandidateIngestionStoreFile): number {
  const raw = store.lastChunkAt ?? store.updatedAt;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function shouldRunFreshnessRescue(
  store: CandidateIngestionStoreFile,
  input?: { force?: boolean; referenceMs?: number },
): boolean {
  if (input?.force === true) return true;
  const referenceMs = input?.referenceMs ?? Date.now();
  const ageMs = referenceMs - storeFetchedAtMs(store);
  return ageMs >= FRESHNESS_RESCUE_STORE_AGE_MS;
}

/** Positions already scanned in the current cycle; oldest queue index first with rotation. */
export function selectPositionsForFreshnessRescue(
  store: CandidateIngestionStoreFile,
  input?: { maxPositions?: number; referenceMs?: number; rotationOffset?: number },
): string[] {
  const maxPositions = input?.maxPositions ?? FRESHNESS_RESCUE_MAX_POSITIONS;
  const scannedSet = new Set(store.scannedPositionIds);

  const referenceMs = input?.referenceMs ?? Date.now();
  const cutoffMs = referenceMs - FRESHNESS_RESCUE_POSITION_WINDOW_MS;

  const scannedInCurrentCycle = store.publishedPositionIds
    .slice(0, Math.max(0, store.checkpointIndex))
    .filter((positionId) => scannedSet.has(positionId))
    .map((positionId) => ({
      positionId,
      queueIndex: store.publishedPositionIds.indexOf(positionId),
      scannedAtMs: Date.parse(
        store.positionScannedAt?.[positionId] ?? store.lastChunkAt ?? store.updatedAt,
      ),
    }))
    .filter((row) => Number.isFinite(row.scannedAtMs) && row.scannedAtMs >= cutoffMs)
    .sort((a, b) => {
      if (a.queueIndex !== b.queueIndex) return a.queueIndex - b.queueIndex;
      return a.scannedAtMs - b.scannedAtMs;
    });

  if (scannedInCurrentCycle.length === 0) return [];

  const offset = input?.rotationOffset ?? store.rescueRotationIndex ?? 0;
  const selected: string[] = [];
  for (let i = 0; i < maxPositions; i += 1) {
    const row = scannedInCurrentCycle[(offset + i) % scannedInCurrentCycle.length];
    if (!row) break;
    selected.push(row.positionId);
  }
  return selected;
}

export function nextRescueRotationIndex(
  store: CandidateIngestionStoreFile,
  scannedCount: number,
): number {
  const scannedSet = new Set(store.scannedPositionIds);
  const total = store.publishedPositionIds
    .slice(0, Math.max(0, store.checkpointIndex))
    .filter((positionId) => scannedSet.has(positionId)).length;
  if (total <= 0) return 0;
  return ((store.rescueRotationIndex ?? 0) + scannedCount) % total;
}

export function matchesCandidateLookup(candidate: BreezyCandidate, query: CandidateLookupQuery): boolean {
  const email = query.email?.trim().toLowerCase();
  if (email && (candidate.email ?? "").trim().toLowerCase() === email) return true;

  const nameQuery = query.name?.trim().toLowerCase();
  if (!nameQuery) return false;

  const haystack = `${candidate.firstName ?? ""} ${candidate.lastName ?? ""} ${candidate.candidateId}`
    .trim()
    .toLowerCase();
  return haystack.includes(nameQuery);
}

export function findCandidateInStore(
  store: CandidateIngestionStoreFile,
  query: CandidateLookupQuery,
): BreezyCandidate | null {
  if (!query.email?.trim() && !query.name?.trim()) return null;
  const matches = Object.values(store.candidates).filter((candidate) =>
    matchesCandidateLookup(candidate, query),
  );
  if (matches.length === 0) return null;
  return matches.sort((a, b) =>
    (b.appliedDate || b.addedDate || "").localeCompare(a.appliedDate || a.addedDate || ""),
  )[0]!;
}

export async function runFreshnessRescue(input?: {
  force?: boolean;
  referenceMs?: number;
  maxPositions?: number;
}): Promise<{ store: CandidateIngestionStoreFile; result: FreshnessRescueResult }> {
  const referenceMs = input?.referenceMs ?? Date.now();
  let store = await readIngestionStore();
  const storeAgeMs = referenceMs - storeFetchedAtMs(store);

  if (!shouldRunFreshnessRescue(store, { force: input?.force, referenceMs })) {
    return {
      store,
      result: {
        ran: false,
        reason: `Store age ${storeAgeMs}ms below ${FRESHNESS_RESCUE_STORE_AGE_MS}ms threshold.`,
        positionsRescanned: 0,
        newCandidates: 0,
        rescuedCandidateIds: [],
        storeAgeMs,
      },
    };
  }

  const positionIds = selectPositionsForFreshnessRescue(store, {
    maxPositions: input?.maxPositions,
    referenceMs,
  });
  if (positionIds.length === 0) {
    return {
      store,
      result: {
        ran: false,
        reason: "No scanned positions eligible for freshness rescue.",
        positionsRescanned: 0,
        newCandidates: 0,
        rescuedCandidateIds: [],
        storeAgeMs,
      },
    };
  }

  const company = await resolveBreezyCompany();
  if (!company.ok) {
    return {
      store,
      result: {
        ran: false,
        reason: company.error,
        positionsRescanned: 0,
        newCandidates: 0,
        rescuedCandidateIds: [],
        storeAgeMs,
      },
    };
  }

  const jobsResult = await fetchBreezyJobs("published");
  const jobsById = new Map((jobsResult.ok ? jobsResult.jobs : []).map((job) => [job.jobId, job]));
  const positions = positionIds
    .map((id) => jobsById.get(id))
    .filter((job): job is NonNullable<typeof job> => Boolean(job));

  if (positions.length === 0) {
    return {
      store,
      result: {
        ran: false,
        reason: "Rescue position IDs not found in published job list.",
        positionsRescanned: 0,
        newCandidates: 0,
        rescuedCandidateIds: [],
        storeAgeMs,
      },
    };
  }

  const batch = await scanBreezyPublishedPositionsBatch({
    companyId: company.companyId,
    positions,
    filterToDateRange: false,
    maxRuntimeMs: 45_000,
  });

  const beforeIds = new Set(Object.keys(store.candidates));
  const merged = mergeIngestedCandidates(store, batch.candidates);
  const now = new Date(referenceMs).toISOString();
  const positionScannedAt = { ...(merged.store.positionScannedAt ?? {}) };
  for (const position of positions.slice(0, batch.positionsScanned)) {
    positionScannedAt[position.jobId] = now;
  }

  store = {
    ...merged.store,
    positionScannedAt,
    lastFreshnessRescueAt: now,
    lastChunkAt: now,
    rescueRotationIndex: nextRescueRotationIndex(merged.store, batch.positionsScanned),
  };
  await writeIngestionStore(store);

  const rescuedCandidateIds = Object.keys(store.candidates).filter((id) => !beforeIds.has(id));

  if (rescuedCandidateIds.length > 0) {
    store = await enrichRescuedCandidates(store, rescuedCandidateIds, company.companyId);
    await writeIngestionStore(store);
  }

  return {
    store,
    result: {
      ran: true,
      reason: `Rescanned ${batch.positionsScanned} positions (${merged.newCount} new candidates).`,
      positionsRescanned: batch.positionsScanned,
      newCandidates: merged.newCount,
      rescuedCandidateIds,
      storeAgeMs,
    },
  };
}

export async function runCandidateLookupRescue(
  query: CandidateLookupQuery,
  input?: { force?: boolean; referenceMs?: number },
): Promise<{ store: CandidateIngestionStoreFile; result: CandidateLookupRescueResult }> {
  const referenceMs = input?.referenceMs ?? Date.now();
  let store = await readIngestionStore();

  const existing = findCandidateInStore(store, query);
  if (existing) {
    const needsEnrichment = candidateNeedsQuestionnaireEnrichment(existing);
    if (input?.force && needsEnrichment) {
      const company = await resolveBreezyCompany();
      if (company.ok) {
        store = await enrichRescuedCandidates(store, [existing.candidateId], company.companyId);
        await writeIngestionStore(store);
      }
    }
    return {
      store,
      result: {
        ran: Boolean(input?.force && needsEnrichment),
        found: true,
        candidateId: existing.candidateId,
        source: "ingestion_store",
        merged: Boolean(input?.force && needsEnrichment),
      },
    };
  }

  const rescue = await runFreshnessRescue({
    force: input?.force ?? true,
    referenceMs,
  });
  store = rescue.store;

  let afterRescue = findCandidateInStore(store, query);
  if (afterRescue) {
    return {
      store,
      result: {
        ran: true,
        found: true,
        candidateId: afterRescue.candidateId,
        source: "position_rescue",
        merged: true,
      },
    };
  }

  if (input?.force) {
    for (let batch = 0; batch < 3; batch += 1) {
      const extra = await runFreshnessRescue({
        force: true,
        referenceMs,
        maxPositions: FRESHNESS_RESCUE_MAX_POSITIONS,
      });
      store = extra.store;
      afterRescue = findCandidateInStore(store, query);
      if (afterRescue) {
        return {
          store,
          result: {
            ran: true,
            found: true,
            candidateId: afterRescue.candidateId,
            source: "position_rescue",
            merged: true,
          },
        };
      }
      if (!extra.result.ran || extra.result.newCandidates === 0) {
        // keep rotating even when no new candidates until batches exhausted
      }
    }
  }

  const fast = await fetchBreezyCandidates({ scanMode: "fast", force: true });
  if (fast.ok) {
    const hits = fast.candidates.filter((c) => matchesCandidateLookup(c, query));
    if (hits.length > 0) {
      const merged = mergeIngestedCandidates(store, hits);
      store = { ...merged.store, lastFreshnessRescueAt: new Date(referenceMs).toISOString() };
      await writeIngestionStore(store);
      return {
        store,
        result: {
          ran: true,
          found: true,
          candidateId: hits[0]!.candidateId,
          source: "fast_scan",
          merged: true,
        },
      };
    }
  }

  if (query.email?.trim()) {
    const jobs = await fetchBreezyJobs("published");
    if (jobs.ok) {
      const recent = [...jobs.jobs]
        .sort((a, b) => (b.updatedDate ?? "").localeCompare(a.updatedDate ?? ""))
        .slice(0, 10);
      for (const job of recent) {
        const live = await fetchBreezyCandidates({
          positionId: job.jobId,
          scanMode: "all",
          force: true,
        });
        if (!live.ok) continue;
        const hit = live.candidates.find((c) => matchesCandidateLookup(c, query));
        if (hit) {
          const merged = mergeIngestedCandidates(store, [hit]);
          store = { ...merged.store, lastFreshnessRescueAt: new Date(referenceMs).toISOString() };
          await writeIngestionStore(store);
          return {
            store,
            result: {
              ran: true,
              found: true,
              candidateId: hit.candidateId,
              source: "position_targeted",
              merged: true,
            },
          };
        }
      }
    }
  }

  return {
    store,
    result: {
      ran: true,
      found: false,
      candidateId: null,
      source: "none",
      merged: false,
    },
  };
}

export function recordPositionScans(
  store: CandidateIngestionStoreFile,
  positionIds: string[],
  scannedAt?: string,
): CandidateIngestionStoreFile {
  const at = scannedAt ?? new Date().toISOString();
  const positionScannedAt = { ...(store.positionScannedAt ?? {}) };
  for (const positionId of positionIds) {
    positionScannedAt[positionId] = at;
  }
  return { ...store, positionScannedAt };
}
