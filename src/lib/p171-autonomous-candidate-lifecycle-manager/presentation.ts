import type { P171LifecycleConsole } from "@/lib/p171-autonomous-candidate-lifecycle-manager/types";

export function lifecycleStateLabel(state: string): string {
  return state.replace(/_/g, " ");
}

export function statusTone(status: string): "success" | "warning" | "critical" | "neutral" {
  if (status === "running") return "success";
  if (status === "idle") return "neutral";
  return "warning";
}

export function healthTone(label: string): string {
  switch (label) {
    case "healthy":
      return "text-emerald-300";
    case "warning":
      return "text-amber-300";
    case "critical":
      return "text-red-300";
    default:
      return "text-zinc-400";
  }
}

export function formatP171Markdown(console: P171LifecycleConsole): string {
  const lines = [
    "# P171 Autonomous Candidate Lifecycle Manager",
    "",
    `Generated: ${console.generatedAt}`,
    "",
    "## Status",
    `- Status: ${console.statusLabel}`,
    `- Enabled: ${console.enabled}`,
    `- Paused: ${console.paused}`,
    `- Health: ${console.health.label} (${console.health.score})`,
    "",
    "## Last cycle",
    `- At: ${console.lastCycle.at ?? "never"} (${console.lastCycle.agoLabel})`,
    `- Duration: ${console.lastCycle.durationMs ?? "—"}ms`,
    `- Processed: ${console.lastCycle.candidatesProcessed}`,
    `- Paperwork sent: ${console.lastCycle.paperworkSent}`,
    `- Reminders sent: ${console.lastCycle.remindersSent}`,
    `- Ready for MEL: ${console.lastCycle.readyForMel}`,
    `- Waiting signature: ${console.lastCycle.waitingSignature}`,
  ];

  lines.push(
    "",
    "## Metrics",
    `- Processed today: ${console.metrics.candidatesProcessedToday}`,
    `- Automation success rate: ${console.metrics.automationSuccessRate}%`,
    `- Exception rate: ${console.metrics.exceptionRate}%`,
    `- Recruiter interventions saved: ${console.metrics.recruiterInterventionsSaved}`,
    "",
    "## State distribution",
    ...console.stateDistribution.map((s) => `- ${lifecycleStateLabel(s.state)}: ${s.count}`),
    "",
  );

  if (console.warnings.length > 0) {
    lines.push("## Warnings", ...console.warnings.map((w) => `- ${w}`), "");
  }

  return lines.join("\n");
}
