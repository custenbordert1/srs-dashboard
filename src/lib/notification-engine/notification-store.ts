import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { AuthSession } from "@/lib/auth/types";
import type {
  NotificationAuditEntry,
  NotificationLifecycleStatus,
  NotificationStoreOverlay,
} from "@/lib/notification-engine/types";

const STORE_DIR = path.join(process.cwd(), ".data");
const OVERLAYS_PATH = path.join(STORE_DIR, "notification-overlays.json");
const AUDIT_PATH = path.join(STORE_DIR, "notification-audit.jsonl");

type OverlayStoreFile = {
  overlays: NotificationStoreOverlay[];
  updatedAt: string;
};

async function readStore(): Promise<OverlayStoreFile> {
  try {
    const raw = await readFile(OVERLAYS_PATH, "utf8");
    const parsed = JSON.parse(raw) as OverlayStoreFile;
    return {
      overlays: Array.isArray(parsed.overlays) ? parsed.overlays : [],
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
    };
  } catch {
    return { overlays: [], updatedAt: new Date().toISOString() };
  }
}

async function writeStore(file: OverlayStoreFile): Promise<void> {
  await mkdir(STORE_DIR, { recursive: true });
  await writeFile(OVERLAYS_PATH, JSON.stringify(file, null, 2), "utf8");
}

async function appendAudit(entry: Record<string, unknown>): Promise<void> {
  await mkdir(STORE_DIR, { recursive: true });
  await appendFile(AUDIT_PATH, `${JSON.stringify(entry)}\n`, "utf8");
}

function auditEntry(
  session: AuthSession,
  action: NotificationAuditEntry["action"],
  patch: Partial<NotificationAuditEntry> = {},
): NotificationAuditEntry {
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

export async function listNotificationOverlays(userId?: string): Promise<NotificationStoreOverlay[]> {
  const store = await readStore();
  if (!userId) return store.overlays;
  return store.overlays.filter((row) => row.userId === userId);
}

export async function updateNotificationOverlay(
  session: AuthSession,
  sourceKey: string,
  status: NotificationLifecycleStatus,
  note?: string,
): Promise<NotificationStoreOverlay> {
  const now = new Date().toISOString();
  const store = await readStore();
  const existing = store.overlays.find(
    (row) => row.userId === session.userId && row.sourceKey === sourceKey,
  );

  const action =
    status === "read"
      ? "read"
      : status === "dismissed"
        ? "dismissed"
        : status === "resolved"
          ? "resolved"
          : "generated";

  const entry = auditEntry(session, action, { note });

  const overlay: NotificationStoreOverlay = {
    sourceKey,
    userId: session.userId,
    status,
    readAt: status === "read" || status === "resolved" ? now : existing?.readAt ?? null,
    dismissedAt: status === "dismissed" ? now : existing?.dismissedAt ?? null,
    resolvedAt: status === "resolved" ? now : existing?.resolvedAt ?? null,
    auditHistory: [...(existing?.auditHistory ?? []), entry],
    updatedAt: now,
  };

  const nextOverlays = store.overlays.filter(
    (row) => !(row.userId === session.userId && row.sourceKey === sourceKey),
  );
  nextOverlays.push(overlay);

  await writeStore({ overlays: nextOverlays, updatedAt: now });
  await appendAudit({
    at: now,
    userId: session.userId,
    sourceKey,
    status,
    action,
    note: note ?? null,
  });

  return overlay;
}

export async function markNotificationsRead(
  session: AuthSession,
  sourceKeys: string[],
): Promise<number> {
  let updated = 0;
  for (const sourceKey of sourceKeys) {
    await updateNotificationOverlay(session, sourceKey, "read");
    updated += 1;
  }
  return updated;
}
