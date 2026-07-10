import type { BreezyCandidate } from "@/lib/breezy-api";
import { formatCandidateDisplayName } from "@/lib/candidate-display-name";
import {
  findCandidateInStore,
  matchesCandidateLookup,
} from "@/lib/candidate-ingestion/fresh-candidate-ingestion-rescue";
import { listIngestedCandidates, readIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import { resolveCandidatesForRead } from "@/lib/candidate-ingestion/resolve-candidates-for-read";
import type { CandidateIngestionStoreFile } from "@/lib/candidate-ingestion/types";
import {
  normalizePhoneDigits,
  parseP170SearchQuery,
} from "@/lib/p170-unified-candidate-discovery/parse-search-query";
import type {
  P170CandidateSource,
  P170CandidateSummary,
  P170SearchQuery,
} from "@/lib/p170-unified-candidate-discovery/types";

/**
 * Extends the shared P153.2 lookup matcher with phone, candidate id, and
 * position id — without duplicating the name/email logic it already owns.
 */
export function matchesP170Query(candidate: BreezyCandidate, query: P170SearchQuery): boolean {
  if ((query.name || query.email) && matchesCandidateLookup(candidate, { name: query.name ?? undefined, email: query.email ?? undefined })) {
    return true;
  }
  if (query.candidateId && candidate.candidateId.toLowerCase() === query.candidateId) return true;
  if (query.positionId && (candidate.positionId ?? "").toLowerCase() === query.positionId) return true;
  if (query.phone) {
    const candidatePhone = normalizePhoneDigits(candidate.phone);
    if (candidatePhone && candidatePhone.endsWith(query.phone)) return true;
  }
  return false;
}

/** Newest applicant first — search always surfaces the most recent match. */
function pickNewest(matches: BreezyCandidate[]): BreezyCandidate | null {
  if (matches.length === 0) return null;
  return [...matches].sort((a, b) =>
    (b.appliedDate || b.addedDate || "").localeCompare(a.appliedDate || a.addedDate || ""),
  )[0]!;
}

export function findInIngestionStore(
  store: CandidateIngestionStoreFile,
  query: P170SearchQuery,
): BreezyCandidate | null {
  // Reuse P153.2 name/email store lookup first (handles its own sorting).
  if (query.name || query.email) {
    const viaShared = findCandidateInStore(store, {
      name: query.name ?? undefined,
      email: query.email ?? undefined,
    });
    if (viaShared) return viaShared;
  }
  const matches = listIngestedCandidates(store).filter((candidate) => matchesP170Query(candidate, query));
  return pickNewest(matches);
}

export function toCandidateSummary(candidate: BreezyCandidate): P170CandidateSummary {
  return {
    candidateId: candidate.candidateId,
    name: formatCandidateDisplayName({
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      email: candidate.email,
    }),
    email: candidate.email || null,
    phone: candidate.phone || null,
    positionId: candidate.positionId || null,
    positionName: candidate.positionName || null,
    appliedDate: candidate.appliedDate || candidate.addedDate || null,
    city: candidate.city || null,
    state: candidate.state || null,
    stage: candidate.stage || null,
  };
}

export type P170ResolvedCandidate = {
  candidate: BreezyCandidate | null;
  source: P170CandidateSource | null;
  rescueInvoked: boolean;
  rescueSource: string | null;
  hydratedIntoStore: boolean;
  foundInIngestion: boolean;
  warnings: string[];
};

/**
 * Primary discovery pipeline:
 *   1. Durable ingestion store (primary source)
 *   2. P153.2 lookup rescue (name/email) — hydrates only the matched candidate
 *   3. Re-read store to surface the hydrated candidate (source = breezy_rescue)
 * Read-only: performs no Breezy writes and never rebuilds the full index.
 */
export async function resolveP170Candidate(rawQuery: string): Promise<P170ResolvedCandidate> {
  const query = parseP170SearchQuery(rawQuery);
  const warnings: string[] = [];

  const store = await readIngestionStore();
  const inStore = findInIngestionStore(store, query);
  if (inStore) {
    return {
      candidate: inStore,
      source: "ingestion_store",
      rescueInvoked: false,
      rescueSource: null,
      hydratedIntoStore: false,
      foundInIngestion: true,
      warnings,
    };
  }

  // Not currently loaded — invoke the existing P153.2 lookup rescue.
  // Rescue matches on name/email; skip when the query lacks both.
  if (!query.name && !query.email) {
    warnings.push(
      "Candidate not in ingestion store; phone/ID-only queries cannot drive Breezy rescue (needs name or email).",
    );
    return {
      candidate: null,
      source: null,
      rescueInvoked: false,
      rescueSource: null,
      hydratedIntoStore: false,
      foundInIngestion: false,
      warnings,
    };
  }

  const resolved = await resolveCandidatesForRead({
    candidateLookup: { name: query.name ?? undefined, email: query.email ?? undefined },
  });

  if (!resolved.ok) {
    warnings.push(`Lookup rescue unavailable: ${resolved.error}`);
    return {
      candidate: null,
      source: null,
      rescueInvoked: true,
      rescueSource: null,
      hydratedIntoStore: false,
      foundInIngestion: false,
      warnings,
    };
  }

  const rescue = resolved.candidateLookupRescue ?? null;
  const rescued = pickNewest(resolved.candidates.filter((candidate) => matchesP170Query(candidate, query)));

  if (rescued) {
    const cameFromStore = rescue?.source === "ingestion_store";
    return {
      candidate: rescued,
      source: cameFromStore ? "ingestion_store" : "breezy_rescue",
      rescueInvoked: true,
      rescueSource: rescue?.source ?? null,
      hydratedIntoStore: Boolean(rescue?.merged),
      foundInIngestion: true,
      warnings,
    };
  }

  warnings.push("Candidate not found in ingestion store or via Breezy rescue.");
  return {
    candidate: null,
    source: null,
    rescueInvoked: true,
    rescueSource: rescue?.source ?? null,
    hydratedIntoStore: false,
    foundInIngestion: false,
    warnings,
  };
}
