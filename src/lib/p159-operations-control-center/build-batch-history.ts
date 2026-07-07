import { loadP1547RunnerState } from "@/lib/p154-continuous-autonomous-recruiting-runner/runner-store";
import { P159_BATCH_GAP_MS } from "@/lib/p159-operations-control-center/constants";
import { loadCandidateWorkflowAudit } from "@/lib/p159-operations-control-center/load-workflow-audit";
import type {
  P159BatchHistoryRow,
  P159BatchTrigger,
  P159SendBatchSummary,
  P159WorkflowAuditEntry,
} from "@/lib/p159-operations-control-center/types";

const DAEMON_USER_IDS = new Set([
  "p154.7-continuous-runner",
  "p154.4-backfill-continuous",
]);

const SOURCE_LABELS: Record<string, string> = {
  "p154.3-morning-cycle": "P154.3 Morning Production Send",
  "p154.4-backfill-continuous": "P154.4 Backfill & Continuous",
  "p154.6-live-send-after-csv": "P154.6 Post-CSV Live Send",
  "p154.7-continuous-runner": "P154.7 Continuous Runner",
};

function todayStartIso(): string {
  return `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`;
}

function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}

function resolveTrigger(source: string, dryRun: boolean): P159BatchTrigger {
  if (dryRun) return "manual";
  if (DAEMON_USER_IDS.has(source)) {
    return source === "p154.7-continuous-runner" ? "daemon" : "manual";
  }
  if (source.includes("continuous")) return "daemon";
  return "manual";
}

function groupPaperworkSends(events: P159WorkflowAuditEntry[]): P159SendBatchSummary[] {
  const sends = events
    .filter((e) => e.action === "paperwork_sent" && e.ok)
    .sort((a, b) => a.at.localeCompare(b.at));

  const batches: P159WorkflowAuditEntry[][] = [];
  for (const event of sends) {
    const current = batches[batches.length - 1];
    if (!current) {
      batches.push([event]);
      continue;
    }
    const gap = Date.parse(event.at) - Date.parse(current[current.length - 1].at);
    if (gap > P159_BATCH_GAP_MS) batches.push([event]);
    else current.push(event);
  }

  return batches.map((batch, index) => ({
    batchNumber: index + 1,
    startAt: batch[0].at,
    endAt: batch[batch.length - 1].at,
    sendCount: batch.length,
    sendTimes: batch.map((e) => e.at),
  }));
}

function countRelatedEvents(
  allEvents: P159WorkflowAuditEntry[],
  source: string,
  startMs: number,
  endMs: number,
  actions: string[],
): number {
  const padMs = 120_000;
  return allEvents.filter((e) => {
    if (e.byUserId !== source) return false;
    if (!actions.includes(e.action)) return false;
    const at = Date.parse(e.at);
    return at >= startMs - padMs && at <= endMs + padMs;
  }).length;
}

export async function buildP159BatchHistory(input?: {
  since?: string;
}): Promise<{ batches: P159BatchHistoryRow[]; sendBatches: P159SendBatchSummary[] }> {
  const since = input?.since ?? todayStartIso();
  const sinceMs = Date.parse(since);
  const allEvents = await loadCandidateWorkflowAudit({ since });
  const sendBatches = groupPaperworkSends(allEvents);

  const batches: P159BatchHistoryRow[] = sendBatches.map((batch, index) => {
    const batchEvents = allEvents.filter(
      (e) =>
        e.action === "paperwork_sent" &&
        Date.parse(e.at) >= Date.parse(batch.startAt) &&
        Date.parse(e.at) <= Date.parse(batch.endAt),
    );
    const source = batchEvents[0]?.byUserId ?? "unknown";
    const startMs = Date.parse(batch.startAt);
    const endMs = Date.parse(batch.endAt);

    return {
      id: `send-batch-${index + 1}-${batch.startAt}`,
      source,
      sourceLabel: sourceLabel(source),
      trigger: resolveTrigger(source, false),
      startAt: batch.startAt,
      endAt: batch.endAt,
      durationMs: Math.max(0, endMs - startMs),
      candidatesEvaluated: null,
      recruitersAssigned: countRelatedEvents(allEvents, source, startMs, endMs, [
        "auto_assign_recruiter",
      ]),
      workflowTransitions: countRelatedEvents(allEvents, source, startMs, endMs, [
        "advance_workflow",
        "workflow_transition",
        "pipeline_advance",
      ]),
      paperworkSent: batch.sendCount,
      failures: allEvents.filter(
        (e) =>
          e.byUserId === source &&
          !e.ok &&
          Date.parse(e.at) >= startMs - 120_000 &&
          Date.parse(e.at) <= endMs + 120_000,
      ).length,
      dryRun: false,
    };
  });

  const runner = await loadP1547RunnerState();
  for (const cycle of runner.recentCycles) {
    if (Date.parse(cycle.startedAt) < sinceMs) continue;
    const source = cycle.dryRun ? "p154.7-simulation" : "p154.7-continuous-runner";
    batches.push({
      id: `runner-cycle-${cycle.cycleNumber}-${cycle.startedAt}`,
      source,
      sourceLabel: cycle.dryRun ? "P154.7 Simulation Cycle" : "P154.7 Runner Cycle",
      trigger: cycle.dryRun ? "manual" : "daemon",
      startAt: cycle.startedAt,
      endAt: cycle.completedAt ?? cycle.startedAt,
      durationMs: cycle.durationMs,
      candidatesEvaluated: cycle.candidatesEvaluated,
      recruitersAssigned: cycle.assigned,
      workflowTransitions: 0,
      paperworkSent: cycle.sent,
      failures: cycle.errors,
      dryRun: cycle.dryRun,
    });
  }

  batches.sort((a, b) => b.startAt.localeCompare(a.startAt));
  return { batches, sendBatches };
}
