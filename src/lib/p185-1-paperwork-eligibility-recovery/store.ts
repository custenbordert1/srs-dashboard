import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { recruitingDataDir, safeRecruitingMkdir } from "@/lib/recruiting-data-dir";
import type {
  P1851JobMappingAlias,
  P1851RecoveryStateFile,
} from "@/lib/p185-1-paperwork-eligibility-recovery/types";

const STATE_FILE = "p185-1-paperwork-eligibility-recovery-state.json";

function statePath(): string {
  return path.join(recruitingDataDir(), STATE_FILE);
}

function emptyState(): P1851RecoveryStateFile {
  return {
    schemaVersion: 1,
    updatedAt: new Date(0).toISOString(),
    aliases: [],
    lastRecoveryAt: null,
    lastDryRunAt: null,
    stats: {
      evaluated: 0,
      eligibleNew: 0,
      eligibleReplacement: 0,
      awaitingApproval: 0,
      appliedNotSelected: 0,
      unresolvedJobs: 0,
      activePackets: 0,
      completedPackets: 0,
    },
  };
}

let memory: P1851RecoveryStateFile | null = null;

export function resetP1851StateMemoryForTests(): void {
  memory = null;
}

export async function loadP1851RecoveryState(): Promise<P1851RecoveryStateFile> {
  if (memory) return structuredClone(memory);
  try {
    const raw = await readFile(statePath(), "utf8");
    const parsed = JSON.parse(raw) as P1851RecoveryStateFile;
    memory = {
      ...emptyState(),
      ...parsed,
      aliases: Array.isArray(parsed.aliases) ? parsed.aliases : [],
      stats: { ...emptyState().stats, ...(parsed.stats ?? {}) },
    };
    return structuredClone(memory);
  } catch {
    memory = emptyState();
    return structuredClone(memory);
  }
}

export async function saveP1851RecoveryState(
  state: P1851RecoveryStateFile,
): Promise<P1851RecoveryStateFile> {
  const next: P1851RecoveryStateFile = {
    ...state,
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    aliases: state.aliases.slice(-5_000),
  };
  memory = next;
  await safeRecruitingMkdir();
  await writeFile(statePath(), `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return structuredClone(next);
}

export async function upsertP1851MappingAliases(
  aliases: P1851JobMappingAlias[],
): Promise<P1851RecoveryStateFile> {
  const state = await loadP1851RecoveryState();
  const byOriginal = new Map(state.aliases.map((a) => [a.originalPositionId, a]));
  for (const alias of aliases) {
    if (!alias.originalPositionId || !alias.resolvedPositionId) continue;
    if (alias.mappingMethod === "unresolved") continue;
    byOriginal.set(alias.originalPositionId, alias);
  }
  state.aliases = [...byOriginal.values()];
  return saveP1851RecoveryState(state);
}
