import type {
  P245PreviewReport,
  P245ReminderSendRecord,
} from "@/lib/p245-onboarding-paperwork-reminders/types";

export function formatP245PreviewMarkdown(input: {
  preview: P245PreviewReport;
  sent: P245ReminderSendRecord[];
  failures: P245ReminderSendRecord[];
}): string {
  const { preview, sent, failures } = input;
  const m = preview.metrics;
  const lines = [
    `# P245 — Onboarding Paperwork Reminder Preview`,
    ``,
    `**Generated:** ${preview.generatedAt}`,
    `**Mode:** ${preview.mode}`,
    `**Mail mode:** ${preview.mail.mode} (live deliverable: ${preview.mail.canLiveDeliver ? "yes" : "no"})`,
    preview.mail.blocker ? `**Mail blocker:** ${preview.mail.blocker}` : null,
    ``,
    `## Metrics`,
    ``,
    `| Metric | Count |`,
    `|---|---|`,
    `| Candidates evaluated | ${m.evaluated} |`,
    `| Eligible for reminder | ${m.eligible} |`,
    `| Emails sent | ${m.sent} |`,
    `| Already signed | ${m.alreadySigned} |`,
    `| Recently reminded (48h) | ${m.recentlyReminded} |`,
    `| Invalid email | ${m.invalidEmail} |`,
    `| Delivery failures | ${m.deliveryFailures} |`,
    `| Missing signature request | ${m.missingSignatureRequest} |`,
    `| Active in MEL | ${m.activeInMel} |`,
    `| Do Not Contact | ${m.doNotContact} |`,
    `| Packet not outstanding | ${m.packetNotOutstanding} |`,
    `| Declined | ${m.declined} |`,
    `| Expired | ${m.expired} |`,
    `| Cancelled/voided | ${m.cancelledOrVoided} |`,
    ``,
    `## Safety`,
    ``,
    `- Does **not** resend Dropbox Sign packets`,
    `- Skips reminders sent within the last 48 hours`,
    `- Excludes Signed / Declined / Expired / Cancelled / Voided`,
    `- Excludes Active MEL and Do Not Contact`,
    ``,
    `## Eligible sample (first 25)`,
    ``,
  ].filter((line): line is string => line !== null);

  const sample = preview.eligible.slice(0, 25);
  if (sample.length === 0) {
    lines.push(`_No eligible candidates._`, ``);
  } else {
    lines.push(
      `| Candidate | Email | Packet | Signature Request |`,
      `|---|---|---|---|`,
    );
    for (const row of sample) {
      lines.push(
        `| ${row.candidateName} (\`${row.candidateId}\`) | ${row.email} | ${row.packetStatus} | \`${row.signatureRequestId}\` |`,
      );
    }
    lines.push(``);
  }

  lines.push(`## Send results`, ``);
  lines.push(`- Sent records: ${sent.length}`);
  lines.push(`- Failure records: ${failures.length}`);
  if (preview.mail.blocker) {
    lines.push(`- Live delivery blocker: ${preview.mail.blocker}`);
    lines.push(
      `- To send: set \`RESEND_API_KEY\` and \`DIRECT_DEPOSIT_EMAIL_MODE=resend\`, then re-run with \`--live --confirm-live\``,
    );
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
