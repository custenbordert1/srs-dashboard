import type { P159OperationsControlCenter } from "@/lib/p159-operations-control-center/types";

const RECOMMENDATION_LABELS: Record<string, string> = {
  continue_manual_batches: "Continue manual batches",
  safe_for_capped_cycle: "Safe to run another capped cycle",
  pause_due_to_failures: "Pause due to failures",
  ready_for_server_deployment: "Ready for server deployment",
  ready_for_continuous_observation: "Ready for continuous mode observation",
  not_ready_for_autonomous_sending: "Not ready for autonomous sending",
};

const MODE_LABELS: Record<string, string> = {
  manual_only: "Manual only",
  paused: "Paused",
  ready: "Ready",
  running: "Running",
  blocked: "Blocked",
  degraded: "Degraded",
};

export function formatP159OperationsControlCenterMarkdown(input: {
  dashboard: P159OperationsControlCenter;
  warnings?: string[];
  validation?: Record<string, unknown>;
}): string {
  const d = input.dashboard;
  const lines = [
    "# P159 — Operations Control Center",
    "",
    `Generated: ${d.generatedAt}`,
    "",
    "## System Mode",
    "",
    `**${MODE_LABELS[d.runner.systemMode] ?? d.runner.systemMode}** — ${d.recommendationDetail}`,
    "",
    "## Runner Status",
    "",
    `- System mode: **${MODE_LABELS[d.runner.systemMode] ?? d.runner.systemMode}**`,
    `- Continuous enabled: **${d.runner.continuousEnabled}**`,
    `- Scheduler mode: **${d.runner.schedulerMode}**`,
    `- Daemon running: **${d.runner.daemonRunning}**`,
    `- Autopilot enabled: **${d.runner.autopilotEnabled}**`,
    `- Last cycle: ${d.runner.lastCycleAt ?? "—"}`,
    `- Next cycle: ${d.runner.nextCycleAt ?? "—"}`,
    `- Interval: **${d.runner.intervalMinutes} min**`,
    `- Uptime: ${d.runner.uptimeMs != null ? `${Math.round(d.runner.uptimeMs / 60_000)}m` : "—"}`,
    `- Overlap lock: **${d.runner.processingLockHeld ? "held" : "clear"}**`,
    `- Stale lock warning: **${d.runner.staleLockWarning}**`,
    d.runner.lastError ? `- Last error: ${d.runner.lastError}` : null,
    "",
    "## Today's Production Activity",
    "",
    `- Paperwork sent: **${d.today.paperworkSent}**`,
    `- Send batches: **${d.today.sendBatchCount}**`,
    `- Signed today: **${d.today.signedToday}**`,
    `- Viewed today: **${d.today.viewedToday}**`,
    `- Pending signatures: **${d.today.pendingSignatures}**`,
    `- Duplicates prevented: **${d.today.duplicatesPrevented}**`,
    `- Failures: **${d.today.failures}**`,
    "",
  ].filter((line): line is string => line !== null);

  if (d.today.sendBatches.length > 0) {
    lines.push("### Send times by batch", "");
    for (const batch of d.today.sendBatches) {
      lines.push(
        `- Batch ${batch.batchNumber}: **${batch.sendCount}** sends (${batch.startAt} → ${batch.endAt})`,
      );
    }
    lines.push("");
  }

  lines.push(
    "## Queue Status",
    "",
    `- Candidates evaluated: **${d.queue.candidatesEvaluated}**`,
    `- Eligible now: **${d.queue.eligibleNow}**`,
    `- Ready after recruiter assignment: **${d.queue.readyAfterRecruiterAssignment}**`,
    `- Ready after workflow transition: **${d.queue.readyAfterWorkflowTransition}**`,
    `- Waiting on signature: **${d.queue.waitingOnSignature}**`,
    `- Already sent: **${d.queue.alreadySent}**`,
    `- Already signed: **${d.queue.alreadySigned}**`,
    `- Duplicates: **${d.queue.duplicates}**`,
    `- Invalid emails: **${d.queue.invalidEmails}**`,
    `- Manual review: **${d.queue.manualReview}**`,
    `- Blocked: **${d.queue.blocked}**`,
    `- Queue remaining: **${d.queue.queueRemaining}**`,
    "",
    "## Batch History",
    "",
  );

  if (d.batchHistory.length === 0) {
    lines.push("_No batches recorded today._", "");
  } else {
    for (const batch of d.batchHistory.slice(0, 12)) {
      lines.push(
        `### ${batch.sourceLabel}`,
        "",
        `- Trigger: **${batch.trigger}**${batch.dryRun ? " (dry run)" : ""}`,
        `- Window: ${batch.startAt} → ${batch.endAt} (${batch.durationMs}ms)`,
        `- Evaluated: ${batch.candidatesEvaluated ?? "—"}`,
        `- Recruiters assigned: **${batch.recruitersAssigned}**`,
        `- Workflow transitions: **${batch.workflowTransitions}**`,
        `- Paperwork sent: **${batch.paperworkSent}**`,
        `- Failures: **${batch.failures}**`,
        "",
      );
    }
  }

  lines.push(
    "## Safety Checks",
    "",
    `- Duplicate protection: **${d.safety.duplicateProtectionActive ? "active" : "off"}**`,
    `- Active signature protection: **${d.safety.activeSignatureProtectionActive ? "active" : "off"}**`,
    `- Invalid email protection: **${d.safety.invalidEmailProtectionActive ? "active" : "off"}**`,
    `- Already-sent protection: **${d.safety.alreadySentProtectionActive ? "active" : "off"}**`,
    `- Breezy write protection: **${d.safety.breezyWriteProtectionActive ? "active" : "off"}**`,
    `- Caps active: **${d.safety.capsActive ? "yes" : "no"}** (${d.runner.maxSendsPerCycle} sends, ${d.runner.maxAssignmentsPerCycle} assignments)`,
    `- Stop on error: **${d.safety.stopOnErrorActive ? "yes" : "no"}**`,
    "",
    "## Continuous Mode",
    "",
    `- Enabled: **${d.continuousMode.enabled}**`,
    `- UI control: **disabled** (display only)`,
    `- Note: ${d.continuousMode.note}`,
    "",
    "## Recommendation",
    "",
    `**${RECOMMENDATION_LABELS[d.recommendation] ?? d.recommendation}**`,
    "",
    d.recommendationDetail,
    "",
  );

  if (input.warnings && input.warnings.length > 0) {
    lines.push("## Warnings", "");
    for (const warning of input.warnings) {
      lines.push(`- ${warning}`);
    }
    lines.push("");
  }

  if (input.validation) {
    lines.push("## Validation", "");
    for (const [key, value] of Object.entries(input.validation)) {
      lines.push(`- ${key}: **${String(value)}**`);
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}
