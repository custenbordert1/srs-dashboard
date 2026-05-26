import type { RecruiterSuggestedAction } from "@/lib/recruiting-decision-intelligence/types";

/** Decision intelligence is recommendations-only — no side effects. */
export const DECISION_INTELLIGENCE_ALLOWS_AUTOMATION = false;

const FORBIDDEN_ACTION_KEYS = [
  "autoPublish",
  "autoRepost",
  "autoPayChange",
  "autoClose",
  "autoAssign",
  "execute",
  "dispatch",
] as const;

export function assertRecommendationsOnly(actions: RecruiterSuggestedAction[]): boolean {
  if (DECISION_INTELLIGENCE_ALLOWS_AUTOMATION) return false;
  for (const action of actions) {
    if (action.manualOnly !== true) return false;
    const serialized = JSON.stringify(action).toLowerCase();
    if (FORBIDDEN_ACTION_KEYS.some((key) => serialized.includes(key.toLowerCase()))) {
      return false;
    }
  }
  return true;
}
