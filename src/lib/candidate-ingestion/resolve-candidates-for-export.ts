import { fetchBreezyCandidates, type BreezyCandidate } from "@/lib/breezy-api";
import { mergeCandidatesSnapshots } from "@/lib/breezy-candidates-sync";
import { getIngestedCandidatesSnapshot } from "@/lib/candidate-ingestion/index";
import {
  listIngestedCandidates,
  readIngestionStore,
} from "@/lib/candidate-ingestion/ingestion-store";
import type { CandidateIngestionStoreFile } from "@/lib/candidate-ingestion/types";

export function shouldSupplementIngestionForExport(store: CandidateIngestionStoreFile): boolean {
  if (!store.cycleComplete) return true;
  const scanned = new Set(store.scannedPositionIds).size;
  return store.publishedPositionsTotal > scanned;
}

/**
 * Export must include live Breezy applicants that the Candidates tab can already
 * see via preview/fast scans but that are not yet persisted in the ingestion store.
 */
export async function resolveCandidatesForExport(): Promise<BreezyCandidate[]> {
  const store = await readIngestionStore();
  const ingestedSnapshot = await getIngestedCandidatesSnapshot();
  const ingested = ingestedSnapshot?.candidates ?? listIngestedCandidates(store);

  if (!shouldSupplementIngestionForExport(store)) {
    return ingested;
  }

  const breezy = await fetchBreezyCandidates({ scanMode: "full", force: true });
  if (!breezy.ok) return ingested;
  if (!ingestedSnapshot) return breezy.candidates;

  return mergeCandidatesSnapshots(ingestedSnapshot, breezy).candidates;
}
