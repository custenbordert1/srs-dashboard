import { P58_SOURCE_MODULE } from "@/lib/autonomous-recruiting-execution/bridge-accountability";
import type { ExecutionCorrelation } from "@/lib/autonomous-recruiting-execution/execution-correlation";
import type { ExecutionAuditLogEntry } from "@/lib/autonomous-recruiting-execution/types";
import { loadExecutiveAccountabilityStore } from "@/lib/executive-accountability/recommendation-store";
import { listAutomationRuns } from "@/lib/hiring-automation-engine/automation-run-store";

export async function buildExecutionAuditView(
  correlations: ExecutionCorrelation[],
): Promise<ExecutionAuditLogEntry[]> {
  const [accountability, runs] = await Promise.all([
    loadExecutiveAccountabilityStore(),
    listAutomationRuns(),
  ]);

  const accountabilityIds = new Set(
    correlations.map((row) => row.accountabilityActionId).filter(Boolean) as string[],
  );
  const correlationByAccountability = new Map(
    correlations
      .filter((row) => row.accountabilityActionId)
      .map((row) => [row.accountabilityActionId!, row]),
  );
  const correlationByAutomationRun = new Map(
    correlations
      .filter((row) => row.automationRunId)
      .map((row) => [row.automationRunId!, row]),
  );
  const correlationByJobDraft = new Map(
    correlations
      .filter((row) => row.jobDraftId)
      .map((row) => [row.jobDraftId!, row]),
  );

  const entries: ExecutionAuditLogEntry[] = [];

  for (const audit of accountability.auditLog) {
    if (!accountabilityIds.has(audit.recommendationId)) continue;
    const correlation = correlationByAccountability.get(audit.recommendationId);
    entries.push({
      id: audit.id,
      at: audit.changedAt,
      action: audit.field,
      actor: audit.changedBy,
      detail: `${audit.field}: ${audit.oldValue ?? "—"} → ${audit.newValue ?? "—"}`,
      executionId: correlation?.id ?? audit.recommendationId,
      territory: correlation?.territory ?? "",
      type: correlation?.type ?? "posting",
      source: "executive-accountability",
    });
  }

  for (const action of accountability.actions) {
    if (action.sourceModule !== P58_SOURCE_MODULE) continue;
    const correlation = correlations.find(
      (row) => row.accountabilityActionId === action.recommendationId,
    );
    if (!correlation) continue;
    entries.push({
      id: `action-${action.recommendationId}-status`,
      at: action.updatedAt,
      action: "status",
      actor: undefined,
      detail: `Accountability action: ${action.status} — ${action.title}`,
      executionId: correlation.id,
      territory: correlation.territory,
      type: correlation.type,
      source: "executive-accountability",
    });
  }

  for (const run of runs) {
    const correlation =
      correlationByAutomationRun.get(run.id) ??
      (run.payload?.jobDraftId
        ? correlationByJobDraft.get(run.payload.jobDraftId)
        : undefined);
    if (!correlation) continue;

    for (const audit of run.auditTrail) {
      entries.push({
        id: audit.id,
        at: audit.at,
        action: audit.action,
        actor: audit.actor,
        detail: audit.detail,
        executionId: correlation.id,
        territory: correlation.territory,
        type: correlation.type,
        source: "hiring-automation-engine",
      });
    }
  }

  return entries.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}
