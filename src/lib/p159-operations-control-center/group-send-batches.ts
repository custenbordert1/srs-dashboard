import { P159_BATCH_GAP_MS } from "@/lib/p159-operations-control-center/constants";

export function groupIntoSendBatches(
  events: Array<{ at: string }>,
): Array<{ startAt: string; endAt: string; sendCount: number }> {
  const sorted = [...events].sort((a, b) => a.at.localeCompare(b.at));
  const batches: Array<{ startAt: string; endAt: string; sendCount: number }> = [];

  for (const event of sorted) {
    const current = batches[batches.length - 1];
    if (!current) {
      batches.push({ startAt: event.at, endAt: event.at, sendCount: 1 });
      continue;
    }
    const gap = Date.parse(event.at) - Date.parse(current.endAt);
    if (gap > P159_BATCH_GAP_MS) {
      batches.push({ startAt: event.at, endAt: event.at, sendCount: 1 });
    } else {
      current.endAt = event.at;
      current.sendCount += 1;
    }
  }

  return batches;
}
