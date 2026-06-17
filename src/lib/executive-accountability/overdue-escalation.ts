import type { ExecutiveTrackedAction } from "@/lib/executive-accountability/types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type OverdueEscalationBucket = "3+" | "7+" | "14+" | "21+";

export type OverdueEscalationRow = {
  action: ExecutiveTrackedAction;
  owner: string;
  daysOverdue: number;
  bucket: OverdueEscalationBucket;
};

export type OverdueEscalationDashboard = {
  totalOverdue: number;
  buckets: Record<OverdueEscalationBucket, OverdueEscalationRow[]>;
  rows: OverdueEscalationRow[];
};

export function daysOverdue(action: ExecutiveTrackedAction, referenceMs: number): number {
  const due = new Date(action.dueDate).getTime();
  if (Number.isNaN(due)) return 0;
  return Math.max(0, Math.floor((referenceMs - due) / MS_PER_DAY));
}

export function overdueEscalationBucket(days: number): OverdueEscalationBucket | null {
  if (days < 3) return null;
  if (days >= 21) return "21+";
  if (days >= 14) return "14+";
  if (days >= 7) return "7+";
  return "3+";
}

export function buildOverdueEscalationDashboard(input: {
  overdueActions: ExecutiveTrackedAction[];
  referenceMs?: number;
}): OverdueEscalationDashboard {
  const referenceMs = input.referenceMs ?? Date.now();
  const buckets: Record<OverdueEscalationBucket, OverdueEscalationRow[]> = {
    "3+": [],
    "7+": [],
    "14+": [],
    "21+": [],
  };

  const rows: OverdueEscalationRow[] = [];
  for (const action of input.overdueActions) {
    const days = daysOverdue(action, referenceMs);
    const bucket = overdueEscalationBucket(days);
    if (!bucket) continue;
    const row: OverdueEscalationRow = {
      action,
      owner: action.owner?.trim() || "Unassigned",
      daysOverdue: days,
      bucket,
    };
    rows.push(row);
    buckets[bucket].push(row);
  }

  const sortRows = (list: OverdueEscalationRow[]) =>
    list.sort((a, b) => b.daysOverdue - a.daysOverdue || a.owner.localeCompare(b.owner));

  for (const key of Object.keys(buckets) as OverdueEscalationBucket[]) {
    buckets[key] = sortRows(buckets[key]);
  }

  return {
    totalOverdue: rows.length,
    buckets,
    rows: sortRows(rows),
  };
}
