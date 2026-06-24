import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { CandidateExecutionRecord } from "@/lib/candidate-automation-execution/types";
import { recruitingDataDir } from "@/lib/recruiting-data-dir";

const MAX_RECORDS = 500;

function recordsPath(): string {
  return path.join(recruitingDataDir(), "candidate-automation-execution-records.json");
}

type RecordsStoreFile = {
  records: CandidateExecutionRecord[];
  updatedAt: string;
};

async function readRecordsFile(): Promise<RecordsStoreFile> {
  try {
    const raw = await readFile(recordsPath(), "utf8");
    const parsed = JSON.parse(raw) as RecordsStoreFile;
    return {
      records: Array.isArray(parsed.records) ? parsed.records : [],
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
    };
  } catch {
    return { records: [], updatedAt: new Date().toISOString() };
  }
}

async function writeRecordsFile(file: RecordsStoreFile): Promise<void> {
  await mkdir(recruitingDataDir(), { recursive: true });
  await writeFile(recordsPath(), `${JSON.stringify(file, null, 2)}\n`, "utf8");
}

export function createExecutionId(): string {
  return randomUUID();
}

export async function recordCandidateExecution(
  entry: CandidateExecutionRecord,
): Promise<CandidateExecutionRecord> {
  const file = await readRecordsFile();
  const existingIndex = file.records.findIndex((row) => row.executionId === entry.executionId);
  if (existingIndex >= 0) {
    file.records[existingIndex] = entry;
  } else {
    file.records.unshift(entry);
    file.records = file.records.slice(0, MAX_RECORDS);
  }
  file.updatedAt = new Date().toISOString();
  await writeRecordsFile(file);
  return entry;
}

export async function getCandidateExecution(
  executionId: string,
): Promise<CandidateExecutionRecord | null> {
  return (await readRecordsFile()).records.find((row) => row.executionId === executionId) ?? null;
}

export async function listCandidateExecutions(limit = 50): Promise<CandidateExecutionRecord[]> {
  return (await readRecordsFile()).records.slice(0, limit);
}

export async function findActiveExecution(
  candidateId: string,
  executionType: CandidateExecutionRecord["executionType"],
): Promise<CandidateExecutionRecord | null> {
  const records = await readRecordsFile();
  return (
    records.records.find(
      (row) =>
        row.candidateId === candidateId &&
        row.executionType === executionType &&
        (row.status === "pending" ||
          row.status === "in_progress" ||
          row.status === "retrying" ||
          row.status === "completed"),
    ) ?? null
  );
}

export async function listFailedRetryableExecutions(
  maxRetries: number,
): Promise<CandidateExecutionRecord[]> {
  const records = await readRecordsFile();
  return records.records.filter(
    (row) => row.status === "failed" && row.retryCount < maxRetries,
  );
}
