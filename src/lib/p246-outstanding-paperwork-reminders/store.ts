import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { recruitingDataDir, safeRecruitingMkdir } from "@/lib/recruiting-data-dir";
import { packetReminderKey } from "@/lib/p246-outstanding-paperwork-reminders/cadence";
import {
  P246_STORE_FILENAME,
  type P246PacketReminderState,
  type P246ReminderHistoryEntry,
  type P246ReminderStore,
} from "@/lib/p246-outstanding-paperwork-reminders/types";

function storePath(): string {
  const override = process.env.SRS_CANDIDATE_WORKFLOW_DATA_DIR?.trim();
  const dir = override ? path.resolve(override) : recruitingDataDir();
  return path.join(dir, P246_STORE_FILENAME);
}

export function emptyP246ReminderStore(): P246ReminderStore {
  return {
    version: 2,
    updatedAt: new Date().toISOString(),
    byPacketKey: {},
  };
}

export function emptyPacketState(
  candidateId: string,
  signatureRequestId: string,
): P246PacketReminderState {
  return {
    candidateId,
    signatureRequestId,
    reminderCount: 0,
    lastReminderAt: null,
    lastReminderNumber: 0,
    needsRecruiterFollowUp: false,
    needsRecruiterFollowUpAt: null,
    history: [],
    usedIdempotencyKeys: [],
  };
}

export async function loadP246ReminderStore(): Promise<P246ReminderStore> {
  try {
    const raw = await readFile(storePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<P246ReminderStore>;
    if (parsed.version !== 2 || !parsed.byPacketKey || typeof parsed.byPacketKey !== "object") {
      return emptyP246ReminderStore();
    }
    return {
      version: 2,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
      byPacketKey: parsed.byPacketKey,
    };
  } catch {
    return emptyP246ReminderStore();
  }
}

export async function saveP246ReminderStore(store: P246ReminderStore): Promise<void> {
  const dir = path.dirname(storePath());
  await safeRecruitingMkdir(dir);
  const payload: P246ReminderStore = {
    ...store,
    version: 2,
    updatedAt: new Date().toISOString(),
  };
  await writeFile(storePath(), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

export function getPacketReminderState(
  store: P246ReminderStore,
  candidateId: string,
  signatureRequestId: string,
): P246PacketReminderState {
  const key = packetReminderKey(candidateId, signatureRequestId);
  return store.byPacketKey[key] ?? emptyPacketState(candidateId, signatureRequestId);
}

export function hasIdempotencyKey(
  store: P246ReminderStore,
  candidateId: string,
  signatureRequestId: string,
  idempotencyKey: string,
): boolean {
  const state = getPacketReminderState(store, candidateId, signatureRequestId);
  return state.usedIdempotencyKeys.includes(idempotencyKey);
}

export function recordSuccessfulReminder(
  store: P246ReminderStore,
  entry: P246ReminderHistoryEntry,
): P246ReminderStore {
  const key = packetReminderKey(entry.candidateId, entry.signatureRequestId);
  const existing = store.byPacketKey[key] ?? emptyPacketState(entry.candidateId, entry.signatureRequestId);
  if (existing.usedIdempotencyKeys.includes(entry.idempotencyKey)) {
    return store;
  }
  const next: P246PacketReminderState = {
    ...existing,
    reminderCount: existing.reminderCount + 1,
    lastReminderAt: entry.sentAt,
    lastReminderNumber: entry.reminderNumber,
    history: [...existing.history, entry].slice(-50),
    usedIdempotencyKeys: [...existing.usedIdempotencyKeys, entry.idempotencyKey],
  };
  return {
    ...store,
    byPacketKey: {
      ...store.byPacketKey,
      [key]: next,
    },
  };
}

export function markNeedsRecruiterFollowUp(
  store: P246ReminderStore,
  candidateId: string,
  signatureRequestId: string,
  atIso = new Date().toISOString(),
): P246ReminderStore {
  const key = packetReminderKey(candidateId, signatureRequestId);
  const existing = store.byPacketKey[key] ?? emptyPacketState(candidateId, signatureRequestId);
  if (existing.needsRecruiterFollowUp) return store;
  return {
    ...store,
    byPacketKey: {
      ...store.byPacketKey,
      [key]: {
        ...existing,
        needsRecruiterFollowUp: true,
        needsRecruiterFollowUpAt: atIso,
      },
    },
  };
}
