import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  AiActionAuditEntry,
  AiActionKind,
  AiMemoryRecord,
} from "@/lib/ai-action-engine/types";

const STORE_DIR = path.join(process.cwd(), ".data");
const MEMORY_PATH = path.join(STORE_DIR, "ai-action-memory.json");
const AUDIT_PATH = path.join(STORE_DIR, "ai-action-audit.jsonl");

type MemoryStoreFile = {
  records: AiMemoryRecord[];
  updatedAt: string;
};

async function readMemoryStore(): Promise<MemoryStoreFile> {
  try {
    const raw = await readFile(MEMORY_PATH, "utf8");
    const parsed = JSON.parse(raw) as MemoryStoreFile;
    return {
      records: Array.isArray(parsed.records) ? parsed.records : [],
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
    };
  } catch {
    return { records: [], updatedAt: new Date().toISOString() };
  }
}

async function writeMemoryStore(file: MemoryStoreFile): Promise<void> {
  await mkdir(STORE_DIR, { recursive: true });
  await writeFile(MEMORY_PATH, JSON.stringify(file, null, 2), "utf8");
}

async function appendAuditEntry(entry: AiActionAuditEntry): Promise<void> {
  await mkdir(STORE_DIR, { recursive: true });
  await appendFile(AUDIT_PATH, `${JSON.stringify(entry)}\n`, "utf8");
}

export async function recordAiRecommendation(input: {
  insightId: string;
  recommendation: string;
}): Promise<AiMemoryRecord> {
  const store = await readMemoryStore();
  const existing = store.records.find((row) => row.insightId === input.insightId);
  if (existing) return existing;

  const record: AiMemoryRecord = {
    id: randomUUID(),
    insightId: input.insightId,
    recommendation: input.recommendation,
    actionTaken: null,
    result: null,
    recordedAt: new Date().toISOString(),
  };
  store.records.unshift(record);
  store.records = store.records.slice(0, 500);
  store.updatedAt = new Date().toISOString();
  await writeMemoryStore(store);
  return record;
}

export async function recordAiActionTaken(input: {
  insightId: string;
  recommendation: string;
  actionKind: AiActionKind;
  userId: string;
  userName: string;
  outcome: "success" | "failure";
  outcomeDetail: string;
  entityId?: string;
}): Promise<{ audit: AiActionAuditEntry; memory: AiMemoryRecord }> {
  const now = new Date().toISOString();
  const audit: AiActionAuditEntry = {
    id: randomUUID(),
    insightId: input.insightId,
    recommendation: input.recommendation,
    actionKind: input.actionKind,
    userId: input.userId,
    userName: input.userName,
    outcome: input.outcome,
    outcomeDetail: input.outcomeDetail,
    timestamp: now,
    entityId: input.entityId,
  };
  await appendAuditEntry(audit);

  const store = await readMemoryStore();
  const index = store.records.findIndex((row) => row.insightId === input.insightId);
  const memory: AiMemoryRecord =
    index >= 0
      ? {
          ...store.records[index]!,
          actionTaken: input.actionKind,
          result: input.outcomeDetail,
          recordedAt: now,
        }
      : {
          id: randomUUID(),
          insightId: input.insightId,
          recommendation: input.recommendation,
          actionTaken: input.actionKind,
          result: input.outcomeDetail,
          recordedAt: now,
        };

  if (index >= 0) store.records[index] = memory;
  else store.records.unshift(memory);
  store.updatedAt = now;
  await writeMemoryStore(store);

  return { audit, memory };
}

export async function listAiActionAudit(limit = 25): Promise<AiActionAuditEntry[]> {
  try {
    const raw = await readFile(AUDIT_PATH, "utf8");
    const lines = raw.trim().split("\n").filter(Boolean);
    return lines
      .slice(-limit)
      .reverse()
      .map((line) => JSON.parse(line) as AiActionAuditEntry);
  } catch {
    return [];
  }
}

export async function getAiMemorySummary(): Promise<{
  recommendationsTracked: number;
  actionsTaken: number;
  successRate: number;
}> {
  const store = await readMemoryStore();
  const actionsTaken = store.records.filter((row) => row.actionTaken !== null).length;
  const audit = await listAiActionAudit(100);
  const successes = audit.filter((row) => row.outcome === "success").length;
  const successRate = audit.length > 0 ? Math.round((successes / audit.length) * 100) : 0;
  return {
    recommendationsTracked: store.records.length,
    actionsTaken,
    successRate,
  };
}
