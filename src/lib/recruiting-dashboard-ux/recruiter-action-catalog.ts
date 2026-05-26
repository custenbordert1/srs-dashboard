import type { RecruitingIntelligenceSnapshot } from "@/lib/recruiting-automation/build-recruiting-intelligence";
import type { RecruiterSuggestedActionType } from "@/lib/recruiting-decision-intelligence/types";
import type { DmAlertPriority } from "@/lib/dm-dashboard/dm-alert-priority";
import type { RecruiterEscalationQueueItem } from "@/lib/operational-escalation/operational-escalation-types";
import { urgencyScoreFor } from "@/lib/recruiting-dashboard-ux/severity-styles";

export type ActionLane = "immediate" | "strategic";

export type RecruiterActionItem = {
  id: string;
  lane: ActionLane;
  title: string;
  reason: string;
  expectedOutcome: string;
  severity: DmAlertPriority;
  urgencyScore: number;
  staffingImpact: number;
  agingDays: number | null;
  groupKey: string;
  jobId?: string;
  city?: string;
  state?: string;
  actionType: RecruiterSuggestedActionType | "legacy-repost" | "legacy-intervention";
  manualOnly: true;
};

const IMMEDIATE_TYPES = new Set<RecruiterSuggestedActionType | string>([
  "escalate-priority",
  "repost",
  "close-stale-duplicate",
  "legacy-repost",
  "legacy-intervention",
]);

const STRATEGIC_TYPES = new Set<RecruiterSuggestedActionType | string>([
  "expand-radius",
  "clone-metro",
  "increase-pay",
  "merge-cities",
  "route-coverage",
]);

function laneForType(type: string): ActionLane {
  if (IMMEDIATE_TYPES.has(type)) return "immediate";
  if (STRATEGIC_TYPES.has(type)) return "strategic";
  return "strategic";
}

function groupKeyFor(item: Pick<RecruiterActionItem, "actionType" | "jobId" | "city" | "state">): string {
  return `${item.actionType}:${item.jobId ?? `${item.city}-${item.state}`}`;
}

function shortenTitle(title: string): string {
  return title
    .replace(/recommendation/gi, "")
    .replace(/\(manual[^)]*\)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function coverageToAction(
  row: RecruitingIntelligenceSnapshot["decisionIntelligence"]["coverageRecommendations"][number],
  type: RecruiterSuggestedActionType,
  title: string,
  reason: string,
): RecruiterActionItem {
  const severity: DmAlertPriority =
    row.staffingRiskScore >= 130 ? "critical" : row.staffingRiskScore >= 90 ? "high" : "medium";
  const staffingImpact = row.staffingRiskScore;
  const agingDays = row.jobAgeDays;
  return {
    id: `coverage-${type}-${row.jobId}`,
    lane: laneForType(type),
    title: shortenTitle(title),
    reason,
    expectedOutcome: "Manual recruiter review — no automated changes.",
    severity,
    urgencyScore: urgencyScoreFor(severity, staffingImpact, agingDays ?? 0),
    staffingImpact,
    agingDays,
    groupKey: groupKeyFor({ actionType: type, jobId: row.jobId, city: row.city, state: row.state }),
    jobId: row.jobId,
    city: row.city,
    state: row.state,
    actionType: type,
    manualOnly: true,
  };
}

function fromSuggested(
  action: RecruitingIntelligenceSnapshot["decisionIntelligence"]["suggestedActions"][number],
  agingDays: number | null,
  staffingImpact: number,
): RecruiterActionItem {
  const lane = laneForType(action.type);
  const severity = action.urgency;
  return {
    id: action.id,
    lane,
    title: shortenTitle(action.title),
    reason: action.reason,
    expectedOutcome: action.impactEstimate,
    severity,
    urgencyScore: urgencyScoreFor(severity, staffingImpact, agingDays ?? 0),
    staffingImpact,
    agingDays,
    groupKey: groupKeyFor({
      actionType: action.type,
      jobId: action.jobId,
      city: action.city,
      state: action.state,
    }),
    jobId: action.jobId,
    city: action.city,
    state: action.state,
    actionType: action.type,
    manualOnly: true,
  };
}

export function buildRecruiterActionCatalog(
  snapshot: RecruitingIntelligenceSnapshot,
  escalations: RecruiterEscalationQueueItem[] = [],
): RecruiterActionItem[] {
  const decision = snapshot.decisionIntelligence;
  const coverageByJob = new Map(
    (decision?.coverageRecommendations ?? []).map((row) => [row.jobId, row]),
  );
  const items: RecruiterActionItem[] = [];

  for (const action of decision?.suggestedActions ?? []) {
    const coverage = action.jobId ? coverageByJob.get(action.jobId) : undefined;
    items.push(
      fromSuggested(action, coverage?.jobAgeDays ?? null, coverage?.staffingRiskScore ?? 0),
    );
  }

  for (const rec of snapshot.recommendations) {
    const coverage = rec.jobId ? coverageByJob.get(rec.jobId) : undefined;
    const type = rec.urgency === "critical" || rec.urgency === "high" ? "legacy-repost" : "legacy-intervention";
    items.push({
      id: `legacy-${rec.id}`,
      lane: "immediate",
      title: shortenTitle(rec.recommendation),
      reason: rec.reason,
      expectedOutcome: rec.impactEstimate,
      severity: rec.urgency,
      urgencyScore: urgencyScoreFor(rec.urgency, coverage?.staffingRiskScore ?? 0, coverage?.jobAgeDays ?? 0),
      staffingImpact: coverage?.staffingRiskScore ?? 0,
      agingDays: coverage?.jobAgeDays ?? null,
      groupKey: groupKeyFor({ actionType: type, jobId: rec.jobId, city: rec.city, state: rec.state }),
      jobId: rec.jobId,
      city: rec.city,
      state: rec.state,
      actionType: type,
      manualOnly: true,
    });
  }

  for (const row of decision?.coverageRecommendations ?? []) {
    if (row.jobAgeDays !== null && row.jobAgeDays >= 28) {
      items.push(
        coverageToAction(
          row,
          "escalate-priority",
          "Aging job — escalate recruiting priority",
          `Job aging ${row.jobAgeDays}d in ${row.city}, ${row.state}.`,
        ),
      );
    }
    if ((row.jobAgeDays ?? 0) >= 7 && row.nearbyActiveReps25Mi === 0) {
      items.push(
        coverageToAction(
          row,
          "route-coverage",
          "No reps within 25mi — route coverage",
          "No active reps within 25 miles.",
        ),
      );
    }
    if (row.recommendedExpansionCities.length > 1) {
      const cities = row.recommendedExpansionCities.slice(1, 3).join(" + ");
      items.push(
        coverageToAction(
          row,
          "expand-radius",
          `Expand ${row.city} → ${cities}`,
          row.summaryBullets[0] ?? `Expand from ${row.city} into adjacent metros.`,
        ),
      );
    }
    if (row.jobAgeDays !== null && row.jobAgeDays >= 21) {
      items.push(
        coverageToAction(
          row,
          "increase-pay",
          "Review pay range",
          `Aging ${row.jobAgeDays}d with limited hiring momentum.`,
        ),
      );
    }
  }

  const seen = new Set<string>();
  const deduped: RecruiterActionItem[] = [];
  for (const item of items.sort((a, b) => b.urgencyScore - a.urgencyScore)) {
    const key = `${item.groupKey}:${item.title.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  return deduped;
}

export function groupRecruiterActions(items: RecruiterActionItem[]): Array<{
  groupKey: string;
  label: string;
  items: RecruiterActionItem[];
  topSeverity: DmAlertPriority;
}> {
  const groups = new Map<string, RecruiterActionItem[]>();
  for (const item of items) {
    const list = groups.get(item.groupKey) ?? [];
    list.push(item);
    groups.set(item.groupKey, list);
  }

  const rank: Record<DmAlertPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };

  return [...groups.entries()]
    .map(([groupKey, groupItems]) => {
      const sorted = [...groupItems].sort((a, b) => b.urgencyScore - a.urgencyScore);
      const top = sorted[0]!;
      const label = top.title.split("—")[0]?.trim() ?? top.actionType.replace(/-/g, " ");
      return {
        groupKey,
        label,
        items: sorted,
        topSeverity: sorted.reduce<DmAlertPriority>(
          (worst, row) => (rank[row.severity] < rank[worst] ? row.severity : worst),
          top.severity,
        ),
      };
    })
    .sort((a, b) => rank[b.topSeverity] - rank[a.topSeverity]);
}

export function filterActionsByLane(items: RecruiterActionItem[], lane: ActionLane): RecruiterActionItem[] {
  return items.filter((item) => item.lane === lane);
}
