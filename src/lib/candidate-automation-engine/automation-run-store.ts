import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { CandidateAutomationRunRecord } from "@/lib/candidate-automation-engine/types";
import { recruitingDataDir } from "@/lib/recruiting-data-dir";

const MAX_RUNS = 100;

function runsPath(): string {
  return path.join(recruitingDataDir(), "candidate-automation-runs.json");
}

type RunsStoreFile = {
  runs: CandidateAutomationRunRecord[];
  updatedAt: string;
};

async function readRunsFile(): Promise<RunsStoreFile> {
  try {
    const raw = await readFile(runsPath(), "utf8");
    const parsed = JSON.parse(raw) as RunsStoreFile;
    return {
      runs: Array.isArray(parsed.runs) ? parsed.runs : [],
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
    };
  } catch {
    return { runs: [], updatedAt: new Date().toISOString() };
  }
}

async function writeRunsFile(file: RunsStoreFile): Promise<void> {
  await mkdir(recruitingDataDir(), { recursive: true });
  await writeFile(runsPath(), `${JSON.stringify(file, null, 2)}\n`, "utf8");
}

export function createAutomationRunId(): string {
  return randomUUID();
}

export async function recordCandidateAutomationRun(
  entry: CandidateAutomationRunRecord,
): Promise<void> {
  const file = await readRunsFile();
  file.runs.unshift(entry);
  file.runs = file.runs.slice(0, MAX_RUNS);
  file.updatedAt = new Date().toISOString();
  await writeRunsFile(file);
}

export async function listCandidateAutomationRuns(
  limit = 20,
): Promise<CandidateAutomationRunRecord[]> {
  return (await readRunsFile()).runs.slice(0, limit);
}
