import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AuthSession } from "@/lib/auth/types";
import type {
  ExecutiveAlertStatus,
  ExecutiveAlertStatusOverlay,
} from "@/lib/alerts/executive-alert-status-types";

const STORE_DIR = path.join(process.cwd(), ".data");
const OVERLAYS_PATH = path.join(STORE_DIR, "executive-alert-status.json");

type StatusStoreFile = {
  overlays: ExecutiveAlertStatusOverlay[];
  updatedAt: string;
};

async function readStore(): Promise<StatusStoreFile> {
  try {
    const raw = await readFile(OVERLAYS_PATH, "utf8");
    const parsed = JSON.parse(raw) as StatusStoreFile;
    return {
      overlays: Array.isArray(parsed.overlays) ? parsed.overlays : [],
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
    };
  } catch {
    return { overlays: [], updatedAt: new Date().toISOString() };
  }
}

async function writeStore(file: StatusStoreFile): Promise<void> {
  await mkdir(STORE_DIR, { recursive: true });
  await writeFile(OVERLAYS_PATH, JSON.stringify(file, null, 2), "utf8");
}

export async function listExecutiveAlertStatusOverlays(
  userId?: string,
): Promise<ExecutiveAlertStatusOverlay[]> {
  const store = await readStore();
  if (!userId) return store.overlays;
  return store.overlays.filter((row) => row.userId === userId);
}

export async function upsertExecutiveAlertStatusOverlay(
  session: AuthSession,
  alertId: string,
  status: ExecutiveAlertStatus,
  options?: { snoozedUntil?: string | null; note?: string },
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
  await writeStore({ overlays: nextOverlays, updatedAt: now });
  return overlay;
}
