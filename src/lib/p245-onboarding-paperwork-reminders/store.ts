import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { recruitingDataDir, safeRecruitingMkdir } from "@/lib/recruiting-data-dir";
import {
  P245_STORE_FILENAME,
  type P245ReminderHistoryEntry,
  type P245ReminderStore,
} from "@/lib/p245-onboarding-paperwork-reminders/types";

function storePath(): string {
  const override = process.env.SRS_CANDIDATE_WORKFLOW_DATA_DIR?.trim();
  const dir = override ? path.resolve(override) : recruitingDataDir();
  return path.join(dir, P245_STORE_FILENAME);
}

export function emptyP245ReminderStore(): P245ReminderStore {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    byCandidateId: {},
  };
}

export async function loadP245ReminderStore(): Promise<P245ReminderStore> {
  try {
    const raw = await readFile(storePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<P245ReminderStore>;
    if (parsed.version !== 1 || !parsed.byCandidateId || typeof parsed.byCandidateId !== "object") {
      return emptyP245ReminderStore();
    }
    return {
      version: 1,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
      byCandidateId: parsed.byCandidateId,
    };
  } catch {
    return emptyP245ReminderStore();
  }
}

export async function saveP245ReminderStore(store: P245ReminderStore): Promise<void> {
  const dir = path.dirname(storePath());
  await safeRecruitingMkdir(dir);
  const payload: P245ReminderStore = {
    ...store,
    updatedAt: new Date().toISOString(),
  };
  await writeFile(storePath(), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

export function getCandidateReminderState(
  store: P245ReminderStore,
  candidateId: string,
): { reminderCount: number; lastReminderAt: string | null } {
  const row = store.byCandidateId[candidateId];
  return {
    reminderCount: row?.reminderCount ?? 0,
    lastReminderAt: row?.lastReminderAt ?? null,
  };
}

export function recordSuccessfulReminder(
  store: P245ReminderStore,
  entry: P245ReminderHistoryEntry,
): P245ReminderStore {
  const existing = store.byCandidateId[entry.candidateId] ?? {
    reminderCount: 0,
    lastReminderAt: null,
    history: [],
  };
  return {
    ...store,
    byCandidateId: {
      ...store.byCandidateId,
      [entry.candidateId]: {
        reminderCount: existing.reminderCount + 1,
        lastReminderAt: entry.sentAt,
        history: [...existing.history, entry].slice(-50),
      },
    },
  };
}

export function wasRemindedWithinCooldown(
  lastReminderAt: string | null,
  cooldownMs: number,
  nowMs = Date.now(),
): boolean {
  if (!lastReminderAt) return false;
  const ms = Date.parse(lastReminderAt);
  if (!Number.isFinite(ms)) return false;
  return nowMs - ms < cooldownMs;
}
