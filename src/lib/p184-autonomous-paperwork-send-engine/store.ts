import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { recruitingDataDir, safeRecruitingMkdir } from "@/lib/recruiting-data-dir";
import {
  DEFAULT_P184_CONFIG,
  type P184EngineConfig,
  type P184EngineStateFile,
  type P184QueueItem,
} from "@/lib/p184-autonomous-paperwork-send-engine/types";
import { pruneSendTimestamps } from "@/lib/p184-autonomous-paperwork-send-engine/rateLimiter";
import {
  loadP184FromDurable,
  saveP184ToDurable,
  shouldUseP1855DurableBackend,
} from "@/lib/p185-5-vercel-durable-storage/bridges";

function statePath(): string {
  return path.join(recruitingDataDir(), "p184-autonomous-paperwork-send-state.json");
}

let memoryState: P184EngineStateFile | null = null;

function emptyState(): P184EngineStateFile {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    config: { ...DEFAULT_P184_CONFIG, rateLimits: { ...DEFAULT_P184_CONFIG.rateLimits } },
    queue: [],
    sendTimestamps: [],
    completedIdempotencyKeys: [],
  };
}

function normalizeState(raw: Partial<P184EngineStateFile> | null | undefined): P184EngineStateFile {
  const base = emptyState();
  if (!raw || typeof raw !== "object") return base;
  return {
    version: 1,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : base.updatedAt,
    config: {
      ...base.config,
      ...(raw.config ?? {}),
      rateLimits: {
        ...base.config.rateLimits,
        ...(raw.config?.rateLimits ?? {}),
      },
    },
    queue: Array.isArray(raw.queue) ? raw.queue : [],
    sendTimestamps: Array.isArray(raw.sendTimestamps) ? raw.sendTimestamps : [],
    completedIdempotencyKeys: Array.isArray(raw.completedIdempotencyKeys)
      ? raw.completedIdempotencyKeys
      : [],
  };
}

export async function loadP184EngineState(): Promise<P184EngineStateFile> {
  if (shouldUseP1855DurableBackend()) {
    const state = await loadP184FromDurable();
    memoryState = state;
    return structuredClone(state);
  }
  if (memoryState) return structuredClone(memoryState);
  try {
    const raw = await readFile(statePath(), "utf8");
    const parsed = normalizeState(JSON.parse(raw) as Partial<P184EngineStateFile>);
    memoryState = parsed;
    return structuredClone(parsed);
  } catch {
    const empty = emptyState();
    memoryState = empty;
    return structuredClone(empty);
  }
}

export async function saveP184EngineState(state: P184EngineStateFile): Promise<P184EngineStateFile> {
  if (shouldUseP1855DurableBackend()) {
    const next = await saveP184ToDurable(state);
    memoryState = next;
    return structuredClone(next);
  }
  const next: P184EngineStateFile = {
    ...state,
    updatedAt: new Date().toISOString(),
    sendTimestamps: pruneSendTimestamps(state.sendTimestamps),
    completedIdempotencyKeys: state.completedIdempotencyKeys.slice(-5_000),
    queue: state.queue.slice(-2_000),
  };
  memoryState = next;
  await safeRecruitingMkdir();
  await writeFile(statePath(), `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return structuredClone(next);
}

export async function updateP184Config(
  patch: Partial<P184EngineConfig>,
): Promise<P184EngineStateFile> {
  const state = await loadP184EngineState();
  state.config = {
    ...state.config,
    ...patch,
    rateLimits: {
      ...state.config.rateLimits,
      ...(patch.rateLimits ?? {}),
    },
    updatedAt: new Date().toISOString(),
  };
  return saveP184EngineState(state);
}

export async function upsertP184QueueItems(items: P184QueueItem[]): Promise<P184EngineStateFile> {
  const state = await loadP184EngineState();
  const byId = new Map(state.queue.map((item) => [item.candidateId, item]));
  for (const item of items) {
    byId.set(item.candidateId, item);
  }
  state.queue = [...byId.values()];
  return saveP184EngineState(state);
}

export function resetP184StateMemoryForTests(): void {
  memoryState = null;
}
