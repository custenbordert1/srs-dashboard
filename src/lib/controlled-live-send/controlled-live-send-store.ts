import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { recruitingDataDir } from "@/lib/recruiting-data-dir";
import type {
  ControlledLiveSendExecutionEntry,
  ControlledLiveSendStateFile,
} from "@/lib/controlled-live-send/types";

function dataDir(): string {
  return recruitingDataDir();
}

export function p100StatePath(): string {
  return path.join(dataDir(), "p100-controlled-live-send-state.json");
}

export function p100AuditLogPath(): string {
  return path.join(dataDir(), "p100-controlled-live-send-audit.jsonl");
}

async function ensureDataDir(): Promise<void> {
  await mkdir(dataDir(), { recursive: true });
}

export async function loadP100State(): Promise<ControlledLiveSendStateFile> {
  try {
    const raw = await readFile(p100StatePath(), "utf8");
    return JSON.parse(raw) as ControlledLiveSendStateFile;
  } catch {
    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      sentCandidateIds: [],
      skippedCandidateIds: [],
      failedCandidateIds: [],
      lastExecutionAt: null,
      lastMode: null,
    };
  }
}

export async function saveP100State(state: ControlledLiveSendStateFile): Promise<void> {
  await ensureDataDir();
  await writeFile(p100StatePath(), `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export async function appendP100Audit(entry: ControlledLiveSendExecutionEntry): Promise<void> {
  await ensureDataDir();
  await appendFile(p100AuditLogPath(), `${JSON.stringify(entry)}\n`, "utf8");
}

export function newP100ExecutionId(): string {
  return randomUUID();
}
