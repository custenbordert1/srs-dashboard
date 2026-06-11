import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { AuthSession } from "@/lib/auth/types";
import type {
  CreateRecruiterEscalationInput,
  RecruiterEscalationActivity,
  RecruiterEscalationQueueItem,
  RecruiterEscalationQueueStatus,
} from "@/lib/operational-escalation/operational-escalation-types";

const STORE_DIR = path.join(process.cwd(), ".data");
const ESCALATIONS_PATH = path.join(STORE_DIR, "operational-escalations.json");
const AUDIT_PATH = path.join(STORE_DIR, "operational-escalation-audit.jsonl");

type EscalationStoreFile = {
  items: RecruiterEscalationQueueItem[];
  updatedAt: string;
};

async function readStore(): Promise<EscalationStoreFile> {
  try {
    const raw = await readFile(ESCALATIONS_PATH, "utf8");
    const parsed = JSON.parse(raw) as EscalationStoreFile;
    return {
      items: Array.isArray(parsed.items) ? parsed.items : [],
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
    };
  } catch {
    return { items: [], updatedAt: new Date().toISOString() };
  }
}

async function writeStore(file: EscalationStoreFile): Promise<void> {
  await mkdir(STORE_DIR, { recursive: true });
  await writeFile(ESCALATIONS_PATH, JSON.stringify(file, null, 2), "utf8");
}

async function appendAudit(entry: Record<string, unknown>): Promise<void> {
  await mkdir(STORE_DIR, { recursive: true });
  await appendFile(AUDIT_PATH, `${JSON.stringify(entry)}\n`, "utf8");
}

function activityEntry(
  session: AuthSession,
  action: RecruiterEscalationActivity["action"],
  patch: Partial<RecruiterEscalationActivity>,
): RecruiterEscalationActivity {
  return {
    id: randomUUID(),
    at: new Date().toISOString(),
    actorUserId: session.userId,
    actorUserName: session.name,
    actorRole: session.role,
    action,
    ...patch,
  };
}

export async function listRecruiterEscalations(): Promise<RecruiterEscalationQueueItem[]> {
  const store = await readStore();
  return store.items.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export async function listDmEscalationsForUser(dmUserId: string): Promise<RecruiterEscalationQueueItem[]> {
  const items = await listRecruiterEscalations();
  return items.filter((item) => item.dmUserId === dmUserId);
}

export async function getRecruiterEscalation(id: string): Promise<RecruiterEscalationQueueItem | null> {
  return (await readStore()).items.find((item) => item.id === id) ?? null;
}

export async function findEscalationBySourceLogId(
  sourceEscalationLogId: string,
): Promise<RecruiterEscalationQueueItem | null> {
  return (
    (await readStore()).items.find((item) => item.sourceEscalationLogId === sourceEscalationLogId) ??
    null
  );
}

export async function createRecruiterEscalation(
  input: CreateRecruiterEscalationInput,
  session: AuthSession,
): Promise<RecruiterEscalationQueueItem> {
  if (input.sourceEscalationLogId) {
    const existing = await findEscalationBySourceLogId(input.sourceEscalationLogId);
    if (existing) return existing;
  }

  const now = new Date().toISOString();
  const createdActivity = activityEntry(session, "created", { toStatus: "new" });
  const item: RecruiterEscalationQueueItem = {
    id: randomUUID(),
    escalationType: input.escalationType,
    dmName: input.dmName,
    dmUserId: input.dmUserId,
    territory: input.territory,
    territoryStates: input.territoryStates,
    state: input.state,
    city: input.city,
    relatedJobId: input.relatedJobId,
    jobTitle: input.jobTitle,
    priority: input.priority ?? null,
    priorityScore: input.priorityScore ?? null,
    recommendedAction: input.recommendedAction?.trim() || "Review staffing risk and respond to DM.",
    alertReason: input.alertReason?.trim() || input.escalationType,
    jobAgeDays: input.jobAgeDays ?? null,
    createdAt: now,
    updatedAt: now,
    status: "new",
    internalNotes: [],
    activity: [createdActivity],
    sourceEscalationLogId: input.sourceEscalationLogId,
  };

  const store = await readStore();
  store.items.unshift(item);
  store.updatedAt = now;
  await writeStore(store);
  await appendAudit({
    type: "escalation_created",
    escalationId: item.id,
    dmUserId: item.dmUserId,
    relatedJobId: item.relatedJobId,
    at: now,
    actorUserId: session.userId,
  });

  return item;
}

const TERMINAL_STATUSES = new Set<RecruiterEscalationQueueStatus>(["completed", "dismissed"]);

export function canTransitionEscalationStatus(
  from: RecruiterEscalationQueueStatus,
  to: RecruiterEscalationQueueStatus,
): boolean {
  if (from === to) return true;
  if (TERMINAL_STATUSES.has(from)) return false;
  if (to === "new") return false;
  if (from === "new" && (to === "in_review" || to === "completed" || to === "dismissed")) return true;
  if (from === "in_review" && (to === "completed" || to === "dismissed")) return true;
  return false;
}

export async function updateRecruiterEscalationStatus(
  id: string,
  status: RecruiterEscalationQueueStatus,
  session: AuthSession,
): Promise<RecruiterEscalationQueueItem | null> {
  const store = await readStore();
  const index = store.items.findIndex((item) => item.id === id);
  if (index < 0) return null;

  const existing = store.items[index]!;
  if (!canTransitionEscalationStatus(existing.status, status)) {
    return null;
  }

  const now = new Date().toISOString();
  const statusActivity = activityEntry(session, "status_change", {
    fromStatus: existing.status,
    toStatus: status,
  });
  const updated: RecruiterEscalationQueueItem = {
    ...existing,
    status,
    updatedAt: now,
    activity: [...existing.activity, statusActivity],
  };
  store.items[index] = updated;
  store.updatedAt = now;
  await writeStore(store);
  await appendAudit({
    type: "escalation_status",
    escalationId: id,
    fromStatus: existing.status,
    toStatus: status,
    at: now,
    actorUserId: session.userId,
  });
  return updated;
}

export async function appendRecruiterEscalationNote(
  id: string,
  note: string,
  session: AuthSession,
): Promise<RecruiterEscalationQueueItem | null> {
  const trimmed = note.trim();
  if (!trimmed) return null;

  const store = await readStore();
  const index = store.items.findIndex((item) => item.id === id);
  if (index < 0) return null;

  const existing = store.items[index]!;
  if (TERMINAL_STATUSES.has(existing.status)) return null;

  const now = new Date().toISOString();
  const noteActivity = activityEntry(session, "note", { note: trimmed });
  const updated: RecruiterEscalationQueueItem = {
    ...existing,
    internalNotes: [...existing.internalNotes, trimmed],
    updatedAt: now,
    activity: [...existing.activity, noteActivity],
  };
  store.items[index] = updated;
  store.updatedAt = now;
  await writeStore(store);
  await appendAudit({
    type: "escalation_note",
    escalationId: id,
    at: now,
    actorUserId: session.userId,
  });
  return updated;
}
