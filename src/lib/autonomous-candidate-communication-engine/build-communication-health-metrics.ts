import type {
  CommunicationHealthMetrics,
  CommunicationQueueItem,
} from "@/lib/autonomous-candidate-communication-engine/types";

function isToday(iso: string, referenceMs: number): boolean {
  const date = new Date(iso);
  const ref = new Date(referenceMs);
  return (
    date.getUTCFullYear() === ref.getUTCFullYear() &&
    date.getUTCMonth() === ref.getUTCMonth() &&
    date.getUTCDate() === ref.getUTCDate()
  );
}

export function buildCommunicationHealthMetrics(input: {
  queue: CommunicationQueueItem[];
  referenceMs: number;
}): CommunicationHealthMetrics {
  const todayItems = input.queue.filter((item) => isToday(item.scheduledAt, input.referenceMs));

  const statusCounts = input.queue.reduce(
    (acc, item) => {
      acc[item.status] = (acc[item.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const typeCounts = new Map<string, number>();
  for (const item of todayItems) {
    typeCounts.set(item.communicationType, (typeCounts.get(item.communicationType) ?? 0) + 1);
  }

  const topCommunicationTypes = [...typeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([type, count]) => ({ type: type as CommunicationHealthMetrics["topCommunicationTypes"][0]["type"], count }));

  const templateIds = new Set(input.queue.map((item) => item.templateId));
  const automated = input.queue.filter((item) => !item.approvalRequired && item.wouldExecute);
  const automationPercent =
    input.queue.length > 0 ? Math.round((automated.length / input.queue.length) * 100) : null;

  const responseTimes = input.queue
    .filter((item) => item.status === "sent_preview")
    .map((item) => Date.parse(item.scheduledAt))
    .filter((ms) => !Number.isNaN(ms));

  const averageResponseTimeMs =
    responseTimes.length > 0
      ? Math.round(
          responseTimes.reduce((sum, ms) => sum + (input.referenceMs - ms), 0) / responseTimes.length,
        )
      : null;

  return {
    communicationsToday: todayItems.length,
    queued: statusCounts.queued ?? 0,
    previewSent: statusCounts.sent_preview ?? 0,
    waitingApproval: statusCounts.waiting_approval ?? 0,
    failures: statusCounts.failed ?? 0,
    skipped: statusCounts.skipped ?? 0,
    averageResponseTimeMs,
    templatesUsed: templateIds.size,
    automationPercent,
    topCommunicationTypes,
    recruiterWorkEliminated: automated.filter((item) => item.recipientRole === "representative").length,
  };
}
