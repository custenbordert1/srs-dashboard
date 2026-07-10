import type { P179OperatorSendValidationReport } from "@/lib/p179-operator-controlled-send-gate-profile/types";

export function formatP179Markdown(report: P179OperatorSendValidationReport): string {
  const s = report.summary;
  const op = report.gateProfiles.operator;
  const auto = report.gateProfiles.autonomous;

  const lines = [
    "# P179 — Operator Controlled Send Gate Profile",
    "",
    `Generated: ${report.generatedAt}`,
    "Mode: read-only validation (no sends, no automation enablement)",
    "",
    "## Gate profile summary",
    "",
    `| Profile | Pass | Blocking | Warnings |`,
    `| --- | --- | ---: | ---: |`,
    `| **operator** | ${op.pass ? "yes" : "no"} | ${op.blockingFactors.length} | ${op.warnings.length} |`,
    `| **autonomous** | ${auto.pass ? "yes" : "no"} | ${auto.blockingFactors.length} | ${auto.warnings.length} |`,
    "",
    "## Send readiness (P178 cohort)",
    "",
    `- Paperwork-ready candidates: **${s.paperworkReadyCount}**`,
    `- Operator gate profile pass: **${(s as { operatorGateProfilePass?: boolean }).operatorGateProfilePass ? "yes" : "no"}**`,
    `- Operator batch send allowed: **${s.operatorSendAllowed ? "yes" : "no"}**`,
    `- Autonomous send allowed: **${s.autonomousSendAllowed ? "yes" : "no"}**`,
    `- Max sends within Dropbox budget: **${(s as { maxSendsWithinDropboxBudget?: number }).maxSendsWithinDropboxBudget ?? "—"}**`,
    `- Projected send count (operator): **${s.projectedSendCount}**`,
    `- Projected Dropbox API calls: **${s.projectedDropboxApiCalls}** (within budget: ${s.dropboxWithinBudget ? "yes" : "no"})`,
    "",
    "## Operator warnings (informational only)",
    "",
  ];

  if (op.warnings.length === 0) lines.push("- None");
  else for (const w of op.warnings) lines.push(`- ${w}`);

  lines.push("", "## Autonomous blockers", "");
  if (auto.blockingFactors.length === 0) lines.push("- None");
  else for (const b of auto.blockingFactors) lines.push(`- ${b}`);

  lines.push("", "## Operator hard blockers", "");
  if (op.blockingFactors.length === 0) lines.push("- None");
  else for (const b of op.blockingFactors) lines.push(`- ${b}`);

  lines.push("", "## Candidates", "");
  lines.push("| Name | P157 | P152 | Operator | Autonomous |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const c of report.candidates) {
    lines.push(
      `| ${c.name.slice(0, 22)} | ${c.p157Action ?? "—"} | ${c.p152Eligible ? "yes" : "no"} | ${c.operatorSendAllowed ? "allowed" : "blocked"} | ${c.autonomousSendAllowed ? "allowed" : "blocked"} |`,
    );
  }

  lines.push("", "## Safety", "");
  for (const item of report.safetyConfirmation) lines.push(`- ${item}`);

  return `${lines.join("\n")}\n`;
}
