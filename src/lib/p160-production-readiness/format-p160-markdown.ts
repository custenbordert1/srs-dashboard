import type { P160ProductionReadinessReport } from "@/lib/p160-production-readiness/types";

const RECOMMENDATION_LABELS: Record<string, string> = {
  ready_for_server_deployment: "Ready for server deployment",
  ready_for_observation_mode: "Ready for observation mode",
  ready_for_controlled_production: "Ready for controlled production",
  not_ready: "Not ready",
};

const LEVEL_LABELS: Record<string, string> = {
  ready: "Ready",
  warning: "Warning",
  blocked: "Blocked",
};

export function formatP160ProductionReadinessMarkdown(input: {
  report: P160ProductionReadinessReport;
  validation?: Record<string, unknown>;
}): string {
  const r = input.report;
  const lines = [
    "# P160 — Production Readiness & Deployment Center",
    "",
    `Generated: ${r.generatedAt}`,
    "",
    "## Overall Readiness Score",
    "",
    `**${r.overallReadinessScore}/100**`,
    "",
    `**Recommendation:** ${RECOMMENDATION_LABELS[r.recommendation] ?? r.recommendation}`,
    "",
    r.recommendationDetail,
    "",
    "## Infrastructure",
    "",
    `- Build: **${LEVEL_LABELS[r.infrastructure.buildStatus]}** — ${r.infrastructure.buildDetail}`,
    `- Node: **${r.infrastructure.nodeVersion}** (${r.infrastructure.nodeCompatible ? "compatible" : "incompatible"})`,
    `- Runtime health: **${LEVEL_LABELS[r.infrastructure.runtimeHealth]}**`,
    `- Server: ${r.infrastructure.serverCompatibility}`,
    "",
    "### Secrets",
    "",
  ];

  for (const item of r.infrastructure.secretsConfigured) {
    lines.push(`- **${item.label}**: ${LEVEL_LABELS[item.status]} — ${item.detail}`);
  }

  lines.push("", "## Integrations", "", `Overall: **${LEVEL_LABELS[r.integrations.overall]}**`, "");
  for (const item of r.integrations.items) {
    lines.push(`- **${item.label}**: ${LEVEL_LABELS[item.status]} — ${item.detail}`);
  }

  lines.push("", "## Automation Readiness", "", `Overall: **${LEVEL_LABELS[r.automation.overall]}**`, "");
  for (const phase of r.automation.phases) {
    lines.push(`### ${phase.label}`, "");
    lines.push(`- Status: **${LEVEL_LABELS[phase.status]}**`);
    lines.push(`- ${phase.detail}`);
    if (phase.components?.length) {
      for (const c of phase.components) lines.push(`  - ${c}`);
    }
    lines.push("");
  }

  lines.push("## Safety Checklist", "", `Overall: **${LEVEL_LABELS[r.safety.overall]}**`, "");
  for (const item of r.safety.items) {
    lines.push(`- **${item.label}**: ${LEVEL_LABELS[item.status]} — ${item.detail}`);
  }

  lines.push("", "## Deployment Checklist", "", `Overall: **${LEVEL_LABELS[r.deployment.overall]}**`, "");
  for (const item of r.deployment.items) {
    lines.push(`- [${item.status.toUpperCase()}] ${item.step} — ${item.detail}`);
  }

  lines.push("", "## Risk Assessment", "");
  for (const severity of ["critical", "high", "medium", "low"] as const) {
    const items = r.risks[severity];
    lines.push(`### ${severity.charAt(0).toUpperCase()}${severity.slice(1)} (${items.length})`, "");
    if (items.length === 0) {
      lines.push("_None_", "");
    } else {
      for (const risk of items) {
        lines.push(`- **${risk.title}** — ${risk.detail}`);
        lines.push(`  - Mitigation: ${risk.mitigation}`);
      }
      lines.push("");
    }
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
