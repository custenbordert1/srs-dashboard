import type {
  P246CandidateEvaluation,
  P246PreviewReport,
  P246ReconciliationRecord,
  P246ReminderSendRecord,
} from "@/lib/p246-outstanding-paperwork-reminders/types";

function countLine(label: string, count: number): string {
  return `| ${label} | ${count} |`;
}

export function formatP246PreviewMarkdown(input: {
  preview: P246PreviewReport;
  sent: P246ReminderSendRecord[];
  skips: P246ReminderSendRecord[];
  failures: P246ReminderSendRecord[];
}): string {
  const { preview, sent, skips, failures } = input;
  const m = preview.metrics;
  const d = preview.dashboard;
  const lines = [
    `# P246 — Outstanding Paperwork Reminder Preview`,
    ``,
    `**Generated:** ${preview.generatedAt}`,
    `**Mode:** ${preview.mode}`,
    `**Mail mode:** ${preview.mail.mode} (live deliverable: ${preview.mail.canLiveDeliver ? "yes" : "no"})`,
    preview.mail.blocker ? `**Mail blocker:** ${preview.mail.blocker}` : null,
    preview.stopCampaign ? `**Campaign stop flag:** ${preview.stopReason}` : null,
    ``,
    `## Metrics`,
    ``,
    `| Metric | Count |`,
    `|---|---|`,
    countLine("Candidates evaluated", m.evaluated),
    countLine("Live Dropbox statuses verified", m.dropboxVerified),
    countLine("Eligible Reminder 1", m.eligibleReminder1),
    countLine("Eligible Reminder 2", m.eligibleReminder2),
    countLine("Eligible Reminder 3", m.eligibleReminder3),
    countLine("Eligible Reminder 4", m.eligibleReminder4),
    countLine("Eligible total", m.eligibleTotal),
    countLine("Signed/completed exclusions", m.signedOrCompleted),
    countLine("Viewed but incomplete", m.viewedIncomplete),
    countLine("Pending but incomplete", m.pendingIncomplete),
    countLine("Recently reminded / cooldown", m.recentlyReminded + m.cooldownNotMet),
    countLine("Maximum reminders reached", m.maximumRemindersReached),
    countLine("Needs recruiter follow-up", m.needsRecruiterFollowUp),
    countLine("Missing signature request IDs", m.missingSignatureRequest),
    countLine("Invalid emails", m.invalidEmail),
    countLine("Status conflicts", m.statusConflicts),
    countLine("Dropbox API lookup failures", m.dropboxLookupFailures),
    countLine("Status could not be verified", m.statusUnverified),
    countLine("Packet email mismatches", m.packetEmailMismatch),
    ``,
    `## Dashboard`,
    ``,
    `| Metric | Value |`,
    `|---|---|`,
    countLine("Total outstanding paperwork", d.totalOutstandingPaperwork),
    countLine("Pending signature", d.pendingSignature),
    countLine("Viewed but not signed", d.viewedButNotSigned),
    countLine("Reminder 1 due", d.reminder1Due),
    countLine("Reminder 2 due", d.reminder2Due),
    countLine("Reminder 3 due", d.reminder3Due),
    countLine("Reminder 4 due", d.reminder4Due),
    countLine("Maximum reminders reached", d.maximumRemindersReached),
    countLine("Needs recruiter follow-up", d.needsRecruiterFollowUp),
    `| Average days sent→signed | ${d.averageDaysSentToSigned ?? "—"} |`,
    `| Reminder→sign conversion | ${d.reminderToSignConversionRate ?? "—"} |`,
    ``,
    `## Safety`,
    ``,
    `- Dropbox Sign live status is the source of truth`,
    `- Does **not** resend Dropbox Sign packets`,
    `- Preview is default; live requires \`--live --confirm-live\``,
    `- Max 4 automated reminders per signature request`,
    `- Idempotency key: \`candidateId:signatureRequestId:reminderNumber\``,
    ``,
    `## Eligible sample (first 25)`,
    ``,
  ].filter((line): line is string => line !== null);

  const sample = [
    ...preview.buckets.eligibleReminder1,
    ...preview.buckets.eligibleReminder2,
    ...preview.buckets.eligibleReminder3,
    ...preview.buckets.eligibleReminder4,
  ].slice(0, 25);

  if (sample.length === 0) {
    lines.push(`_No eligible candidates._`, ``);
  } else {
    lines.push(
      `| Candidate | Email | Reminder # | Dropbox | Signature Request |`,
      `|---|---|---|---|---|`,
    );
    for (const row of sample) {
      lines.push(
        `| ${row.candidateName} (\`${row.candidateId}\`) | ${row.email} | ${row.nextReminderNumber} | ${row.dropboxLiveStatus} | \`${row.signatureRequestId}\` |`,
      );
    }
    lines.push(``);
  }

  lines.push(`## Send results`, ``);
  lines.push(`- Sent records: ${sent.length}`);
  lines.push(`- Skip records: ${skips.length}`);
  lines.push(`- Failure records: ${failures.length}`);
  if (preview.mail.blocker) {
    lines.push(`- Live delivery blocker: ${preview.mail.blocker}`);
  }
  lines.push(``);

  if (preview.wouldSend[0]) {
    lines.push(`## Sample email`, ``);
    lines.push(`**Subject:** ${preview.wouldSend[0].subject}`, ``);
    lines.push("```");
    lines.push(preview.wouldSend[0].bodyPreview);
    lines.push("```");
    lines.push(``);
  }

  return `${lines.join("\n")}\n`;
}

export function formatP246FinalMarkdown(input: {
  preview: P246PreviewReport;
  sent: P246ReminderSendRecord[];
  skips: P246ReminderSendRecord[];
  failures: P246ReminderSendRecord[];
  reconciliation: P246ReconciliationRecord[];
  needsRecruiterFollowUp: P246CandidateEvaluation[];
  liveWritesOccurred: boolean;
  filesModified: string[];
  artifactsCreated: string[];
}): string {
  const { preview, sent, skips, failures } = input;
  const m = preview.metrics;
  const verified = m.dropboxVerified;
  const lines = [
    `# P246 — Outstanding Paperwork Reminder Final Report`,
    ``,
    `**Generated:** ${new Date().toISOString()}`,
    `**Mode:** ${preview.mode}`,
    `**Resend mode:** ${preview.mail.mode}`,
    `**Live writes occurred:** ${input.liveWritesOccurred ? "yes" : "no"}`,
    ``,
    `## Totals`,
    ``,
    `| # | Metric | Count |`,
    `|---|---|---|`,
    `| 1 | Candidates evaluated | ${m.evaluated} |`,
    `| 2 | Live Dropbox statuses verified | ${verified} |`,
    `| 3a | Eligible Reminder 1 | ${m.eligibleReminder1} |`,
    `| 3b | Eligible Reminder 2 | ${m.eligibleReminder2} |`,
    `| 3c | Eligible Reminder 3 | ${m.eligibleReminder3} |`,
    `| 3d | Eligible Reminder 4 | ${m.eligibleReminder4} |`,
    `| 4 | Live reminders attempted | ${m.attempted} |`,
    `| 5 | Reminders confirmed sent | ${m.sent} |`,
    `| 6 | Signed candidates excluded | ${m.signedOrCompleted} |`,
    `| 7 | Recently reminded excluded | ${m.recentlyReminded + m.cooldownNotMet} |`,
    `| 8 | Maximum-reminder candidates | ${m.maximumRemindersReached} |`,
    `| 9 | Moved to recruiter follow-up | ${input.needsRecruiterFollowUp.length} |`,
    `| 10 | Invalid emails | ${m.invalidEmail} |`,
    `| 11 | Missing signature request IDs | ${m.missingSignatureRequest} |`,
    `| 12 | Dropbox status conflicts | ${m.statusConflicts} |`,
    `| 13 | Delivery failures | ${failures.length} |`,
    `| 14 | Resend mode used | ${preview.mail.mode} |`,
    `| 15 | Live writes occurred | ${input.liveWritesOccurred ? "yes" : "no"} |`,
    ``,
    `## Cohort reconciliation check`,
    ``,
    `- Evaluated: ${m.evaluated}`,
    `- Disposition sum (eligible + exclusions tracked): ${
      m.eligibleTotal +
      m.signedOrCompleted +
      m.recentlyReminded +
      m.cooldownNotMet +
      m.maximumRemindersReached +
      m.needsRecruiterFollowUp +
      m.missingSignatureRequest +
      m.invalidEmail +
      m.dropboxLookupFailures +
      m.statusUnverified +
      m.activeInMel +
      m.doNotContact +
      m.packetEmailMismatch +
      m.otherExclusions
    }`,
    `- Skips at send time: ${skips.length}`,
    `- Failures: ${failures.length}`,
    `- Sent: ${sent.length}`,
    ``,
    `## Files modified`,
    ``,
    ...input.filesModified.map((f) => `- \`${f}\``),
    ``,
    `## Artifacts created`,
    ``,
    ...input.artifactsCreated.map((f) => `- \`${f}\``),
    ``,
  ];
  return `${lines.join("\n")}\n`;
}
