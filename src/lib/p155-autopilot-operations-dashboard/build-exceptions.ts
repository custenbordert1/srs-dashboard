import { getCandidateWorkflowBundle } from "@/lib/candidate-workflow-store";
import { loadPaperworkAutomationAuditLog } from "@/lib/p145-controlled-paperwork-automation/paperwork-automation-audit-store";
import { classifyCandidatesSince } from "@/lib/p154-full-candidate-backfill-continuous-processing/classify-candidates";
import { getP154BackfillSinceDate } from "@/lib/p154-continuous-autonomous-recruiting-runner/runner-config";
import { loadP1547RunnerState } from "@/lib/p154-continuous-autonomous-recruiting-runner/runner-store";
import { loadMonitorState } from "@/lib/paperwork-monitor/monitor-store";
import type { P155ExceptionRow } from "@/lib/p155-autopilot-operations-dashboard/types";

function todayStartMs(): number {
  return Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
}

export async function buildP155Exceptions(input?: { limit?: number }): Promise<P155ExceptionRow[]> {
  const limit = input?.limit ?? 50;
  const sinceMs = todayStartMs();
  const rows: P155ExceptionRow[] = [];

  const audit = await loadPaperworkAutomationAuditLog();
  for (const event of audit) {
    if (Date.parse(event.at) < sinceMs) continue;
    if (event.sendResult === "failed") {
      rows.push({
        id: `failed-${event.id}`,
        category: "failed_send",
        candidateId: event.candidateId,
        candidateName: event.candidateName ?? null,
        detail: event.blockedReason ?? event.reason ?? "Paperwork send failed.",
        at: event.at,
      });
    }
    if (event.sendResult === "blocked" && event.duplicatePrevented) {
      rows.push({
        id: `dup-${event.id}`,
        category: "duplicate_conflict",
        candidateId: event.candidateId,
        candidateName: event.candidateName ?? null,
        detail: event.blockedReason ?? "Duplicate send prevented.",
        at: event.at,
      });
    }
  }

  const monitor = await loadMonitorState();
  if (monitor.lastError) {
    rows.push({
      id: `monitor-${monitor.lastRunAt ?? "latest"}`,
      category: "webhook_failure",
      candidateId: null,
      candidateName: null,
      detail: monitor.lastError,
      at: monitor.lastRunAt ?? new Date().toISOString(),
    });
  }

  const runner = await loadP1547RunnerState();
  if (runner.lastError) {
    rows.push({
      id: `runner-${runner.updatedAt}`,
      category: "runner_error",
      candidateId: null,
      candidateName: null,
      detail: runner.lastError,
      at: runner.lastRun ?? runner.updatedAt,
    });
  }

  const classification = await classifyCandidatesSince({
    backfillSince: getP154BackfillSinceDate(),
    maxRows: 100,
  });

  for (const row of classification.rows) {
    if (row.bucket === "invalid_email") {
      rows.push({
        id: `invalid-${row.candidateId}`,
        category: "invalid_email",
        candidateId: row.candidateId,
        candidateName: row.candidateName,
        detail: row.reason,
        at: new Date().toISOString(),
      });
    }
    if (row.bucket === "duplicate") {
      rows.push({
        id: `class-dup-${row.candidateId}`,
        category: "duplicate_conflict",
        candidateId: row.candidateId,
        candidateName: row.candidateName,
        detail: row.reason,
        at: new Date().toISOString(),
      });
    }
    if (row.bucket === "manual_review") {
      rows.push({
        id: `review-${row.candidateId}`,
        category: "manual_review",
        candidateId: row.candidateId,
        candidateName: row.candidateName,
        detail: row.reason,
        at: new Date().toISOString(),
      });
    }
  }

  const bundle = await getCandidateWorkflowBundle();
  for (const record of Object.values(bundle.workflows)) {
    if (record.paperworkStatus === "failed") {
      rows.push({
        id: `wf-failed-${record.candidateId}`,
        category: "failed_send",
        candidateId: record.candidateId,
        candidateName: record.candidateId,
        detail: `Workflow paperwork status failed (${record.workflowStatus}).`,
        at: record.updatedAt ?? new Date().toISOString(),
      });
    }
  }

  return rows
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, limit);
}
