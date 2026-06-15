import type { RecruiterHomeMode } from "@/lib/guided-recruiting-workflow/types";

const STORAGE_KEY = "srs-dashboard:guided-recruiting-workflow:v1";

export type GuidedWorkflowPreferences = {
  homeMode: RecruiterHomeMode;
};

const DEFAULT_PREFERENCES: GuidedWorkflowPreferences = {
  homeMode: "dashboard",
};

function isHomeMode(value: unknown): value is RecruiterHomeMode {
  return value === "dashboard" || value === "work";
}

export function readGuidedWorkflowPreferences(): GuidedWorkflowPreferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<GuidedWorkflowPreferences>;
    return {
      homeMode: isHomeMode(parsed.homeMode) ? parsed.homeMode : DEFAULT_PREFERENCES.homeMode,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function writeGuidedWorkflowPreferences(next: GuidedWorkflowPreferences): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}
