import type { P1681ExecutiveDecisionCenterView } from "@/lib/p168.1-executive-decision-center/types";

export function formatP1681Markdown(view: P1681ExecutiveDecisionCenterView): string {
  const lines = [
    "# P168.1 — Executive Decision Center",
    "",
    `Generated: ${view.generatedAt}`,
    "",
    "## System status",
    "",
    `- Observation mode: ${view.systemStatus.observationMode ? "Active" : "Off"}`,
    `- Runner: ${view.systemStatus.runnerStatus}`,
    `- Continuous mode: ${view.systemStatus.continuousMode}`,
    `- Daemon: ${view.systemStatus.daemonActive ? "Running" : "Stopped"}`,
    `- Production readiness: ${view.systemStatus.productionReadinessScore ?? "—"}`,
    `- **Executive decision score:** ${view.systemStatus.decisionScore} (${view.systemStatus.decisionGrade})`,
    "",
    "## Current recommendation",
    "",
    `- Action: **${view.recommendation.action.replace(/_/g, " ")}**`,
    `- Title: ${view.recommendation.title}`,
    `- Confidence: ${view.recommendation.confidence}%`,
    `- Reason: ${view.recommendation.reason}`,
    `- Expected sends: ${view.recommendation.expectedSends}`,
    `- Queue reduction: ${view.recommendation.expectedQueueReduction}`,
    `- Dropbox requests: ${view.recommendation.projectedDropboxRequests}`,
    "",
    "## Gate checklist",
    "",
    ...view.blocking.checklist.map((c) => `- ${c.pass ? "✓" : "✕"} ${c.label}${c.detail ? ` — ${c.detail}` : ""}`),
    "",
    "## Last execution",
    "",
    `- At: ${view.lastExecution.at ?? "—"}`,
    `- Sent: ${view.lastExecution.paperworkSent ?? "—"}`,
    `- Duration: ${view.lastExecution.durationMs ?? "—"}ms`,
    `- Dropbox API: ${view.lastExecution.dropboxRequests ?? "—"}`,
    `- Errors: ${view.lastExecution.errors ?? "—"}`,
    "",
    "## Approval history",
    "",
  ];

  if (view.history.length === 0) {
    lines.push("_No history._");
  } else {
    for (const h of view.history) {
      lines.push(`- ${h.at} | ${h.executive} | ${h.recommendation} | ${h.result ?? "—"} | sent ${h.paperworkSent ?? "—"}`);
    }
  }

  return lines.join("\n");
}
