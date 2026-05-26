import type { RecruitingIntelligenceSnapshot } from "@/lib/recruiting-automation/build-recruiting-intelligence";
import type { RecruiterSuggestedAction } from "@/lib/recruiting-decision-intelligence/types";

export type TopRecommendedAction = {
  id: string;
  title: string;
  reason: string;
  impactEstimate: string;
  urgency: "critical" | "high" | "medium" | "low";
  source: "decision" | "legacy";
  manualOnly: true;
  jobId?: string;
  city?: string;
  state?: string;
};

const URGENCY_RANK = { critical: 0, high: 1, medium: 2, low: 3 } as const;

function actionKey(action: { jobId?: string; title: string }): string {
  return `${action.jobId ?? "general"}:${action.title.trim().toLowerCase()}`;
}

function toTopAction(
  action: RecruiterSuggestedAction,
  source: TopRecommendedAction["source"],
): TopRecommendedAction {
  return {
    id: action.id,
    title: action.title,
    reason: action.reason,
    impactEstimate: action.impactEstimate,
    urgency: action.urgency,
    source,
    manualOnly: true,
    jobId: action.jobId,
    city: action.city,
    state: action.state,
  };
}

/** Merge decision + legacy recommendations — decision engine wins on duplicates. */
export function buildTopRecommendedActions(
  snapshot: RecruitingIntelligenceSnapshot,
  limit = 10,
): TopRecommendedAction[] {
  const decision = snapshot.decisionIntelligence?.recommendedNextActions ?? [];
  const seen = new Set(decision.map((row) => actionKey(row)));
  const merged: TopRecommendedAction[] = decision.map((row) => toTopAction(row, "decision"));

  for (const rec of snapshot.recommendations) {
    const key = actionKey({ jobId: rec.jobId, title: rec.recommendation });
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(
      toTopAction(
        {
          id: `legacy-${rec.id}`,
          type: "repost",
          title: rec.recommendation,
          reason: rec.reason,
          impactEstimate: rec.impactEstimate,
          urgency: rec.urgency,
          manualOnly: true,
          jobId: rec.jobId,
          city: rec.city,
          state: rec.state,
        },
        "legacy",
      ),
    );
  }

  return merged.sort((a, b) => URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency]).slice(0, limit);
}
