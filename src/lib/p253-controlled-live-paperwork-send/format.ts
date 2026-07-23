import type { P253MissionResult } from "@/lib/p253-controlled-live-paperwork-send/types";

export function formatP253LiveSendSummaryMarkdown(result: P253MissionResult): string {
  const c = result.counts;
  const lines: string[] = [
    `# P253 — Controlled Live Paperwork Send`,
    ``,
    `- Generated: ${result.generatedAt}`,
    `- Ops date: ${result.opsDate}`,
    `- Mode: **${result.mode}**`,
    `- Production Dropbox confirmed: **${result.productionModeConfirmed}**`,
    `- testMode: **${result.testMode === null ? "null" : result.testMode}**`,
    `- Aborted: **${result.aborted}**${result.abortReason ? ` — ${result.abortReason}` : ""}`,
    ``,
    `## Counts`,
    ``,
    `| Metric | Count |`,
    `| --- | ---: |`,
    `| Applicants evaluated | ${c.applicantsEvaluated} |`,
    `| Eligible | ${c.eligible} |`,
    `| Sent successfully | ${c.sentSuccessfully} |`,
    `| Failed | ${c.failed} |`,
    `| Skipped | ${c.skipped} |`,
    `| Already sent | ${c.alreadySent} |`,
    `| Already signed | ${c.alreadySigned} |`,
    `| Duplicate prevented | ${c.duplicatePrevented} |`,
    `| Distance blocked | ${c.distanceBlocked} |`,
    `| Missing recruiter | ${c.missingRecruiter} |`,
    `| Missing DM | ${c.missingDm} |`,
    `| Coverage blocked | ${c.coverageBlocked} |`,
    `| Qualification failed | ${c.qualificationFailed} |`,
    `| Exclusion list | ${c.exclusionList} |`,
    `| Missing identity | ${c.missingIdentity} |`,
    `| Missing email | ${c.missingEmail} |`,
    `| Missing phone | ${c.missingPhone} |`,
    `| Not Paperwork Needed | ${c.notPaperworkNeeded} |`,
    `| Other blocked | ${c.otherBlocked} |`,
    ``,
    `## Production preflight`,
    ``,
    `- ${result.preflight.detail}`,
    `- Account quota (api_signature_requests_left): ${result.preflight.accountQuotaRemaining ?? "null"}`,
    `- Rate-limit remaining (not used as quota): ${result.preflight.rateLimitRemaining ?? "null"}`,
    `- Live pilot env OK: ${result.preflight.livePilotEnvOk}`,
    `- Confirmation phrase OK: ${result.preflight.confirmationPhraseOk}`,
    ``,
  ];

  if (result.preflight.blockers.length) {
    lines.push(`### Blockers`, ``);
    for (const b of result.preflight.blockers) lines.push(`- ${b}`);
    lines.push(``);
  }

  lines.push(
    `## Refresh`,
    ``,
    `- Ingestion: ${result.refresh.ingestionDetail}`,
    `- Workflows: ${result.refresh.workflowsTouched}`,
    `- Dropbox reconciled: ${result.refresh.dropboxReconciled}`,
    ``,
  );
  for (const n of result.refresh.notes) lines.push(`- ${n}`);
  lines.push(``);

  lines.push(`## Integrity`, ``, `- ${result.integrity.detail}`, ``);

  lines.push(`## Candidates`, ``);
  lines.push(
    `| Name | Location | Recruiter | District Manager | Result | Signature Request ID |`,
  );
  lines.push(`| --- | --- | --- | --- | --- | --- |`);
  for (const row of result.candidates) {
    lines.push(
      `| ${escapeCell(row.name)} | ${escapeCell(row.location)} | ${escapeCell(row.recruiter)} | ${escapeCell(row.districtManager)} | ${row.result} | ${row.signatureRequestId ?? ""} |`,
    );
  }
  lines.push(``);

  lines.push(`## Safety`, ``);
  lines.push(`- Live mode authorized: true`);
  lines.push(`- Production Dropbox only: true`);
  lines.push(`- Simulated sends: ${result.safety.simulatedSends}`);
  lines.push(`- Reminder emails sent: ${result.safety.reminderEmailsSent}`);
  lines.push(`- MEL writes: ${result.safety.melWrites}`);
  lines.push(`- Breezy stage writes: ${result.safety.breezyStageWrites}`);
  lines.push(`- Duplicate-creating retries: ${result.safety.duplicateCreatingRetries}`);
  lines.push(``);

  lines.push(`## Artifacts`, ``);
  for (const a of result.artifacts) lines.push(`- \`${a}\``);
  lines.push(``);

  return lines.join("\n");
}

function escapeCell(value: string): string {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
}
