import type { P1866DateRangeKey } from "@/lib/p186-6-executive-recruiting-intelligence/types";

export type ResolvedDateRange = {
  key: P1866DateRangeKey;
  startMs: number;
  endMs: number;
  label: string;
};

export function resolveDateRange(
  key: P1866DateRangeKey,
  nowMs = Date.now(),
  custom?: { startMs: number; endMs: number },
): ResolvedDateRange {
  const end = nowMs;
  const startOfDay = (ms: number) => {
    const d = new Date(ms);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };

  switch (key) {
    case "today":
      return { key, startMs: startOfDay(end), endMs: end, label: "today" };
    case "last_7_days":
      return { key, startMs: end - 7 * 86400000, endMs: end, label: "last_7_days" };
    case "last_30_days":
      return { key, startMs: end - 30 * 86400000, endMs: end, label: "last_30_days" };
    case "month_to_date": {
      const d = new Date(end);
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
      return { key, startMs: d.getTime(), endMs: end, label: "month_to_date" };
    }
    case "quarter_to_date": {
      const d = new Date(end);
      const q = Math.floor(d.getMonth() / 3) * 3;
      d.setMonth(q, 1);
      d.setHours(0, 0, 0, 0);
      return { key, startMs: d.getTime(), endMs: end, label: "quarter_to_date" };
    }
    case "custom":
      return {
        key,
        startMs: custom?.startMs ?? end - 30 * 86400000,
        endMs: custom?.endMs ?? end,
        label: "custom",
      };
    default:
      return { key: "last_7_days", startMs: end - 7 * 86400000, endMs: end, label: "last_7_days" };
  }
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1]! + sorted[mid]!) / 2)
    : sorted[mid]!;
}

export function average(values: number[]): number | null {
  if (!values.length) return null;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

/**
 * Deduplicate reopened/rolled-back/duplicate candidates by identity key.
 * Keeps the most advanced funnel stage (later index wins), then newest stageEnteredAt.
 */
export function dedupeCohort<T extends { candidateId: string; identityKey?: string; funnelStage: string; stageEnteredAt: string }>(
  rows: T[],
  stageOrder: readonly string[],
): T[] {
  const order = new Map(stageOrder.map((s, i) => [s, i]));
  const byKey = new Map<string, T>();
  for (const row of rows) {
    const key = row.identityKey?.trim() || row.candidateId;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, row);
      continue;
    }
    const a = order.get(existing.funnelStage) ?? -1;
    const b = order.get(row.funnelStage) ?? -1;
    if (b > a) {
      byKey.set(key, row);
    } else if (b === a && Date.parse(row.stageEnteredAt) > Date.parse(existing.stageEnteredAt)) {
      byKey.set(key, row);
    }
  }
  return [...byKey.values()];
}
