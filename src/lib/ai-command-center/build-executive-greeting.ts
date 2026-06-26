import type { CommandCenterChatContext } from "@/lib/ai-command-center/build-chat-context";
import { resolveDailyBriefGreeting } from "@/lib/executive-daily-brief/format-executive-daily-brief";
import type { ExecutiveGreetingSnapshot } from "@/lib/ai-command-center/types";

function capitalizeHealth(status: string): string {
  if (!status) return "Unknown";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function recruitingHealthPercent(context: CommandCenterChatContext): number | null {
  const { healthy, total } = context.orchestrator.workflowHealth;
  if (total <= 0) return null;
  return Math.round((healthy / total) * 100);
}

function buildTodayPriorities(context: CommandCenterChatContext): string[] {
  const priorities: string[] = [];
  const { brief, governance } = context;

  const topMarket = brief.highestRiskMarket ?? brief.marketsNeedingGrowth[0];
  if (topMarket) {
    const label = topMarket.marketLabel.split("—")[0]?.trim() || topMarket.marketLabel;
    priorities.push(`${label} coverage`);
  } else if (context.operations.criticalAlerts[0]) {
    priorities.push(context.operations.criticalAlerts[0].reason.slice(0, 64));
  }

  const pendingPackets = brief.metrics.pendingSignatures;
  if (pendingPackets > 0) {
    priorities.push(`${pendingPackets} paperwork packet${pendingPackets === 1 ? "" : "s"}`);
  }

  const executiveApprovals = governance.executiveMetrics.executiveApprovalRequired;
  if (executiveApprovals > 0) {
    priorities.push(`${executiveApprovals} executive approval${executiveApprovals === 1 ? "" : "s"}`);
  }

  if (priorities.length === 0 && context.operations.executiveRecommendations[0]) {
    priorities.push(context.operations.executiveRecommendations[0].slice(0, 72));
  }

  if (priorities.length === 0 && brief.risks[0]?.count) {
    priorities.push(`${brief.risks[0].count} ${brief.risks[0].label}`);
  }

  return priorities.slice(0, 4);
}

export function buildExecutiveGreeting(
  context: CommandCenterChatContext,
  executiveFirstName?: string,
): ExecutiveGreetingSnapshot {
  const referenceMs = Date.parse(context.fetchedAt);
  const timeGreeting = resolveDailyBriefGreeting(referenceMs);
  const firstName = executiveFirstName?.trim() || "there";
  const headline = `${timeGreeting} ${firstName}.`;

  const recruitingHealth = recruitingHealthPercent(context);
  const operationsHealthLabel = capitalizeHealth(context.operations.systemHealth.status);
  const automationReadiness = context.orchestrator.readinessScore.overall;
  const todayPriorities = buildTodayPriorities(context);
  const closing = "How can I help?";

  const lines = [
    headline,
    "",
    `Recruiting Health: ${recruitingHealth ?? "—"}%`,
    `Operations Health: ${operationsHealthLabel}`,
    `Automation Readiness: ${automationReadiness}%`,
    "",
    "Today's priorities:",
    "",
  ];

  if (todayPriorities.length === 0) {
    lines.push("• No urgent priorities flagged in this preview snapshot.");
  } else {
    for (const item of todayPriorities) {
      lines.push(`• ${item}`);
    }
  }

  lines.push("", closing);

  return {
    headline,
    recruitingHealthPercent: recruitingHealth,
    operationsHealthLabel,
    automationReadinessPercent: automationReadiness,
    todayPriorities,
    closing,
    formattedText: lines.join("\n"),
  };
}
