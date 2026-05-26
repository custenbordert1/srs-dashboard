import type { DmAlertPriority } from "@/lib/dm-dashboard/dm-alert-priority";
import type {
  RecruiterEscalationQueueItem,
  RecruiterEscalationQueueStatus,
} from "@/lib/operational-escalation/operational-escalation-types";

export type RecruiterEscalationStatusTab = RecruiterEscalationQueueStatus;

export type RecruiterEscalationPriorityFilter = DmAlertPriority | "all";

export type RecruiterEscalationAgingFilter = "all" | "24h" | "3d" | "7d+";

const MS_PER_HOUR = 60 * 60 * 1000;

export function escalationAgeHours(item: RecruiterEscalationQueueItem, referenceMs = Date.now()): number {
  return (referenceMs - new Date(item.createdAt).getTime()) / MS_PER_HOUR;
}

export function escalationAgingBucket(
  item: RecruiterEscalationQueueItem,
  referenceMs = Date.now(),
): "fresh" | "24h" | "3d" | "7d+" {
  const hours = escalationAgeHours(item, referenceMs);
  if (hours < 24) return "fresh";
  if (hours < 72) return "24h";
  if (hours < 168) return "3d";
  return "7d+";
}

export function matchesEscalationStatusTab(
  item: RecruiterEscalationQueueItem,
  tab: RecruiterEscalationStatusTab,
): boolean {
  return item.status === tab;
}

export function matchesEscalationPriorityFilter(
  item: RecruiterEscalationQueueItem,
  filter: RecruiterEscalationPriorityFilter,
): boolean {
  if (filter === "all") return true;
  return item.priority === filter;
}

export function matchesEscalationTerritoryFilter(
  item: RecruiterEscalationQueueItem,
  stateFilter: string,
): boolean {
  if (!stateFilter || stateFilter === "all") return true;
  return item.state.trim().toUpperCase() === stateFilter.trim().toUpperCase();
}

export function matchesEscalationAgingFilter(
  item: RecruiterEscalationQueueItem,
  filter: RecruiterEscalationAgingFilter,
  referenceMs = Date.now(),
): boolean {
  if (filter === "all") return true;
  const bucket = escalationAgingBucket(item, referenceMs);
  if (filter === "24h") return bucket === "24h" || bucket === "3d" || bucket === "7d+";
  if (filter === "3d") return bucket === "3d" || bucket === "7d+";
  return bucket === "7d+";
}

export function filterRecruiterEscalations(
  items: RecruiterEscalationQueueItem[],
  options: {
    statusTab: RecruiterEscalationStatusTab;
    priorityFilter: RecruiterEscalationPriorityFilter;
    territoryState: string;
    agingFilter: RecruiterEscalationAgingFilter;
    referenceMs?: number;
  },
): RecruiterEscalationQueueItem[] {
  const referenceMs = options.referenceMs ?? Date.now();
  return items
    .filter((item) => matchesEscalationStatusTab(item, options.statusTab))
    .filter((item) => matchesEscalationPriorityFilter(item, options.priorityFilter))
    .filter((item) => matchesEscalationTerritoryFilter(item, options.territoryState))
    .filter((item) => matchesEscalationAgingFilter(item, options.agingFilter, referenceMs))
    .sort((a, b) => {
      const scoreDiff = (b.priorityScore ?? 0) - (a.priorityScore ?? 0);
      if (scoreDiff !== 0) return scoreDiff;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
}

export type RecruiterEscalationQueueCounts = Record<RecruiterEscalationQueueStatus, number>;

export function buildRecruiterEscalationQueueCounts(
  items: RecruiterEscalationQueueItem[],
): RecruiterEscalationQueueCounts {
  const counts: RecruiterEscalationQueueCounts = {
    new: 0,
    in_review: 0,
    completed: 0,
    dismissed: 0,
  };
  for (const item of items) {
    counts[item.status] += 1;
  }
  return counts;
}

export function listEscalationTerritoryStates(items: RecruiterEscalationQueueItem[]): string[] {
  const states = new Set<string>();
  for (const item of items) {
    if (item.state.trim()) states.add(item.state.trim().toUpperCase());
  }
  return [...states].sort();
}
