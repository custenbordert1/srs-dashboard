import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  CandidateOnboardingRecord,
  CandidateOnboardingRunSummary,
} from "@/lib/candidate-onboarding-engine/types";
import {recruitingDataDir, safeRecruitingMkdir } from "@/lib/recruiting-data-dir";

const MAX_RECORDS = 500;

function recordsPath(): string {
  return path.join(recruitingDataDir(), "candidate-onboarding-records.json");
}

function summaryPath(): string {
  return path.join(recruitingDataDir(), "candidate-onboarding-last-run.json");
}

type RecordsStoreFile = {
  records: CandidateOnboardingRecord[];
  updatedAt: string;
};

type SummaryStoreFile = {
  summary: CandidateOnboardingRunSummary | null;
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
  await safeRecruitingMkdir();
  await writeFile(recordsPath(), `${JSON.stringify(file, null, 2)}\n`, "utf8");
}

export function createOnboardingId(): string {
  return randomUUID();
}

export async function recordCandidateOnboarding(
  entry: CandidateOnboardingRecord,
): Promise<CandidateOnboardingRecord> {
  const file = await readRecordsFile();
  const index = file.records.findIndex((row) => row.onboardingId === entry.onboardingId);
  if (index >= 0) file.records[index] = entry;
  else {
    file.records.unshift(entry);
    file.records = file.records.slice(0, MAX_RECORDS);
  }
  file.updatedAt = new Date().toISOString();
  await writeRecordsFile(file);
  return entry;
}

export async function listCandidateOnboardingRecords(
  limit = 50,
): Promise<CandidateOnboardingRecord[]> {
  return (await readRecordsFile()).records.slice(0, limit);
}

export async function listAllCandidateOnboardingRecords(): Promise<CandidateOnboardingRecord[]> {
  return (await readRecordsFile()).records;
}

export async function getOnboardingRecordById(
  onboardingId: string,
): Promise<CandidateOnboardingRecord | null> {
  return (await readRecordsFile()).records.find((row) => row.onboardingId === onboardingId) ?? null;
}

export async function findActiveOnboardingRecord(
  candidateId: string,
): Promise<CandidateOnboardingRecord | null> {
  const file = await readRecordsFile();
  return (
    file.records.find(
      (row) =>
        row.candidateId === candidateId &&
        row.status !== "failed" &&
        row.status !== "declined" &&
        row.status !== "expired",
    ) ?? null
  );
}

export async function findOnboardingBySignatureRequest(
  signatureRequestId: string,
): Promise<CandidateOnboardingRecord | null> {
  const file = await readRecordsFile();
  return file.records.find((row) => row.signatureRequestId === signatureRequestId) ?? null;
}

export async function saveOnboardingRunSummary(
  summary: CandidateOnboardingRunSummary,
): Promise<void> {
  await safeRecruitingMkdir();
  await writeFile(
    summaryPath(),
    `${JSON.stringify({ summary, updatedAt: new Date().toISOString() }, null, 2)}\n`,
    "utf8",
  );
}

export async function loadOnboardingRunSummary(): Promise<CandidateOnboardingRunSummary | null> {
  try {
    const raw = await readFile(summaryPath(), "utf8");
    const parsed = JSON.parse(raw) as SummaryStoreFile;
    return parsed.summary ?? null;
  } catch {
    return null;
  }
}
