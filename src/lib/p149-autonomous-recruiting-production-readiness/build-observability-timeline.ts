import type { PaperworkAutomationAuditEvent } from "@/lib/p145-controlled-paperwork-automation/types";
import { loadPaperworkAutomationAuditLog } from "@/lib/p145-controlled-paperwork-automation/paperwork-automation-audit-store";
import { loadOrchestratorRunHistory } from "@/lib/p148-autonomous-recruiting-orchestrator/orchestrator-store";
import type { OrchestratorRunRecord } from "@/lib/p148-autonomous-recruiting-orchestrator/types";
import type { ObservabilityEntry, ObservabilitySearchResult } from "@/lib/p149-autonomous-recruiting-production-readiness/types";
import { P149_SOURCE_PHASE } from "@/lib/p149-autonomous-recruiting-production-readiness/types";

function auditToEntry(event: PaperworkAutomationAuditEvent): ObservabilityEntry {
  return {
    id: event.id,
    at: event.at,
    source: "P145",
    type: event.type,
    candidateId: event.candidateId,
    summary: [event.recommendedAction, event.reason, event.blockedReason].filter(Boolean).join(" — "),
    executed: event.executed,
    duplicatePrevented: event.duplicatePrevented ?? false,
    sendResult: event.sendResult ?? null,
  };
}

function runToEntry(run: OrchestratorRunRecord): ObservabilityEntry {
  return {
    id: run.runId,
    at: run.completedAt,
    source: "P148",
    type: run.success ? "orchestrator_cycle_success" : "orchestrator_cycle_failure",
    candidateId: null,
    summary: `Evaluated ${run.candidatesEvaluated}, queue ${run.paperworkQueueCount}, reminders ${run.remindersSent}, initial ${run.initialPaperworkSent}`,
    executed: !run.dryRun && run.paperworkSent,
    duplicatePrevented: false,
    sendResult: run.paperworkSent ? "sent" : run.dryRun ? "dry_run" : "none",
  };
}

function matchesQuery(entry: ObservabilityEntry, query: string): boolean {
  const haystack = [
    entry.id,
    entry.type,
    entry.candidateId,
    entry.summary,
    entry.sendResult,
    entry.source,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(query.toLowerCase());
}

export async function searchObservabilityHistory(input?: {
  query?: string | null;
  limit?: number;
  type?: string | null;
}): Promise<ObservabilitySearchResult> {
  const limit = Math.min(200, Math.max(1, input?.limit ?? 50));
  const query = input?.query?.trim() || null;
  const typeFilter = input?.type?.trim() || null;

  const [auditEvents, runs] = await Promise.all([
    loadPaperworkAutomationAuditLog().catch(() => []),
    loadOrchestratorRunHistory().catch(() => []),
  ]);

  let entries: ObservabilityEntry[] = [
    ...auditEvents.map(auditToEntry),
    ...runs.map(runToEntry),
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  if (typeFilter) {
    entries = entries.filter((entry) => entry.type === typeFilter);
  }
  if (query) {
    entries = entries.filter((entry) => matchesQuery(entry, query));
  }

  return {
    sourcePhase: P149_SOURCE_PHASE,
    generatedAt: new Date().toISOString(),
    query,
    total: entries.length,
    entries: entries.slice(0, limit),
  };
}
