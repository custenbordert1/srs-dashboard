import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import {
  loadMappingReviewRecords,
  saveMappingReviewDecision,
} from "@/lib/p108-intelligent-project-mapping/mapping-review-store";
import type { MappingReviewAction } from "@/lib/p108-intelligent-project-mapping/types";
import type { P109ReviewDecision, P109ReviewDecisionRecord } from "@/lib/p109-project-mapping-review/types";
import { recruitingDataDir } from "@/lib/recruiting-data-dir";

function p109StorePath(): string {
  return path.join(recruitingDataDir(), "p109-project-mapping-review-decisions.json");
}

type P109StoreFile = {
  updatedAt: string;
  records: P109ReviewDecisionRecord[];
};

function p109ToP108Action(decision: P109ReviewDecision): MappingReviewAction {
  if (decision === "approved") return "approve";
  if (decision === "rejected") return "reject";
  return "skip";
}

async function ensureStoreDir(): Promise<void> {
  await mkdir(path.dirname(p109StorePath()), { recursive: true });
}

export function p109ReviewStorePath(): string {
  return p109StorePath();
}

function migrateP108Record(record: {
  candidateId: string;
  sourcePositionId: string;
  recommendedPositionId: string | null;
  action: MappingReviewAction;
  decidedAt: string;
  decidedBy?: string;
  confidenceScore: number;
}): P109ReviewDecisionRecord {
  const decision: P109ReviewDecision =
    record.action === "approve" ? "approved" : record.action === "reject" ? "rejected" : "skipped";
  return {
    candidateId: record.candidateId,
    candidateName: "",
    closedPositionId: record.sourcePositionId,
    recommendedPositionId: record.recommendedPositionId,
    decision,
    reviewer: record.decidedBy ?? "unknown",
    notes: "",
    timestamp: record.decidedAt,
    confidenceScore: record.confidenceScore,
    mappingReasons: [],
    mappingDecision: "REVIEW",
    factorScores: [],
  };
}

export async function loadP109ReviewRecords(): Promise<P109ReviewDecisionRecord[]> {
  const p109Records: P109ReviewDecisionRecord[] = [];
  try {
    const raw = await readFile(p109StorePath(), "utf8");
    const parsed = JSON.parse(raw) as P109StoreFile;
    if (Array.isArray(parsed.records)) p109Records.push(...parsed.records);
  } catch {
    // no P109 store yet
  }

  const p108Records = await loadMappingReviewRecords();
  const byCandidate = new Map(p109Records.map((r) => [r.candidateId, r]));

  for (const legacy of p108Records) {
    if (!byCandidate.has(legacy.candidateId)) {
      byCandidate.set(legacy.candidateId, migrateP108Record(legacy));
    }
  }

  return [...byCandidate.values()];
}

export async function saveP109ReviewDecision(input: {
  candidateId: string;
  candidateName: string;
  closedPositionId: string;
  recommendedPositionId: string | null;
  decision: P109ReviewDecision;
  reviewer: string;
  notes?: string;
  confidenceScore: number;
  mappingReasons: string[];
  mappingDecision: P109ReviewDecisionRecord["mappingDecision"];
  factorScores: P109ReviewDecisionRecord["factorScores"];
}): Promise<P109ReviewDecisionRecord> {
  await ensureStoreDir();
  const records = await loadP109ReviewRecords();
  const record: P109ReviewDecisionRecord = {
    candidateId: input.candidateId,
    candidateName: input.candidateName,
    closedPositionId: input.closedPositionId,
    recommendedPositionId: input.recommendedPositionId,
    decision: input.decision,
    reviewer: input.reviewer,
    notes: input.notes?.trim() ?? "",
    timestamp: new Date().toISOString(),
    confidenceScore: input.confidenceScore,
    mappingReasons: input.mappingReasons,
    mappingDecision: input.mappingDecision,
    factorScores: input.factorScores,
  };

  const filtered = records.filter((r) => r.candidateId !== input.candidateId);
  filtered.push(record);

  const payload: P109StoreFile = {
    updatedAt: new Date().toISOString(),
    records: filtered,
  };
  await writeFile(p109StorePath(), `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  await saveMappingReviewDecision({
    candidateId: input.candidateId,
    sourcePositionId: input.closedPositionId,
    recommendedPositionId: input.recommendedPositionId,
    action: p109ToP108Action(input.decision),
    confidenceScore: input.confidenceScore,
    decidedBy: input.reviewer,
  });

  return record;
}

export function findP109ReviewRecord(
  records: P109ReviewDecisionRecord[],
  candidateId: string,
): P109ReviewDecisionRecord | undefined {
  return records.find((r) => r.candidateId === candidateId);
}
