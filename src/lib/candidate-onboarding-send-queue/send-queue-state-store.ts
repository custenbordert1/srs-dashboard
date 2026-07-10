import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  OnboardingSendAttemptLog,
  OnboardingSendQueueWorkerState,
} from "@/lib/candidate-onboarding-send-queue/types";
import {recruitingDataDir, safeRecruitingMkdir } from "@/lib/recruiting-data-dir";

const MAX_ATTEMPT_LOGS = 2_000;

function statePath(): string {
  return path.join(recruitingDataDir(), "candidate-onboarding-send-queue-state.json");
}

type StateStoreFile = {
  worker: OnboardingSendQueueWorkerState;
  attemptLogs: OnboardingSendAttemptLog[];
  updatedAt: string;
};

const DEFAULT_WORKER: OnboardingSendQueueWorkerState = {
  running: false,
  lastTickAt: null,
  lastSendCompletedAt: null,
  lastBatchCompletedAt: null,
  sendsCompletedThisSession: 0,
  lastError: null,
  updatedAt: new Date().toISOString(),
};

async function readStateFile(): Promise<StateStoreFile> {
  try {
    const raw = await readFile(statePath(), "utf8");
    const parsed = JSON.parse(raw) as StateStoreFile;
    return {
      worker: { ...DEFAULT_WORKER, ...parsed.worker },
      attemptLogs: Array.isArray(parsed.attemptLogs) ? parsed.attemptLogs : [],
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
    };
  } catch {
    return { worker: { ...DEFAULT_WORKER }, attemptLogs: [], updatedAt: new Date().toISOString() };
  }
}

async function writeStateFile(file: StateStoreFile): Promise<void> {
  await safeRecruitingMkdir();
  await writeFile(statePath(), `${JSON.stringify(file, null, 2)}\n`, "utf8");
}

export async function loadOnboardingSendQueueWorkerState(): Promise<OnboardingSendQueueWorkerState> {
  return (await readStateFile()).worker;
}

export async function saveOnboardingSendQueueWorkerState(
  worker: OnboardingSendQueueWorkerState,
): Promise<OnboardingSendQueueWorkerState> {
  const file = await readStateFile();
  const now = new Date().toISOString();
  file.worker = { ...worker, updatedAt: now };
  file.updatedAt = now;
  await writeStateFile(file);
  return file.worker;
}

export function createSendAttemptId(): string {
  return randomUUID();
}

export async function appendOnboardingSendAttemptLog(
  entry: OnboardingSendAttemptLog,
): Promise<void> {
  const file = await readStateFile();
  file.attemptLogs.unshift(entry);
  file.attemptLogs = file.attemptLogs.slice(0, MAX_ATTEMPT_LOGS);
  file.updatedAt = new Date().toISOString();
  await writeStateFile(file);
}

export async function listOnboardingSendAttemptLogs(limit = 100): Promise<OnboardingSendAttemptLog[]> {
  return (await readStateFile()).attemptLogs.slice(0, limit);
}
