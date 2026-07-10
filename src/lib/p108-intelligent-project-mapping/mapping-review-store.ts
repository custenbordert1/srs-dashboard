import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { MappingReviewAction, MappingReviewRecord } from "@/lib/p108-intelligent-project-mapping/types";
import { recruitingDataDir } from "@/lib/recruiting-data-dir";

function reviewStorePath(): string {
  return path.join(recruitingDataDir(), "p108-mapping-review-decisions.json");
}

type ReviewStoreFile = {
  updatedAt: string;
  records: MappingReviewRecord[];
};

async function ensureStoreDir(): Promise<void> {
  await mkdir(path.dirname(reviewStorePath()), { recursive: true });
}

export function mappingReviewStorePath(): string {
  return reviewStorePath();
}

export async function loadMappingReviewRecords(): Promise<MappingReviewRecord[]> {
  try {
    const raw = await readFile(reviewStorePath(), "utf8");
    const parsed = JSON.parse(raw) as ReviewStoreFile;
    return Array.isArray(parsed.records) ? parsed.records : [];
  } catch {
    return [];
  }
}

export async function saveMappingReviewDecision(input: {
  candidateId: string;
  sourcePositionId: string;
  recommendedPositionId: string | null;
  action: MappingReviewAction;
  confidenceScore: number;
  decidedBy?: string;
}): Promise<MappingReviewRecord> {
  await ensureStoreDir();
  const records = await loadMappingReviewRecords();
  const record: MappingReviewRecord = {
    candidateId: input.candidateId,
    sourcePositionId: input.sourcePositionId,
    recommendedPositionId: input.recommendedPositionId,
    action: input.action,
    decidedAt: new Date().toISOString(),
    decidedBy: input.decidedBy,
    confidenceScore: input.confidenceScore,
  };
  const filtered = records.filter((r) => r.candidateId !== input.candidateId);
  filtered.push(record);
  const payload: ReviewStoreFile = {
    updatedAt: new Date().toISOString(),
    records: filtered,
  };
  await writeFile(reviewStorePath(), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return record;
}

export function priorDecisionForCandidate(
  records: MappingReviewRecord[],
  candidateId: string,
): MappingReviewAction | null {
  const record = records.find((r) => r.candidateId === candidateId);
  return record?.action ?? null;
}
