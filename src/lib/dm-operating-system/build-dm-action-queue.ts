import { sortWorkQueueItems } from "@/lib/unified-recruiting-command-center/compare-work-queue";
import type { CommandCenterWorkQueueItem } from "@/lib/unified-recruiting-command-center/types";
import { filterWorkQueueForDmScope } from "@/lib/dm-operating-system/filter-territory-scope";
import type { DmOperatingSystemScope } from "@/lib/dm-operating-system/types";

const ACTION_QUEUE_LIMIT = 25;

export function buildDmActionQueue(input: {
  workQueue: CommandCenterWorkQueueItem[];
  scope: DmOperatingSystemScope;
}): CommandCenterWorkQueueItem[] {
  const scoped = filterWorkQueueForDmScope(input.workQueue, input.scope);
  return sortWorkQueueItems(scoped).slice(0, ACTION_QUEUE_LIMIT);
}

export function compareDmActionQueueItems(
  a: CommandCenterWorkQueueItem,
  b: CommandCenterWorkQueueItem,
): number {
  return sortWorkQueueItems([a, b])[0] === a ? -1 : 1;
}
