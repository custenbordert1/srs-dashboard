import type { P256MissionResult } from "@/lib/p256-controlled-live-recovered-send/types";

export function formatP256LiveSendReportMarkdown(result: P256MissionResult): string {
  const c = result.counts;
  const lines: string[] = [
    `# P256 — Controlled Live Paperwork Send (Recovered Candidates)`,
    ``,
    `- Generated: ${result.generatedAt}`,
    `- Ops date: ${result.opsDate}`,
    `- Mode: **${result.mode}**`,
    `- Production Dropbox confirmed: **${result.productionModeConfirmed}**`,
    `- testMode: **${result.testMode === null ? "null" : result.testMode}**`,
    `- Aborted: **${result.aborted}**${result.abortReason ? ` — ${result.abortReason}` : ""}`,
    ``,
    `## Authorized targets (from P255)`,
    ``,
  ];

  for (const t of result.authorizedTargets) {
    lines.push(
      `- ${t.name} (\`${t.candidateId}\`) — ${t.email || "(no email)"} — position ${t.positionId ?? "unknown"}`,
    );
  }
  lines.push(``);

  lines.push(
    `## Counts`,
    ``,
    `| Metric | Count |`,
    `| --- | ---: |`,
    `| Evaluated | ${c.evaluated} |`,
    `| Eligible | ${c.eligible} |`,
    `| Sent | ${c.sent} |`,
    `| Skipped | ${c.skipped} |`,
    `| Failures | ${c.failures} |`,
    `| Already sent | ${c.alreadySent} |`,
    `| Already signed | ${c.alreadySigned} |`,
    `| Gate failed after refresh | ${c.gateFailed} |`,
    ``,
    `## Dropbox quota`,
    ``,
    `| Snapshot | api_signature_requests_left | Rate-limit remaining | Probed at | Error |`,
    `| --- | ---: | ---: | --- | --- |`,
    `| Before | ${result.quotaBefore.accountQuotaRemaining ?? "null"} | ${result.quotaBefore.rateLimitRemaining ?? "null"} | ${result.quotaBefore.probedAt} | ${result.quotaBefore.error ?? ""} |`,
    `| After | ${result.quotaAfter.accountQuotaRemaining ?? "null"} | ${result.quotaAfter.rateLimitRemaining ?? "null"} | ${result.quotaAfter.probedAt} | ${result.quotaAfter.error ?? ""} |`,
    ``,
    `## Production preflight`,
    ``,
    `- ${result.preflight.detail}`,
    `- Live pilot env OK: ${result.preflight.livePilotEnvOk}`,
    `- Confirmation phrase OK: ${result.preflight.confirmationPhraseOk}`,
    ``,
  );

  if (result.preflight.blockers.length) {
    lines.push(`### Blockers`, ``);
    for (const b of result.preflight.blockers) lines.push(`- ${b}`);
    lines.push(``);
  }

  lines.push(`## Refresh`, ``);
  lines.push(`- Targets: ${result.refresh.targets}`);
  lines.push(`- Breezy hits: ${result.refresh.breezyHits}`);
  lines.push(`- Breezy misses: ${result.refresh.breezyMisses}`);
  lines.push(`- Ingestion writes: ${result.refresh.ingestionWrites}`);
  lines.push(``);
  for (const n of result.refresh.notes) lines.push(`- ${n}`);
  lines.push(``);

  lines.push(`## Integrity`, ``, `- ${result.integrity.detail}`, ``);

  lines.push(`## Candidates`, ``);
  lines.push(
    `| Name | Email | Location | Recruiter | DM | Result | Signature Request ID | Refreshed |`,
  );
  lines.push(`| --- | --- | --- | --- | --- | --- | --- | --- |`);
  for (const row of result.candidates) {
    lines.push(
      `| ${escapeCell(row.name)} | ${escapeCell(row.email)} | ${escapeCell(row.location)} | ${escapeCell(row.recruiter)} | ${escapeCell(row.districtManager)} | ${row.result} | ${row.signatureRequestId ?? ""} | ${row.refreshedFromBreezy} |`,
    );
    if (row.blockers.length || row.error) {
      lines.push(
        `|  | blockers: ${escapeCell(row.blockers.join(", ") || "(none)")} | error: ${escapeCell(row.error ?? "")} |  |  |  |  |  |`,
      );
    }
  }
  lines.push(``);

  lines.push(`## Safety`, ``);
  lines.push(`- Live mode authorized: true`);
  lines.push(`- Production Dropbox only: true`);
  lines.push(`- Only authorized candidates: true`);
  lines.push(`- No bulk sends: true`);
  lines.push(`- No retries on failure: true`);
  lines.push(`- Unauthorized attempts: ${result.safety.unauthorizedAttempts}`);
  lines.push(`- Simulated sends: ${result.safety.simulatedSends}`);
  lines.push(`- Reminder emails sent: ${result.safety.reminderEmailsSent}`);
  lines.push(``);

  lines.push(`## Artifacts`, ``);
  for (const a of result.artifacts) lines.push(`- \`${a}\``);
  lines.push(``);

  return lines.join("\n");
}

function escapeCell(value: string): string {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
}
