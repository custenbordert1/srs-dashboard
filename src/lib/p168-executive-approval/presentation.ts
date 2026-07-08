import type { P168ExecutiveApprovalReport } from "@/lib/p168-executive-approval/approval-types";

const ACTION_LABELS: Record<P168ExecutiveApprovalReport["recommendation"]["action"], string> = {
  WAIT: "Wait",
  RUN_NEXT_BATCH: "Run next batch",
  HOLD_INVESTIGATION: "Hold — investigation",
  NO_ACTION_REQUIRED: "No action required",
};

function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m ${sec % 60}s`;
}

export function formatP168Markdown(report: P168ExecutiveApprovalReport): string {
  const r = report.recommendation;
  const lines = [
    "# P168 — Executive Approval Queue",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## Current recommendation",
    "",
    `- **Action:** ${ACTION_LABELS[r.action]} (\`${r.action}\`)`,
    `- **Title:** ${r.title}`,
    `- **Confidence:** ${r.confidence}%`,
    `- **Reason:** ${r.reason}`,
    `- **Expected sends:** ${r.expectedSends}`,
    `- **Expected Dropbox API:** ${r.expectedDropboxApiRequests}`,
    `- **Expected queue reduction:** ${r.expectedQueueReduction}`,
    `- **Estimated duration:** ${formatDuration(r.estimatedDurationMs)}`,
    `- **Risk level:** ${r.riskLevel}`,
    `- **Scheduler:** ${r.schedulerRecommendation}`,
    "",
    "### Blocking factors",
    ...(r.blockingFactors.length ? r.blockingFactors.map((f) => `- ${f}`) : ["- None"]),
    "",
    "## Safety",
    "",
    `- Continuous mode: ${report.safety.continuousModeEnabled}`,
    `- Daemon active: ${report.safety.daemonActive}`,
    `- Processing lock: ${report.safety.processingLockHeld}`,
    `- Live cycle env: ${report.safety.liveCycleEnvEnabled}`,
    `- Manual approval required: ${report.safety.manualOperatorApprovalRequired}`,
    "",
    "## Last execution",
    "",
    `- At: ${report.lastExecution.at ?? "—"}`,
    `- Executive: ${report.lastExecution.executiveEmail ?? "—"}`,
    `- Paperwork sent: ${report.lastExecution.paperworkSent ?? "—"}`,
    `- Duration: ${formatDuration(report.lastExecution.durationMs)}`,
    `- Dropbox requests: ${report.lastExecution.dropboxRequests ?? "—"}`,
    `- Errors: ${report.lastExecution.errors ?? "—"}`,
    `- Result: ${report.lastExecution.result ?? "—"}`,
    "",
    "## Approval history (recent)",
    "",
  ];

  if (report.history.length === 0) {
    lines.push("_No approval history yet._");
  } else {
    lines.push("| Time | Executive | Action | Approved | Executed | Result | Sent |");
    lines.push("| --- | --- | --- | --- | --- | --- | --- |");
    for (const h of report.history) {
      lines.push(
        `| ${h.at} | ${h.executiveEmail ?? h.executiveUserId} | ${h.recommendation} | ${h.approved} | ${h.executed} | ${h.result ?? "—"} | ${h.paperworkSent ?? "—"} |`,
      );
    }
  }

  if (report.warnings.length) {
    lines.push("", "## Warnings", "");
    for (const w of report.warnings) lines.push(`- ${w}`);
  }

  return lines.join("\n");
}

export function actionLabel(action: P168ExecutiveApprovalReport["recommendation"]["action"]): string {
  return ACTION_LABELS[action];
}

export function riskTone(level: P168ExecutiveApprovalReport["recommendation"]["riskLevel"]) {
  if (level === "low") return "success" as const;
  if (level === "medium") return "warning" as const;
  return "critical" as const;
}
