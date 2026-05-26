import type { RecruiterSuggestedAction } from "@/lib/recruiting-decision-intelligence/types";

const PRIORITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 } as const;

export function dedupeRecruiterSuggestedActions(
  actions: RecruiterSuggestedAction[],
): RecruiterSuggestedAction[] {
  const byKey = new Map<string, RecruiterSuggestedAction>();
  for (const action of actions) {
    const key = `${action.type}:${action.jobId ?? action.city ?? action.id}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, action);
      continue;
    }
    if (PRIORITY_RANK[action.urgency] < PRIORITY_RANK[existing.urgency]) {
      byKey.set(key, action);
    }
  }
  return [...byKey.values()].sort(
    (a, b) => PRIORITY_RANK[a.urgency] - PRIORITY_RANK[b.urgency],
  );
}
