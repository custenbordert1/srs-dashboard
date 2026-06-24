import { listCandidateExecutions } from "@/lib/candidate-automation-execution/execution-record-store";
import { loadExecutionRunSummary } from "@/lib/candidate-automation-execution/execution-last-run-store";
import { loadCandidateExecutionPolicy } from "@/lib/candidate-automation-execution/execution-policy-store";
import type { CandidateExecutionHealth } from "@/lib/candidate-automation-execution/types";

function isToday(iso: string): boolean {
  const date = new Date(iso);
  const now = new Date();
  return (
    date.getUTCFullYear() === now.getUTCFullYear() &&
    date.getUTCMonth() === now.getUTCMonth() &&
    date.getUTCDate() === now.getUTCDate()
  );
}

export async function buildCandidateExecutionHealth(): Promise<CandidateExecutionHealth> {
  const [policy, records, lastRun] = await Promise.all([
    loadCandidateExecutionPolicy(),
    listCandidateExecutions(500),
    loadExecutionRunSummary(),
  ]);

  const todayRecords = records.filter((row) => isToday(row.createdAt));
  const completed = records.filter((row) => row.status === "completed");
  const failed = records.filter((row) => row.status === "failed");
  const pending = records.filter(
    (row) => row.status === "pending" || row.status === "in_progress" || row.status === "retrying",
  );
  const escalations = records.filter(
    (row) => row.executionType === "create-escalation-task" && row.status === "completed",
  );
  const retries = records.reduce((sum, row) => sum + row.retryCount, 0);

  const completionDurations = completed
    .map((row) => {
      if (!row.completedAt || !row.startedAt) return null;
      return Date.parse(row.completedAt) - Date.parse(row.startedAt);
    })
    .filter((value): value is number => value !== null && Number.isFinite(value));

  const averageCompletionMs =
    completionDurations.length > 0
      ? Math.round(
          completionDurations.reduce((sum, value) => sum + value, 0) / completionDurations.length,
        )
      : 0;

  const terminal = completed.length + failed.length;
  const successRatePct = terminal > 0 ? Math.round((completed.length / terminal) * 100) : 100;
  const automationEffectivenessPct =
    records.length > 0 ? Math.round((completed.length / records.length) * 100) : 100;

  return {
    executionsToday: todayRecords.length,
    successRatePct,
    failedExecutions: failed.length,
    escalationsCreated: escalations.length,
    averageCompletionMs,
    retryVolume: retries,
    automationEffectivenessPct,
    totalExecutions: records.length,
    completedExecutions: completed.length,
    pendingExecutions: pending.length,
    policyEnabled: policy.enabled,
    policyMode: policy.mode,
    dryRun: policy.dryRun,
    paperworkEnabled: policy.paperwork.enabled,
    escalationEnabled: policy.escalation.enabled,
    escalationRequireApproval: policy.escalation.requireApproval,
    maxEscalationsPerRun: policy.maxEscalationsPerRun,
    eligibleExecutions: lastRun?.eligibleExecutions ?? 0,
    executed: lastRun?.executed ?? 0,
    blockedByPolicy: lastRun?.blockedByPolicy ?? 0,
    blockedByBatchCap: lastRun?.blockedByBatchCap ?? 0,
    lastRunAt: lastRun?.runAt ?? null,
  };
}
