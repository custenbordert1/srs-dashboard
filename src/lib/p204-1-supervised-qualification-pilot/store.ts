import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { recruitingDataDir, safeRecruitingMkdir } from "@/lib/recruiting-data-dir";
import type {
  P2041OperatorDecision,
  P2041RecommendationRecord,
} from "@/lib/p204-1-supervised-qualification-pilot/types";

type StoreFile = {
  version: 1;
  updatedAt: string;
  recommendations: P2041RecommendationRecord[];
};

function storePath(): string {
  return path.join(recruitingDataDir(), "p204-1-recommendation-store.json");
}

async function readStore(): Promise<StoreFile> {
  try {
    const raw = await readFile(storePath(), "utf8");
    const parsed = JSON.parse(raw) as StoreFile;
    return {
      version: 1,
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
      recommendations: parsed.recommendations ?? [],
    };
  } catch {
    return { version: 1, updatedAt: new Date().toISOString(), recommendations: [] };
  }
}

async function writeStore(file: StoreFile): Promise<void> {
  await safeRecruitingMkdir(recruitingDataDir());
  await writeFile(storePath(), `${JSON.stringify(file, null, 2)}\n`, "utf8");
}

export async function listP2041Recommendations(): Promise<P2041RecommendationRecord[]> {
  return (await readStore()).recommendations;
}

export async function getP2041Recommendation(
  candidateId: string,
): Promise<P2041RecommendationRecord | null> {
  const list = await listP2041Recommendations();
  return list.find((r) => r.candidateId === candidateId) ?? null;
}

/** Idempotent upsert by candidateId + cohortId + evidenceFingerprint. */
export async function upsertP2041Recommendation(
  record: P2041RecommendationRecord,
): Promise<{ record: P2041RecommendationRecord; created: boolean }> {
  const file = await readStore();
  const idx = file.recommendations.findIndex(
    (r) =>
      r.candidateId === record.candidateId &&
      r.cohortId === record.cohortId &&
      r.evidenceFingerprint === record.evidenceFingerprint,
  );
  if (idx >= 0) {
    return { record: file.recommendations[idx]!, created: false };
  }
  // Replace prior cohort row for same candidate if present (idempotent rerun same freeze).
  file.recommendations = [
    record,
    ...file.recommendations.filter(
      (r) => !(r.candidateId === record.candidateId && r.cohortId === record.cohortId),
    ),
  ];
  file.updatedAt = new Date().toISOString();
  await writeStore(file);
  return { record, created: true };
}

export async function recordP2041OperatorDecision(input: {
  candidateId: string;
  cohortId: string;
  decision: Exclude<P2041OperatorDecision, null>;
  byUserId: string;
  notes?: string | null;
}): Promise<P2041RecommendationRecord | null> {
  const file = await readStore();
  const idx = file.recommendations.findIndex(
    (r) => r.candidateId === input.candidateId && r.cohortId === input.cohortId,
  );
  if (idx < 0) return null;
  const existing = file.recommendations[idx]!;
  const updated: P2041RecommendationRecord = {
    ...existing,
    operatorDecision: input.decision,
    operatorDecisionAt: new Date().toISOString(),
    operatorDecisionBy: input.byUserId,
    operatorNotes: input.notes ?? null,
  };
  file.recommendations[idx] = updated;
  file.updatedAt = new Date().toISOString();
  await writeStore(file);
  return updated;
}
