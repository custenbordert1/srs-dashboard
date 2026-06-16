import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AuthSession } from "@/lib/auth/types";
import type {
  ExecutiveAlertActionLogEntry,
  ExecutiveAlertFollowUp,
  ExecutiveAlertStatus,
  ExecutiveAlertStatusOverlay,
  FollowUpOwnerKind,
  FollowUpPriority,
} from "@/lib/alerts/executive-alert-status-types";

const storeDir = () => path.join(process.cwd(), ".data");
const overlaysPath = () => path.join(storeDir(), "executive-alert-status.json");

type StatusStoreFile = {
  overlays: ExecutiveAlertStatusOverlay[];
  actionLogs: ExecutiveAlertActionLogEntry[];
  followUps: ExecutiveAlertFollowUp[];
  updatedAt: string;
};

async function readStore(): Promise<StatusStoreFile> {
  try {
    const raw = await readFile(overlaysPath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<StatusStoreFile>;
    return {
      overlays: Array.isArray(parsed.overlays) ? parsed.overlays : [],
      actionLogs: Array.isArray(parsed.actionLogs) ? parsed.actionLogs : [],
      followUps: Array.isArray(parsed.followUps) ? parsed.followUps : [],
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
    };
  } catch {
    return { overlays: [], actionLogs: [], followUps: [], updatedAt: new Date().toISOString() };
  }
}

async function writeStore(file: StatusStoreFile): Promise<void> {
  await mkdir(storeDir(), { recursive: true });
  await writeFile(overlaysPath(), JSON.stringify(file, null, 2), "utf8");
}

function reviewerFromSession(session: AuthSession): { reviewedBy: string; reviewedByUserId: string } {
  return {
    reviewedBy: session.name || session.email,
    reviewedByUserId: session.userId,
  };
}

export async function listExecutiveAlertStatusOverlays(
  userId?: string,
): Promise<ExecutiveAlertStatusOverlay[]> {
  const store = await readStore();
  if (!userId) return store.overlays;
  return store.overlays.filter((row) => row.userId === userId);
}

export async function listExecutiveAlertActionLogs(
  alertId?: string,
): Promise<ExecutiveAlertActionLogEntry[]> {
  const store = await readStore();
  const rows = [...store.actionLogs].sort(
    (a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp),
  );
  if (!alertId) return rows;
  return rows.filter((row) => row.alertId === alertId);
}

export async function listExecutiveAlertFollowUps(
  alertId?: string,
): Promise<ExecutiveAlertFollowUp[]> {
  const store = await readStore();
  const rows = store.followUps.filter((row) => !row.completedAt);
  if (!alertId) return rows;
  return rows.filter((row) => row.alertId === alertId);
}

export async function appendExecutiveAlertActionLog(
  session: AuthSession,
  input: Omit<ExecutiveAlertActionLogEntry, "id" | "reviewedBy" | "reviewedByUserId" | "timestamp"> & {
    timestamp?: string;
  },
): Promise<ExecutiveAlertActionLogEntry> {
  const now = input.timestamp ?? new Date().toISOString();
  const store = await readStore();
  const entry: ExecutiveAlertActionLogEntry = {
    id: randomUUID(),
    timestamp: now,
    ...reviewerFromSession(session),
    ...input,
  };
  store.actionLogs.push(entry);
  await writeStore({ ...store, updatedAt: now });
  return entry;
}

export async function upsertExecutiveAlertStatusOverlay(
  session: AuthSession,
  alertId: string,
  status: ExecutiveAlertStatus,
  options?: {
    snoozedUntil?: string | null;
    note?: string;
    logStatusChange?: boolean;
    previousStatus?: ExecutiveAlertStatus;
  },
): Promise<ExecutiveAlertStatusOverlay> {
  const now = new Date().toISOString();
  const store = await readStore();
  const existing = store.overlays.find(
    (row) => row.userId === session.userId && row.alertId === alertId,
  );

  const overlay: ExecutiveAlertStatusOverlay = {
    alertId,
    userId: session.userId,
    status,
    updatedAt: now,
    snoozedUntil: options?.snoozedUntil ?? existing?.snoozedUntil ?? null,
    note: options?.note ?? existing?.note,
  };

  const nextOverlays = store.overlays.filter(
    (row) => !(row.userId === session.userId && row.alertId === alertId),
  );
  nextOverlays.push(overlay);

  const shouldLog =
    options?.logStatusChange !== false &&
    (options?.previousStatus == null || options.previousStatus !== status);
  const actionLogs = [...store.actionLogs];
  if (shouldLog) {
    actionLogs.push({
      id: randomUUID(),
      alertId,
      kind: status === "in-review" && options?.previousStatus === "new" ? "reviewed" : "status-change",
      timestamp: now,
      ...reviewerFromSession(session),
      status,
      previousStatus: options?.previousStatus,
      note: options?.note,
    });
  }

  await writeStore({
    overlays: nextOverlays,
    actionLogs,
    followUps: store.followUps,
    updatedAt: now,
  });
  return overlay;
}

export async function saveExecutiveAlertNote(
  session: AuthSession,
  alertId: string,
  note: string,
): Promise<{ overlay: ExecutiveAlertStatusOverlay; logEntry: ExecutiveAlertActionLogEntry }> {
  const now = new Date().toISOString();
  const store = await readStore();
  const existing = store.overlays.find(
    (row) => row.userId === session.userId && row.alertId === alertId,
  );
  const status = existing?.status ?? "in-review";

  const overlay: ExecutiveAlertStatusOverlay = {
    alertId,
    userId: session.userId,
    status,
    updatedAt: now,
    snoozedUntil: existing?.snoozedUntil ?? null,
    note: note.trim(),
  };

  const nextOverlays = store.overlays.filter(
    (row) => !(row.userId === session.userId && row.alertId === alertId),
  );
  nextOverlays.push(overlay);

  const logEntry: ExecutiveAlertActionLogEntry = {
    id: randomUUID(),
    alertId,
    kind: "note",
    timestamp: now,
    ...reviewerFromSession(session),
    note: note.trim(),
  };

  await writeStore({
    overlays: nextOverlays,
    actionLogs: [...store.actionLogs, logEntry],
    followUps: store.followUps,
    updatedAt: now,
  });

  return { overlay, logEntry };
}

export async function upsertExecutiveAlertFollowUp(
  session: AuthSession,
  input: {
    alertId: string;
    ownerKind: FollowUpOwnerKind;
    ownerName: string;
    dueDate: string;
    priority: FollowUpPriority;
    notes?: string;
  },
): Promise<{ followUp: ExecutiveAlertFollowUp; logEntry: ExecutiveAlertActionLogEntry }> {
  const now = new Date().toISOString();
  const store = await readStore();
  const existing = store.followUps.find(
    (row) => row.alertId === input.alertId && !row.completedAt,
  );

  const followUp: ExecutiveAlertFollowUp = {
    id: existing?.id ?? randomUUID(),
    alertId: input.alertId,
    ownerKind: input.ownerKind,
    ownerName: input.ownerName.trim(),
    dueDate: input.dueDate,
    priority: input.priority,
    createdAt: existing?.createdAt ?? now,
    createdByUserId: session.userId,
    createdByName: session.name || session.email,
    notes: input.notes?.trim() || existing?.notes,
    completedAt: null,
  };

  const nextFollowUps = store.followUps.filter(
    (row) => !(row.alertId === input.alertId && !row.completedAt),
  );
  nextFollowUps.push(followUp);

  const logEntry: ExecutiveAlertActionLogEntry = {
    id: randomUUID(),
    alertId: input.alertId,
    kind: "follow-up-assigned",
    timestamp: now,
    ...reviewerFromSession(session),
    note: `Assigned to ${input.ownerKind} ${input.ownerName} · due ${input.dueDate} · ${input.priority}`,
    followUpId: followUp.id,
  };

  await writeStore({
    overlays: store.overlays,
    actionLogs: [...store.actionLogs, logEntry],
    followUps: nextFollowUps,
    updatedAt: now,
  });

  return { followUp, logEntry };
}
