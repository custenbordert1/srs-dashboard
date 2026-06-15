export type ActionStatusPreference = "open" | "in-progress" | "resolved";

const STORAGE_KEY = "srs-dashboard:territory-action-status:v1";

export function readActionStatusMap(): Record<string, ActionStatusPreference> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const result: Record<string, ActionStatusPreference> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (value === "open" || value === "in-progress" || value === "resolved") {
        result[key] = value;
      }
    }
    return result;
  } catch {
    return {};
  }
}

export function persistActionStatus(actionId: string, status: ActionStatusPreference): void {
  if (typeof window === "undefined") return;
  const current = readActionStatusMap();
  current[actionId] = status;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
}
