import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CandidateExecutionRunSummary } from "@/lib/candidate-automation-execution/types";
import { recruitingDataDir } from "@/lib/recruiting-data-dir";

function summaryPath(): string {
  return path.join(recruitingDataDir(), "candidate-automation-execution-last-run.json");
}

type SummaryStoreFile = {
  summary: CandidateExecutionRunSummary | null;
  updatedAt: string;
};

async function readSummaryFile(): Promise<SummaryStoreFile> {
  try {
    const raw = await readFile(summaryPath(), "utf8");
    const parsed = JSON.parse(raw) as SummaryStoreFile;
    return {
      summary: parsed.summary ?? null,
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
    };
  } catch {
    return { summary: null, updatedAt: new Date().toISOString() };
  }
}

async function writeSummaryFile(file: SummaryStoreFile): Promise<void> {
  await mkdir(recruitingDataDir(), { recursive: true });
  await writeFile(summaryPath(), `${JSON.stringify(file, null, 2)}\n`, "utf8");
}

export async function loadExecutionRunSummary(): Promise<CandidateExecutionRunSummary | null> {
  return (await readSummaryFile()).summary;
}

export async function saveExecutionRunSummary(
  summary: CandidateExecutionRunSummary,
): Promise<CandidateExecutionRunSummary> {
  await writeSummaryFile({ summary, updatedAt: new Date().toISOString() });
  return summary;
}
