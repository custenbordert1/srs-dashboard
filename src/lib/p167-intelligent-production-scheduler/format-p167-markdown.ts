import type { P167ProductionSchedulerReport } from "@/lib/p167-intelligent-production-scheduler/types";
import { recommendationLabel } from "@/lib/p167-intelligent-production-scheduler/presentation";

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m ${sec % 60}s`;
}

function formatTimeSince(ms: number | null): string {
  if (ms == null) return "—";
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h}h ${min % 60}m`;
}

export function formatP167Markdown(report: P167ProductionSchedulerReport): string {
  const d = report.decision;
  const c = report.context;
  const lines: string[] = [
    "# P167 — Intelligent Production Scheduler",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## Current recommendation",
    "",
    `- **Recommendation:** ${recommendationLabel(d.recommendation)} (\`${d.recommendation}\`)`,
    `- **Confidence:** ${d.confidence}%`,
    `- **Next run:** ${d.nextRecommendedRunAt ?? "—"}`,
    `- **Reason:** ${d.reason}`,
    `- **Limiting factor:** ${d.limitingFactor ?? "—"}`,
    `- **Expected sends:** ${d.estimatedCandidatesNextCycle}`,
    `- **Projected Dropbox API:** ${d.projectedDropboxApiUsage.totalRequests} (POST ${d.projectedDropboxApiUsage.postRequests}, GET ${d.projectedDropboxApiUsage.getRequests})`,
    `- **Projected queue after:** ${d.projectedQueueAfterCycle}`,
    "",
    "## Context",
    "",
    `- Eligible now: ${c.eligibleNow}`,
    `- Queue remaining: ${c.queueRemaining}`,
    `- Waiting on signature: ${c.waitingOnSignature}`,
    `- Active signatures: ${c.activeSignatureCount}`,
    `- Deferred reconciliation: ${c.deferredReconciliationCount}`,
    `- Recruiters available: ${c.recruitersAvailable}`,
    `- Production readiness: ${c.productionReadinessScore ?? "—"}`,
    `- Last cycle: ${c.lastCycleAt ?? "—"}`,
    `- Last successful cycle: ${c.lastSuccessfulCycleAt ?? "—"}`,
    `- Time since last cycle: ${formatTimeSince(c.timeSinceLastCycleMs)}`,
    `- Today paperwork sent: ${c.todayPaperworkSent}`,
    `- Today failures: ${c.todayFailures}`,
    `- Dropbox RPM: ${c.dropboxRequestsPerMinute}`,
    `- Dropbox rate limit remaining: ${c.dropboxRateLimitRemaining ?? "—"}`,
    `- API budget ceiling: ${d.projectedDropboxApiUsage.budgetCeiling}`,
    `- Processing lock: ${c.processingLockHeld}`,
    `- Daemon active: ${c.daemonActive}`,
    `- Continuous mode: ${c.continuousModeEnabled}`,
    "",
    "## Timeline (last 10 cycles)",
    "",
  ];

  if (report.timeline.length === 0) {
    lines.push("_No production cycles recorded._");
  } else {
    lines.push(
      "| Time | Duration | Sent | API | Errors | Queue before | Queue after |",
      "| --- | --- | --- | --- | --- | --- | --- |",
    );
    for (const row of report.timeline) {
      lines.push(
        `| ${row.completedAt ?? row.startedAt} | ${formatDuration(row.durationMs)} | ${row.paperworkSent} | ${row.apiRequestsEstimate} (${row.apiRequestsSource}) | ${row.errors} | ${row.queueBefore ?? "—"} | ${row.queueAfter ?? "—"} |`,
      );
    }
  }

  lines.push("", "## What-if simulations", "");
  for (const sim of report.simulations) {
    lines.push(
      `### ${sim.scenario}`,
      `- Recommendation: ${recommendationLabel(sim.recommendation)}`,
      `- Expected sends: ${sim.expectedSends}`,
      `- API usage: ${sim.expectedApiUsage.total}`,
      `- Queue reduction: ${sim.expectedQueueReduction}`,
      `- Backlog after: ${sim.expectedBacklog}`,
      `- Notes: ${sim.notes.join(" ")}`,
      "",
    );
  }

  if (report.warnings.length > 0) {
    lines.push("## Warnings", "");
    for (const w of report.warnings) lines.push(`- ${w}`);
  }

  return lines.join("\n");
}
