import type {
  P193DashboardCard,
  P193LifecycleRecord,
} from "@/lib/p193-simplified-autonomous-lifecycle/types";
import { P193_DASHBOARD_CARDS } from "@/lib/p193-simplified-autonomous-lifecycle/types";
import { mapStateToDashboardCard } from "@/lib/p193-simplified-autonomous-lifecycle/migrationAdapter";

export type P193DashboardCardStats = {
  card: P193DashboardCard;
  count: number;
  oldestEnteredAt: string | null;
  ageHoursMax: number | null;
  nextAction: string;
  sampleCandidateIds: string[];
};

const NEXT_ACTION: Record<P193DashboardCard, string> = {
  "New Applicants": "Start AI review",
  "AI Reviewing": "Await AI qualification",
  Qualified: "Enter paperwork runner (bridge)",
  "Paperwork Pending": "Monitor Dropbox envelope",
  Viewed: "Await signature / send reminder if due",
  Signed: "Advance to Ready For Assignment",
  "Ready For Assignment": "Human assigns project (no MEL auto)",
  "Needs Human Review": "Operator exception review",
  Expired: "Re-qualify or close",
};

export function buildP193Dashboard(records: P193LifecycleRecord[], nowMs = Date.now()): {
  generatedAt: string;
  cards: P193DashboardCardStats[];
  total: number;
} {
  const buckets = new Map<P193DashboardCard, P193LifecycleRecord[]>();
  for (const card of P193_DASHBOARD_CARDS) buckets.set(card, []);

  for (const record of records) {
    const card = mapStateToDashboardCard(record.state, record.metadata.paperworkStatus) as P193DashboardCard;
    const list = buckets.get(card) ?? [];
    list.push(record);
    buckets.set(card, list);
  }

  const cards: P193DashboardCardStats[] = P193_DASHBOARD_CARDS.map((card) => {
    const list = buckets.get(card) ?? [];
    const oldest = list
      .map((r) => r.enteredAt)
      .filter(Boolean)
      .sort()[0] ?? null;
    const ageHoursMax = oldest
      ? Math.round(((nowMs - Date.parse(oldest)) / 36e5) * 10) / 10
      : null;
    return {
      card,
      count: list.length,
      oldestEnteredAt: oldest,
      ageHoursMax: Number.isFinite(ageHoursMax as number) ? ageHoursMax : null,
      nextAction: NEXT_ACTION[card],
      sampleCandidateIds: list.slice(0, 5).map((r) => r.candidateId.slice(0, 6)),
    };
  });

  return {
    generatedAt: new Date(nowMs).toISOString(),
    cards,
    total: records.length,
  };
}

export function buildP193CandidateTimeline(record: P193LifecycleRecord): {
  timeline: Array<{ at: string; label: string; detail: string }>;
  metadata: P193LifecycleRecord["metadata"];
} {
  const timeline = record.timeline.map((e) => ({
    at: e.at,
    label: e.state === "AI Reviewing" ? "AI Reviewed" : e.state,
    detail: e.detail,
  }));
  return { timeline, metadata: record.metadata };
}
