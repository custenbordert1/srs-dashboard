import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { recruitingDataDir, safeRecruitingMkdir } from "@/lib/recruiting-data-dir";
import {
  emptyP1853State,
  type P1853RolloutStateFile,
} from "@/lib/p185-3-controlled-live-paperwork-rollout/types";
import {
  loadP1853FromDurable,
  saveP1853ToDurable,
  shouldUseP1855DurableBackend,
} from "@/lib/p185-5-vercel-durable-storage/bridges";

const STATE_FILE = "p185-3-controlled-live-paperwork-rollout-state.json";

function statePath(): string {
  return path.join(recruitingDataDir(), STATE_FILE);
}

let memory: P1853RolloutStateFile | null = null;

export function resetP1853StateMemoryForTests(): void {
  memory = null;
}

export async function loadP1853State(): Promise<P1853RolloutStateFile> {
  if (shouldUseP1855DurableBackend()) {
    const state = await loadP1853FromDurable();
    memory = state;
    return structuredClone(state);
  }
  if (memory) return structuredClone(memory);
  try {
    const raw = await readFile(statePath(), "utf8");
    memory = { ...emptyP1853State(), ...(JSON.parse(raw) as P1853RolloutStateFile) };
    return structuredClone(memory);
  } catch {
    memory = emptyP1853State();
    return structuredClone(memory);
  }
}

export async function saveP1853State(state: P1853RolloutStateFile): Promise<P1853RolloutStateFile> {
  if (shouldUseP1855DurableBackend()) {
    const next = await saveP1853ToDurable(state);
    memory = next;
    return structuredClone(next);
  }
  const next: P1853RolloutStateFile = {
    ...state,
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
  };
  memory = next;
  await safeRecruitingMkdir();
  await writeFile(statePath(), `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return structuredClone(next);
}
