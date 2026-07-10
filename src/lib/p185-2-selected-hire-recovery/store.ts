import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { recruitingDataDir, safeRecruitingMkdir } from "@/lib/recruiting-data-dir";
import type { P1852StateFile } from "@/lib/p185-2-selected-hire-recovery/types";

const STATE_FILE = "p185-2-selected-hire-recovery-state.json";

function statePath(): string {
  return path.join(recruitingDataDir(), STATE_FILE);
}

function empty(): P1852StateFile {
  return {
    schemaVersion: 1,
    updatedAt: new Date(0).toISOString(),
    normalizations: [],
    lastRunAt: null,
    stats: {
      evaluated: 0,
      withAuthoritativeEvidence: 0,
      recoveredFromP181: 0,
      recoveredFromP83Executed: 0,
      recoveredFromP97: 0,
      recoveredFromP158: 0,
      normalizedToPaperworkNeeded: 0,
      eligibleNewPackets: 0,
      templateBlocked: 0,
      unresolvedSelectedJobs: 0,
      needsOperatorConfirmation: 0,
      activePackets: 0,
      completedPackets: 0,
      queueDepth: 0,
      duplicatesPrevented: 0,
    },
  };
}

let memory: P1852StateFile | null = null;

export function resetP1852StateMemoryForTests(): void {
  memory = null;
}

export async function loadP1852State(): Promise<P1852StateFile> {
  if (memory) return structuredClone(memory);
  try {
    const raw = await readFile(statePath(), "utf8");
    memory = { ...empty(), ...(JSON.parse(raw) as P1852StateFile) };
    return structuredClone(memory);
  } catch {
    memory = empty();
    return structuredClone(memory);
  }
}

export async function saveP1852State(state: P1852StateFile): Promise<P1852StateFile> {
  const next = { ...state, schemaVersion: 1 as const, updatedAt: new Date().toISOString() };
  memory = next;
  await safeRecruitingMkdir();
  await writeFile(statePath(), `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return structuredClone(next);
}
