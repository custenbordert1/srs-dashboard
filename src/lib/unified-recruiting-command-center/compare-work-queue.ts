import type { CommandCenterWorkQueueItem } from "@/lib/unified-recruiting-command-center/types";

const PRIORITY_RANK: Record<CommandCenterWorkQueueItem["priority"], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export function compareWorkQueueItems(
  a: CommandCenterWorkQueueItem,
  b: CommandCenterWorkQueueItem,
): number {
  if (b.impactScore !== a.impactScore) return b.impactScore - a.impactScore;
  const priorityDelta = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  if (priorityDelta !== 0) return priorityDelta;
  if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
  return a.dueDate.localeCompare(b.dueDate);
}

export function sortWorkQueueItems(
  items: CommandCenterWorkQueueItem[],
): CommandCenterWorkQueueItem[] {
  return [...items].sort(compareWorkQueueItems);
}
