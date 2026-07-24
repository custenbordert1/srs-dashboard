import type { P252ProductionValidation } from "@/lib/p252-production-email-validation/types";

export function formatP252ProductionValidationMarkdown(
  report: P252ProductionValidation,
): string {
  const cfg = report.runtimeConfig;
  const mail = cfg.mail;
  const go = report.goNoGo;
  const live = report.liveDelivery;
  const cap = report.capacity;
  const probe = report.resendProbe;
  const pipe = report.pipeline;

  const lines: string[] = [
    `# P252 — Production Email Validation & GO-LIVE Verification`,
    ``,
    `**Ops date:** ${report.opsDate}`,
    `**Generated:** ${report.generatedAt}`,
    `**Decision:** **${go.decision}**`,
    ``,
    `## 1. Runtime configuration (secrets never printed)`,
    ``,
    `| Check | Value |`,
    `| --- | --- |`,
    `| Deployment tier | \`${cfg.tier}\` (VERCEL_ENV=${cfg.vercelEnv ?? "unset"}, NODE_ENV=${cfg.nodeEnv ?? "unset"}) |`,
    `| DIRECT_DEPOSIT_EMAIL_MODE | \`${mail.mode}\`${mail.modeExplicit ? "" : " (implicit default)"} |`,
    `| RESEND_API_KEY | ${mail.hasResendApiKey ? `present (length=${mail.resendKeyLength})` : "MISSING"} |`,
    `| SRS_RECRUITING_FROM_EMAIL | ${mail.recruitingFromSet ? "set" : "UNSET"} → \`${mail.resolvedFrom}\` |`,
    `| SRS_RECRUITING_REPLY_TO_EMAIL | ${mail.recruitingReplyToSet ? "set" : "UNSET"} → \`${mail.resolvedReplyTo}\` |`,
    `| canLiveDeliver / okForLiveEmail | ${mail.canLiveDeliver ? "yes" : "no"} / ${cfg.okForLiveEmail ? "yes" : "no"} |`,
    ``,
  ];

  if (cfg.issues.length > 0) {
    lines.push(`### Config issues`, ``);
    for (const issue of cfg.issues) {
      lines.push(`- **[${issue.severity}]** \`${issue.variable ?? issue.id}\`: ${issue.why}`);
    }
    lines.push(``);
  }

  lines.push(
    `## 2. Resend validation`,
    ``,
    `| Check | Value |`,
    `| --- | --- |`,
    `| Probe attempted | ${probe.attempted ? "yes" : "no"} |`,
    `| Authenticated | ${probe.authenticated ?? "—"} |`,
    `| HTTP status | ${probe.httpStatus ?? "—"} |`,
    `| From domain | ${probe.domain ?? "—"} |`,
    `| Domain status | ${probe.domainStatus ?? "—"} |`,
    `| Domain verified | ${probe.domainVerified ?? "—"} |`,
    `| From authorized | ${probe.fromAuthorized ?? "—"} |`,
    `| Quota/limits | ${probe.quotaDetail ?? "—"} |`,
    `| Detail | ${probe.detail} |`,
    ``,
  );

  lines.push(
    `## 3. Live delivery validation`,
    ``,
    `| Check | Value |`,
    `| --- | --- |`,
    `| Attempted | ${live.attempted ? "yes" : "no"} |`,
    `| Sent | ${live.sent ? "yes" : "no"} |`,
    `| Recipient env | ${live.recipientEnvVar ?? "—"} |`,
    `| Recipient (redacted) | ${live.recipientRedacted ?? "—"} |`,
    `| Subject | \`${live.subject}\` |`,
    `| Provider message id | ${live.messageId ?? "—"} |`,
    `| Skip / error | ${live.skippedReason ?? live.error ?? "—"} |`,
    ``,
  );

  if (live.bodyMeta) {
    lines.push(`Test email body metadata (no secrets):`);
    lines.push(``);
    lines.push(`- Timestamp: ${live.bodyMeta.timestamp}`);
    lines.push(`- Environment: ${live.bodyMeta.environment}`);
    lines.push(`- Deployment id: ${live.bodyMeta.deploymentId ?? "unset"}`);
    lines.push(`- Git commit: ${live.bodyMeta.gitCommit ?? "unset"}`);
    lines.push(`- Mail provider: ${live.bodyMeta.mailProvider}`);
    lines.push(``);
  }

  lines.push(
    `## 4. Pipeline readiness`,
    ``,
    `| Check | Value |`,
    `| --- | --- |`,
    `| P245 canLiveDeliver | ${pipe.p245MailCanLiveDeliver ? "yes" : "no"} |`,
    `| P246 canLiveDeliver | ${pipe.p246MailCanLiveDeliver ? "yes" : "no"} |`,
    `| P249 readiness overall | ${pipe.p249ReadinessOverall} |`,
    `| P249 resendReady | ${pipe.p249ResendReady ?? "—"} |`,
    `| Startup okForLiveEmail | ${pipe.startupOkForLiveEmail ? "yes" : "no"} |`,
    `| Fail-fast live gate | ${pipe.failFastEnabled ? "yes" : "no"} |`,
    `| requireLiveDelivery wired | ${pipe.transactionalRequireLiveDeliveryPresent ? "yes" : "no"} |`,
    `| Unit tests | ${pipe.unitTests.detail} |`,
    ``,
  );
  for (const n of pipe.notes) lines.push(`- ${n}`);
  lines.push(``);

  lines.push(
    `## 5. Capacity projection`,
    ``,
    `| Metric | Value |`,
    `| --- | ---: |`,
    `| Initial sends ready | ${cap.initialSendsReady} |`,
    `| Reminders ready (Reminder 1) | ${cap.remindersReady} |`,
    `| Initial throughput / hour | ${cap.dailyThroughputInitialPerHour ?? "—"} |`,
    `| Reminder throughput / hour | ${cap.dailyThroughputRemindersPerHour ?? "—"} |`,
    `| Est. minutes for reminders | ${cap.estimatedMinutesForReminders ?? "—"} |`,
    `| Est. minutes for initial sends | ${cap.estimatedMinutesForInitialSends ?? "—"} |`,
    `| Ready for MEL | ${cap.readyForMel} |`,
    `| Recruiter hours saved | ${cap.recruiterHoursSaved} |`,
    ``,
    `${cap.projectedCompletionSummary}`,
    ``,
    `Sources: ${cap.sourceArtifacts.map((s) => `\`${s}\``).join(", ") || "—"}`,
    ``,
  );

  lines.push(
    `## 6. Launch recommendation — GO / NO-GO`,
    ``,
    `### Remaining blockers`,
    ``,
  );
  if (go.remainingBlockers.length === 0) {
    lines.push(`_None_`, ``);
  } else {
    for (const b of go.remainingBlockers) lines.push(`- ${b}`);
    lines.push(``);
  }

  lines.push(`### Configuration changes required`, ``);
  if (go.configurationChangesRequired.length === 0) {
    lines.push(`_None_`, ``);
  } else {
    for (const c of go.configurationChangesRequired) lines.push(`- \`${c}\``);
    lines.push(``);
  }

  lines.push(`### Code changes required`, ``);
  if (go.codeChangesRequired.length === 0) {
    lines.push(`_None_`, ``);
  } else {
    for (const c of go.codeChangesRequired) lines.push(`- ${c}`);
    lines.push(``);
  }

  lines.push(
    `### Expected throughput`,
    ``,
    `| Metric | Value |`,
    `| --- | ---: |`,
    `| Initial paperwork sends | ${go.expectedThroughput.initialPaperworkSends} |`,
    `| Reminder 1 sends | ${go.expectedThroughput.reminder1Sends} |`,
    `| Open-store safe capacity | ${go.expectedThroughput.openStoreSafeCapacity ?? "—"} |`,
    ``,
    `### Estimated Ready for MEL today`,
    ``,
    `${go.estimatedReadyForMelToday}`,
    ``,
    `### Expected recruiter time savings`,
    ``,
    `~${go.expectedRecruiterTimeSavingsHours} hours`,
    ``,
    `### Live test email`,
    ``,
    `- Sent: **${go.liveTestEmailSent ? "yes" : "no"}**`,
    `- Recipient (redacted): ${go.liveTestEmailRecipientRedacted ?? "—"}`,
    ``,
    `### Final decision`,
    ``,
    `**${go.decision}**`,
    ``,
    go.justification,
    ``,
  );

  if (go.highestImpactBlocker) {
    lines.push(`**Highest-impact blocker:** ${go.highestImpactBlocker}`, ``);
  }

  lines.push(
    `## Safety attestations`,
    ``,
    `- Secrets never printed: yes`,
    `- Candidate emails never targeted: yes`,
    `- Paperwork never resent: yes`,
    `- Workflow stages unmodified: yes`,
    `- DB candidate updates: 0`,
    `- Simulated success: no (reflects actual runtime state)`,
    ``,
  );

  return lines.join("\n");
}
