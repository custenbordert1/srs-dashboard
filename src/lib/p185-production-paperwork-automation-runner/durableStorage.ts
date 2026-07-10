import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  canWriteRecruitingFilesystem,
  isServerlessRuntime,
  isUnsafeDataDir,
  recruitingDataDir,
  useInMemoryPersistence,
} from "@/lib/recruiting-data-dir";
import {
  emptyP185RunnerState,
  type P185RunnerStateFile,
} from "@/lib/p185-production-paperwork-automation-runner/types";

export type P185StorageAdapterName = "local_filesystem" | "durable_volume" | "ephemeral_tmp" | "in_memory";

export type P185StorageHealth = {
  adapter: P185StorageAdapterName;
  durable: boolean;
  healthy: boolean;
  detail: string;
  dataDir: string;
};

const STATE_FILE = "p185-production-paperwork-automation-state.json";
const P184_STATE_FILE = "p184-autonomous-paperwork-send-state.json";

let memoryState: P185RunnerStateFile | null = null;
let forceEphemeralForTests = false;
let forceDurableForTests = false;

export function resetP185StorageMemoryForTests(): void {
  memoryState = null;
  forceEphemeralForTests = false;
  forceDurableForTests = false;
}

export function setP185StorageTestFlags(flags: {
  forceEphemeral?: boolean;
  forceDurable?: boolean;
}): void {
  if (flags.forceEphemeral != null) forceEphemeralForTests = flags.forceEphemeral;
  if (flags.forceDurable != null) forceDurableForTests = flags.forceDurable;
}

export function p185DataDir(): string {
  const override =
    process.env.P185_DURABLE_DATA_DIR?.trim() || process.env.SRS_RECRUITING_DATA_DIR?.trim();
  if (override) {
    if (isServerlessRuntime() && !path.isAbsolute(override)) {
      return recruitingDataDir();
    }
    return path.resolve(override);
  }
  return recruitingDataDir();
}

function statePath(): string {
  return path.join(p185DataDir(), STATE_FILE);
}

function classifyAdapter(dir: string): P185StorageHealth {
  if (forceEphemeralForTests) {
    return {
      adapter: "in_memory",
      durable: false,
      healthy: false,
      detail: "Test flag forced ephemeral/unavailable storage.",
      dataDir: dir,
    };
  }
  if (forceDurableForTests || process.env.P185_FORCE_DURABLE === "1") {
    return {
      adapter: "local_filesystem",
      durable: true,
      healthy: true,
      detail: "Forced durable local filesystem adapter (test/dev).",
      dataDir: dir,
    };
  }
  if (useInMemoryPersistence()) {
    return {
      adapter: "in_memory",
      durable: false,
      healthy: false,
      detail: "In-memory persistence active — not durable across deploys.",
      dataDir: dir,
    };
  }
  if (!canWriteRecruitingFilesystem() || isUnsafeDataDir(dir)) {
    return {
      adapter: "in_memory",
      durable: false,
      healthy: false,
      detail: "Filesystem writes unavailable or unsafe data directory.",
      dataDir: dir,
    };
  }
  const resolved = path.resolve(dir);
  if (isServerlessRuntime() && resolved.startsWith("/tmp/")) {
    return {
      adapter: "ephemeral_tmp",
      durable: false,
      healthy: false,
      detail: "Serverless /tmp storage is ephemeral — live sends fail closed.",
      dataDir: dir,
    };
  }
  if (resolved.startsWith("/mnt/") || process.env.P185_DURABLE_DATA_DIR?.trim()) {
    return {
      adapter: "durable_volume",
      durable: true,
      healthy: true,
      detail: "Durable volume / explicit P185_DURABLE_DATA_DIR selected.",
      dataDir: dir,
    };
  }
  return {
    adapter: "local_filesystem",
    durable: true,
    healthy: true,
    detail: "Local filesystem adapter (development or company-hosted disk).",
    dataDir: dir,
  };
}

export function getP185StorageHealth(): P185StorageHealth {
  return classifyAdapter(p185DataDir());
}

function normalizeState(raw: Partial<P185RunnerStateFile> | null | undefined): P185RunnerStateFile {
  const base = emptyP185RunnerState();
  if (!raw || typeof raw !== "object") return base;
  return {
    ...base,
    ...raw,
    schemaVersion: 1,
    recordVersion: typeof raw.recordVersion === "number" ? raw.recordVersion : 0,
    safety: { ...base.safety, ...(raw.safety ?? {}) },
    cursor: { ...base.cursor, ...(raw.cursor ?? {}) },
    circuit: { ...base.circuit, ...(raw.circuit ?? {}) },
    envelopes: Array.isArray(raw.envelopes) ? raw.envelopes : [],
    operations: Array.isArray(raw.operations) ? raw.operations : [],
    alerts: Array.isArray(raw.alerts) ? raw.alerts : [],
    metrics: { ...base.metrics, ...(raw.metrics ?? {}) },
  };
}

async function atomicWriteJson(filePath: string, value: unknown): Promise<void> {
  const dir = path.dirname(filePath);
  if (!isUnsafeDataDir(dir) && canWriteRecruitingFilesystem()) {
    await mkdir(dir, { recursive: true });
  }
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const payload = `${JSON.stringify(value, null, 2)}\n`;
  await writeFile(tmp, payload, "utf8");
  await rename(tmp, filePath);
}

export async function loadP185RunnerState(): Promise<P185RunnerStateFile> {
  if (memoryState && (useInMemoryPersistence() || forceEphemeralForTests)) {
    return structuredClone(memoryState);
  }
  try {
    const raw = await readFile(statePath(), "utf8");
    const parsed = normalizeState(JSON.parse(raw) as Partial<P185RunnerStateFile>);
    memoryState = parsed;
    return structuredClone(parsed);
  } catch {
    const migrated = await maybeMigrateFromP184();
    if (migrated) {
      memoryState = migrated;
      return structuredClone(migrated);
    }
    const empty = emptyP185RunnerState();
    memoryState = empty;
    return structuredClone(empty);
  }
}

async function maybeMigrateFromP184(): Promise<P185RunnerStateFile | null> {
  try {
    const p184Path = path.join(p185DataDir(), P184_STATE_FILE);
    await readFile(p184Path, "utf8");
    const state = emptyP185RunnerState();
    state.updatedAt = new Date().toISOString();
    state.alerts.push({
      id: `migrate-${Date.now()}`,
      severity: "info",
      code: "p184_state_detected",
      message: "Initialized P185 state alongside existing P184 JSON store.",
      recommendedAction: "No action — P184 remains the send engine; P185 orchestrates schedules.",
      at: new Date().toISOString(),
      active: false,
    });
    return state;
  } catch {
    return null;
  }
}

export async function saveP185RunnerState(state: P185RunnerStateFile): Promise<P185RunnerStateFile> {
  const next: P185RunnerStateFile = {
    ...state,
    schemaVersion: 1,
    recordVersion: state.recordVersion + 1,
    updatedAt: new Date().toISOString(),
    envelopes: state.envelopes.slice(-2_000),
    operations: state.operations.slice(-2_000),
    alerts: state.alerts.slice(-200),
  };
  memoryState = next;
  const health = getP185StorageHealth();
  if (!health.healthy && !forceEphemeralForTests) {
    // Still keep memory for dry-run degraded mode; callers check health for live.
    return structuredClone(next);
  }
  if (useInMemoryPersistence() || forceEphemeralForTests) {
    return structuredClone(next);
  }
  await atomicWriteJson(statePath(), next);
  return structuredClone(next);
}

/**
 * Compare-and-set update. Returns null when the expected version no longer matches.
 */
export async function casUpdateP185RunnerState(
  expectedVersion: number,
  mutator: (state: P185RunnerStateFile) => P185RunnerStateFile | null,
): Promise<P185RunnerStateFile | null> {
  const current = await loadP185RunnerState();
  if (current.recordVersion !== expectedVersion) return null;
  const mutated = mutator(structuredClone(current));
  if (!mutated) return null;
  mutated.recordVersion = expectedVersion;
  return saveP185RunnerState(mutated);
}

export async function updateP185RunnerState(
  mutator: (state: P185RunnerStateFile) => void,
): Promise<P185RunnerStateFile> {
  const state = await loadP185RunnerState();
  mutator(state);
  return saveP185RunnerState(state);
}
