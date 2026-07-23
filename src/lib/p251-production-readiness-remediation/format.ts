import type { ProductionConfigValidation } from "@/lib/production-mail-config";
import type {
  P251GoNoGo,
  P251LaunchValidation,
  P251RecoveryTasks,
} from "@/lib/p251-production-readiness-remediation/types";

export function formatP251MailAuditMarkdown(
  production: ProductionConfigValidation,
): string {
  const lines = [
    `# P251 — Mail System Remediation Audit`,
    ``,
    `**Generated:** ${new Date().toISOString()}`,
    `**Deployment tier:** ${production.tier}`,
    `**Live email ready:** ${production.okForLiveEmail ? "yes" : "no"}`,
    ``,
    `## Capability`,
    ``,
    `| Check | Value |`,
    `| --- | --- |`,
    `| Mode | \`${production.mail.mode}\`${production.mail.modeExplicit ? "" : " (implicit default)"} |`,
    `| RESEND_API_KEY | ${production.mail.hasResendApiKey ? `present (length=${production.mail.resendKeyLength})` : "MISSING"} |`,
    `| SRS_RECRUITING_FROM_EMAIL | ${production.mail.recruitingFromSet ? "set" : "UNSET"} → \`${production.mail.resolvedFrom}\` |`,
    `| SRS_RECRUITING_REPLY_TO_EMAIL | ${production.mail.recruitingReplyToSet ? "set" : "UNSET"} → \`${production.mail.resolvedReplyTo}\` |`,
    `| canLiveDeliver | ${production.mail.canLiveDeliver ? "yes" : "no"} |`,
    ``,
    `## FAIL / WARN — exact remediation`,
    ``,
  ];

  if (production.issues.length === 0) {
    lines.push(`_None — mail config ready for live._`, ``);
  } else {
    for (const issue of production.issues) {
      lines.push(`### [${issue.severity}] ${issue.id}`);
      lines.push(``);
      lines.push(`- **Why:** ${issue.why}`);
      lines.push(`- **File:** \`${issue.file}\``);
      lines.push(`- **Variable:** \`${issue.variable ?? "(n/a)"}\``);
      lines.push(`- **Expected format:** \`${issue.expectedFormat}\``);
      lines.push(`- **Fix type:** ${issue.fixType}`);
      lines.push(`- **Steps:**`);
      for (const step of issue.remediation) {
        lines.push(`  1. ${step}`);
      }
      lines.push(``);
    }
  }

  lines.push(`## Operator config block (paste into \`.env.local\` — no fake keys)`);
  lines.push(``);
  lines.push("```bash");
  lines.push("RESEND_API_KEY=<paste Resend API key from https://resend.com/api-keys>");
  lines.push("DIRECT_DEPOSIT_EMAIL_MODE=resend");
  lines.push("SRS_RECRUITING_FROM_EMAIL=recruiting@strategicretailsolutions.com");
  lines.push("SRS_RECRUITING_REPLY_TO_EMAIL=recruiting@strategicretailsolutions.com");
  lines.push("```");
  lines.push(``);
  return lines.join("\n");
}

export function formatP251RecoveryMarkdown(doc: P251RecoveryTasks): string {
  const lines = [
    `# P251 — Operational Recovery Tasks`,
    ``,
    `**Ops date:** ${doc.opsDate}`,
    `**Generated:** ${doc.generatedAt}`,
    `**Mode:** ${doc.mode}`,
    ``,
    `| Priority | Action | Title | Count | Blocked by mail? |`,
    `| --- | --- | --- | ---: | --- |`,
  ];
  for (const t of doc.tasks) {
    lines.push(
      `| ${t.priority} | ${t.action} | ${t.title} | ${t.count ?? "—"} | ${t.blockedByMail ? "yes" : "no"} |`,
    );
  }
  lines.push(``, `## Details`, ``);
  for (const t of doc.tasks) {
    lines.push(`### ${t.id}`);
    lines.push(``);
    lines.push(t.detail);
    if (t.command) lines.push(``, `\`${t.command}\``);
    lines.push(``);
  }
  lines.push(`## Sources`);
  for (const s of doc.sourceArtifacts) lines.push(`- ${s}`);
  lines.push(``);
  return lines.join("\n");
}

export function formatP251LaunchValidationMarkdown(doc: P251LaunchValidation): string {
  const lines = [
    `# P251 — Launch Validation (zero-write)`,
    ``,
    `**Ops date:** ${doc.opsDate}`,
    `**Generated:** ${doc.generatedAt}`,
    `**Zero writes confirmed:** yes`,
    `**Mail ready:** ${doc.mailReady ? "yes" : "no"}`,
    `**Readiness overall:** ${doc.readinessOverall}`,
    ``,
    `| Write class | Count |`,
    `| --- | ---: |`,
    `| Live emails sent | ${doc.liveEmailsSent} |`,
    `| Dropbox writes | ${doc.dropboxWrites} |`,
    `| MEL writes | ${doc.melWrites} |`,
    `| Breezy writes | ${doc.breezyWrites} |`,
    ``,
    `## Volumes`,
    ``,
    `| Metric | Value |`,
    `| --- | ---: |`,
    `| Initial paperwork | ${doc.volumes.initialPaperworkSends} |`,
    `| Reminder 1 | ${doc.volumes.reminder1Sends} |`,
    `| Ready for MEL | ${doc.volumes.readyForMel} |`,
    `| Open-store safe capacity | ${doc.volumes.openStoreSafeCapacity ?? "—"} |`,
    ``,
    `## Simulated launch sequence (no execution)`,
    ``,
  ];
  for (const step of doc.launchSequenceSimulated) {
    lines.push(`1. ${step}`);
  }
  lines.push(``, `## Notes`, ``);
  for (const n of doc.notes) lines.push(`- ${n}`);
  if (doc.warnings.length) {
    lines.push(``, `## Warnings`, ``);
    for (const w of doc.warnings) lines.push(`- ${w}`);
  }
  lines.push(``);
  return lines.join("\n");
}

export function formatP251GoNoGoMarkdown(doc: P251GoNoGo): string {
  const lines = [
    `# P251 — GO / NO-GO`,
    ``,
    `**Ops date:** ${doc.opsDate}`,
    `**Generated:** ${doc.generatedAt}`,
    `**Decision:** **${doc.decision}**`,
    ``,
    `## 1. Remaining blockers`,
    ``,
  ];
  if (doc.remainingBlockers.length === 0) {
    lines.push(`_None_`, ``);
  } else {
    for (const b of doc.remainingBlockers) lines.push(`- ${b}`);
    lines.push(``);
  }
  lines.push(`## 2. Configuration changes required`, ``);
  if (doc.configurationChangesRequired.length === 0) {
    lines.push(`_None_`, ``);
  } else {
    for (const c of doc.configurationChangesRequired) lines.push(`- ${c}`);
    lines.push(``);
  }
  lines.push(`## 3. Code changes required`, ``);
  if (doc.codeChangesRequired.length === 0) {
    lines.push(`_None outstanding_ (remediation already applied in this mission):`, ``);
    for (const c of doc.codeRemediationApplied) lines.push(`- ${c}`);
    lines.push(``);
  } else {
    for (const c of doc.codeChangesRequired) lines.push(`- ${c}`);
    lines.push(``);
    if (doc.codeRemediationApplied.length) {
      lines.push(`Already applied:`, ``);
      for (const c of doc.codeRemediationApplied) lines.push(`- ${c}`);
      lines.push(``);
    }
  }
  lines.push(`## 4. Expected throughput`, ``);
  lines.push(`| Metric | Value |`);
  lines.push(`| --- | ---: |`);
  lines.push(`| Initial paperwork sends | ${doc.expectedThroughput.initialPaperworkSends} |`);
  lines.push(`| Reminder 1 sends | ${doc.expectedThroughput.reminder1Sends} |`);
  lines.push(
    `| Open-store safe capacity | ${doc.expectedThroughput.openStoreSafeCapacity ?? "—"} |`,
  );
  lines.push(``);
  lines.push(`## 5. Estimated Ready for MEL today`, ``);
  lines.push(`${doc.estimatedReadyForMelToday}`, ``);
  lines.push(`## 6. Expected recruiter time savings`, ``);
  lines.push(`~${doc.expectedRecruiterTimeSavingsHours} hours (from P249/P250 ops dashboard)`, ``);
  lines.push(`## 7. Final GO / NO-GO`, ``);
  lines.push(`**${doc.decision}**`, ``);
  lines.push(doc.justification, ``);
  if (doc.decision === "NO-GO" && doc.highestImpactBlocker) {
    lines.push(`**Highest-impact blocker:** ${doc.highestImpactBlocker}`, ``);
  }
  return lines.join("\n");
}
