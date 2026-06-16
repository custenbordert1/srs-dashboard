import type { ExecutiveAlertStatus, ExecutiveAlertStatusOverlay } from "@/lib/alerts/executive-alert-status-types";

const STORAGE_KEY = "srs-dashboard:executive-alert-status:v1";

type LocalStatusStore = {
  overlays: ExecutiveAlertStatusOverlay[];
  updatedAt: string;
};

export function readLocalExecutiveAlertStatuses(userId: string): ExecutiveAlertStatusOverlay[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LocalStatusStore;
    return parsed.overlays.filter((row) => row.userId === userId);
  } catch {
    return [];
  }
}

export function writeLocalExecutiveAlertStatus(overlay: ExecutiveAlertStatusOverlay): void {
  if (typeof window === "undefined") return;
  const existing = readLocalExecutiveAlertStatuses(overlay.userId).filter(
    (row) => row.alertId !== overlay.alertId,
  );
  const next: LocalStatusStore = {
    overlays: [...existing, overlay],
    updatedAt: new Date().toISOString(),
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function mergeLocalAndServerStatuses(
  local: ExecutiveAlertStatusOverlay[],
  server: ExecutiveAlertStatusOverlay[],
): ExecutiveAlertStatusOverlay[] {
  const merged = new Map<string, ExecutiveAlertStatusOverlay>();
  for (const row of local) merged.set(row.alertId, row);
  for (const row of server) {
    const prior = merged.get(row.alertId);
    if (!prior || Date.parse(row.updatedAt) >= Date.parse(prior.updatedAt)) {
      merged.set(row.alertId, row);
    }
  }
  return [...merged.values()];
}
