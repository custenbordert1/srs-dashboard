import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { BreezyCandidate } from "@/lib/breezy-api";
import { recruitingDataDir } from "@/lib/recruiting-data-dir";
import type { CandidateIngestionStoreFile } from "@/lib/candidate-ingestion/types";
import path from "node:path";
import { randomUUID } from "node:crypto";

const STORE_VERSION = 1 as const;

function storePath(): string {
  return path.join(recruitingDataDir(), "candidate-ingestion.json");
}

export function emptyIngestionStore(): CandidateIngestionStoreFile {
  const now = new Date().toISOString();
  return {
    version: STORE_VERSION,
    runId: null,
    publishedPositionIds: [],
    publishedPositionsTotal: 0,
    scannedPositionIds: [],
    checkpointIndex: 0,
    candidates: {},
    lastJobListAt: null,
    lastChunkAt: null,
    lastFullCycleAt: null,
    cycleComplete: false,
    chunksThisRun: 0,
    updatedAt: now,
  };
}

export async function readIngestionStore(): Promise<CandidateIngestionStoreFile> {
  try {
    const raw = await readFile(storePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<CandidateIngestionStoreFile>;
    if (parsed.version !== STORE_VERSION) return emptyIngestionStore();
    return {
      ...emptyIngestionStore(),
      ...parsed,
      candidates:
        parsed.candidates && typeof parsed.candidates === "object" ? parsed.candidates : {},
      publishedPositionIds: Array.isArray(parsed.publishedPositionIds)
        ? parsed.publishedPositionIds
        : [],
      scannedPositionIds: Array.isArray(parsed.scannedPositionIds) ? parsed.scannedPositionIds : [],
    };
  } catch {
    return emptyIngestionStore();
  }
}

export async function writeIngestionStore(store: CandidateIngestionStoreFile): Promise<void> {
  await mkdir(recruitingDataDir(), { recursive: true });
  const payload: CandidateIngestionStoreFile = {
    ...store,
    updatedAt: new Date().toISOString(),
  };
  await writeFile(storePath(), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

export function mergeIngestedCandidates(
  store: CandidateIngestionStoreFile,
  incoming: BreezyCandidate[],
): { store: CandidateIngestionStoreFile; newCount: number } {
  let newCount = 0;
  const candidates = { ...store.candidates };
  for (const candidate of incoming) {
    if (!candidate.candidateId) continue;
    if (!candidates[candidate.candidateId]) newCount += 1;
    candidates[candidate.candidateId] = candidate;
  }
  return {
    store: { ...store, candidates },
    newCount,
  };
}

export function startIngestionRun(store: CandidateIngestionStoreFile): CandidateIngestionStoreFile {
  if (store.cycleComplete || store.checkpointIndex >= store.publishedPositionsTotal) {
    return {
      ...store,
      runId: randomUUID(),
      checkpointIndex: 0,
      scannedPositionIds: [],
      cycleComplete: false,
      chunksThisRun: 0,
    };
  }
  return {
    ...store,
    runId: store.runId ?? randomUUID(),
    chunksThisRun: 0,
  };
}

export function listIngestedCandidates(store: CandidateIngestionStoreFile): BreezyCandidate[] {
  return Object.values(store.candidates);
}

export function ingestionPositionCoveragePct(store: CandidateIngestionStoreFile): number {
  if (store.publishedPositionsTotal <= 0) return 0;
  const scanned = new Set(store.scannedPositionIds).size;
  return Math.round((scanned / store.publishedPositionsTotal) * 100);
}

export function isIngestionStoreUsable(store: CandidateIngestionStoreFile): boolean {
  const candidateCount = Object.keys(store.candidates).length;
  if (candidateCount === 0) return false;
  // Keep serving the durable candidate pool during incremental position rescans.
  if (store.cycleComplete) return true;
  return ingestionPositionCoveragePct(store) >= 50 || candidateCount >= 50;
}
