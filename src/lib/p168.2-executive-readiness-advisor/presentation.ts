import type { P1682ExecutiveReadinessAdvisorReport, P1682Trend } from "@/lib/p168.2-executive-readiness-advisor/types";

export function trendArrow(trend: P1682Trend): string {
  if (trend === "Improving") return "↑";
  if (trend === "Declining") return "↓";
  return "→";
}

export function trendTone(trend: P1682Trend): "success" | "warning" | "critical" | "neutral" {
  if (trend === "Improving") return "success";
  if (trend === "Declining") return "critical";
  return "neutral";
}

export function formatP1682Markdown(report: P1682ExecutiveReadinessAdvisorReport): string {
  const r = report.currentReadiness;
  const lines = [
    "# P168.2 — Executive Readiness Advisor",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## Why waiting",
    "",
    report.whyWaiting,
    "",
    "## Current readiness",
    "",
    `- Executive readiness: **${r.executiveReadinessPercent}%**`,
    `- ${r.gateProgressLabel}`,
    `- Score: ${r.currentScore} / ${r.requiredScore} (${r.remainingPoints} points remaining)`,
    "",
    "## Estimated ready",
    "",
    `- At: ${report.estimatedReady.estimatedReadyAt ?? "—"}`,
    `- Confidence: ${report.estimatedReady.confidence}%`,
    `- Projected sends: ${report.estimatedReady.projectedSends}`,
    `- Projected Dropbox: ${report.estimatedReady.projectedDropboxRequests}`,
    "",
    "## Gate progress",
    "",
    `${report.recommendationProgress.gatesComplete} / ${report.recommendationProgress.gatesTotal} complete (${report.recommendationProgress.percentComplete}%)`,
    "",
    report.recommendationProgress.progressBar,
    "",
    "## Required actions",
    "",
    ...report.actionPlan
      .filter((a) => !a.complete)
      .map((a) => `- [ ] ${a.label} (${a.currentValue} → ${a.targetValue})`),
    "",
    "## What changed",
    "",
    report.delta.sinceLabel,
    "",
  ];

  if (report.delta.hasPrevious) {
    lines.push(
      `- Queue: ${report.delta.queue.before} → ${report.delta.queue.after} ${trendArrow(report.delta.queue.trend)}`,
      `- Readiness: ${report.delta.readiness.before ?? "—"} → ${report.delta.readiness.after ?? "—"} ${trendArrow(report.delta.readiness.trend)}`,
      `- Deferred: ${report.delta.deferredBacklog.before} → ${report.delta.deferredBacklog.after} ${trendArrow(report.delta.deferredBacklog.trend)}`,
      `- Decision score: ${report.delta.decisionScore.before} → ${report.delta.decisionScore.after} ${trendArrow(report.delta.decisionScore.trend)}`,
      `- Recommendation: ${report.delta.recommendation.summary}`,
    );
  }

  lines.push("", "## Timeline", "");
  for (const t of report.timeline) {
    lines.push(
      `- ${t.at} | ${t.recommendation} | ${t.confidence}% | score ${t.decisionScore} | ${t.trend}`,
    );
  }

  return lines.join("\n");
}
