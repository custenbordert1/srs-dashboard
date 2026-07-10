import type { P169OperationsConsole } from "@/lib/p169-autonomous-recruiting-orchestrator/types";

export function outcomeLabel(outcome: string): string {
  return outcome.replace(/_/g, " ");
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

export function formatP169Markdown(console: P169OperationsConsole): string {
  const lines = [
    "# P169 Autonomous Recruiting Orchestrator",
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
    `- Evaluated: ${console.lastCycle.candidatesEvaluated}`,
    `- Paperwork sent: ${console.lastCycle.paperworkSent}`,
    `- Skipped: ${console.lastCycle.skipped}`,
    `- Exceptions: ${console.lastCycle.exceptions}`,
    "",
    "## Next cycle",
    `- At: ${console.nextCycle.at ?? "—"}`,
    `- In: ${console.nextCycle.inLabel}`,
    "",
    "## Runner & scheduler",
    `- Runner: ${console.runner.status} (${console.runner.healthy ? "healthy" : "unhealthy"})`,
    `- Scheduler: ${console.scheduler.recommendation}`,
    `- Dropbox used today: ${console.dropbox.usedToday} / ${console.dropbox.currentBudget}`,
    "",
  ];

  if (console.warnings.length > 0) {
    lines.push("## Warnings", ...console.warnings.map((w) => `- ${w}`), "");
  }

  return lines.join("\n");
}
