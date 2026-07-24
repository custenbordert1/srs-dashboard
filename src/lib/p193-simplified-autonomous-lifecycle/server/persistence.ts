/**
 * Filesystem persistence for P193 simplified lifecycle.
 * Must NEVER be imported by Client Components.
 * Prefer `@/lib/p193-simplified-autonomous-lifecycle/server` (with server-only)
 * from App Router / Route Handlers. Scripts may import this module directly.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { recruitingDataDir } from "@/lib/recruiting-data-dir";
import { createP193Record } from "@/lib/p193-simplified-autonomous-lifecycle/recordFactory";
import { assertLegalP193Transition } from "@/lib/p193-simplified-autonomous-lifecycle/stateMachine";
import {
  DEFAULT_P193_FLAGS,
  type P193Flags,
  type P193LifecycleRecord,
  type P193LifecycleState,
} from "@/lib/p193-simplified-autonomous-lifecycle/types";

export type P193LifecycleStoreFile = {
  version: 1;
  flags: P193Flags;
  records: Record<string, P193LifecycleRecord>;
  updatedAt: string;
};

function storePath(): string {
  return path.join(recruitingDataDir(), "p193-simplified-lifecycle.json");
}

function flagsPath(): string {
  return path.join(recruitingDataDir(), "p193-simplified-lifecycle-flags.json");
}

export function emptyStore(): P193LifecycleStoreFile {
  return {
    version: 1,
    flags: { ...DEFAULT_P193_FLAGS },
    records: {},
    updatedAt: new Date().toISOString(),
  };
}

export async function readP193LifecycleStore(): Promise<P193LifecycleStoreFile> {
  try {
    const raw = await readFile(storePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<P193LifecycleStoreFile>;
    return {
      ...emptyStore(),
      ...parsed,
      flags: { ...DEFAULT_P193_FLAGS, ...(parsed.flags ?? {}) },
      records: parsed.records && typeof parsed.records === "object" ? parsed.records : {},
    };
  } catch {
    return emptyStore();
  }
}

export async function writeP193LifecycleStore(store: P193LifecycleStoreFile): Promise<void> {
  await mkdir(recruitingDataDir(), { recursive: true });
  store.updatedAt = new Date().toISOString();
  await writeFile(storePath(), `${JSON.stringify(store, null, 2)}\n`);
}

export async function readP193Flags(): Promise<P193Flags> {
  try {
    const raw = await readFile(flagsPath(), "utf8");
    return { ...DEFAULT_P193_FLAGS, ...(JSON.parse(raw) as Partial<P193Flags>) };
  } catch {
    const store = await readP193LifecycleStore();
    return store.flags;
  }
}

export async function writeP193Flags(flags: Partial<P193Flags>): Promise<P193Flags> {
  const next = { ...(await readP193Flags()), ...flags };
  await mkdir(recruitingDataDir(), { recursive: true });
  await writeFile(flagsPath(), `${JSON.stringify(next, null, 2)}\n`);
  const store = await readP193LifecycleStore();
  store.flags = next;
  await writeP193LifecycleStore(store);
  return next;
}

export async function upsertP193Record(record: P193LifecycleRecord): Promise<P193LifecycleRecord> {
  const store = await readP193LifecycleStore();
  store.records[record.candidateId] = record;
  await writeP193LifecycleStore(store);
  return record;
}

export async function transitionP193State(input: {
  candidateId: string;
  to: P193LifecycleState;
  detail: string;
}): Promise<P193LifecycleRecord> {
  const store = await readP193LifecycleStore();
  const existing =
    store.records[input.candidateId] ?? createP193Record({ candidateId: input.candidateId });
  assertLegalP193Transition(existing.state, input.to);
  const now = new Date().toISOString();
  const next: P193LifecycleRecord = {
    ...existing,
    previousState: existing.state,
    state: input.to,
    enteredAt: now,
    updatedAt: now,
    metadata: {
      ...existing.metadata,
      lastStatusChangeAt: now,
    },
    timeline: [...existing.timeline, { at: now, state: input.to, detail: input.detail }],
    version: existing.version + 1,
  };
  store.records[input.candidateId] = next;
  await writeP193LifecycleStore(store);
  return next;
}

export async function listP193Records(): Promise<P193LifecycleRecord[]> {
  const store = await readP193LifecycleStore();
  return Object.values(store.records);
}

export { createP193Record };
