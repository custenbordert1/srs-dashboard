import type { P244FullReconciliationReport } from "@/lib/p244-open-store-applicant-reconciliation/types";

export function formatP244ReconciliationMarkdown(report: P244FullReconciliationReport): string {
  const s = report.summary;
  const lines: string[] = [];
  lines.push(`# P244 — Open Store Applicant Reconciliation`);
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Mode: ${report.mode} (dryRun=${report.dryRun})`);
  lines.push(`XLSX: ${report.xlsxPath}`);
  lines.push(`Dropbox testMode: ${String(report.dropboxTestMode)}`);
  lines.push(`Live writes: ${report.liveWritesOccurred}`);
  lines.push("");
  lines.push(`## Totals (must equal 81)`);
  lines.push("");
  lines.push(`| Metric | Count |`);
  lines.push(`| --- | ---: |`);
  lines.push(`| Spreadsheet applicants | ${s.totalSpreadsheetApplicants} |`);
  lines.push(`| P243 confirmed sends | ${s.p243ConfirmedSends} |`);
  lines.push(`| Remaining reviewed | ${s.remainingApplicantsReviewed} |`);
  lines.push(`| Previously sent & verified | ${s.previouslySentAndVerified} |`);
  lines.push(`| Already signed | ${s.alreadySigned} |`);
  lines.push(`| Ready for MEL / active in MEL | ${s.readyForMelOrActiveInMel} |`);
  lines.push(`| Duplicates | ${s.duplicates} |`);
  lines.push(`| Invalid emails | ${s.invalidEmails} |`);
  lines.push(`| Missing ingestion / not found | ${s.missingIngestionCandidates} |`);
  lines.push(`| Recovered candidates | ${s.recoveredCandidates} |`);
  lines.push(`| Other blocked | ${s.otherBlockedCandidates} |`);
  lines.push(`| Eligible found (incl. deferred) | ${s.eligibleApplicantsFound} |`);
  lines.push(`| Additional sends attempted | ${s.additionalSendsAttempted} |`);
  lines.push(`| Additional sends confirmed | ${s.additionalSendsConfirmed} |`);
  lines.push(`| Deferred (API capacity) | ${s.deferredDueToApiCapacity} |`);
  lines.push(`| Still requiring manual action | ${s.stillRequiringManualAction} |`);
  lines.push(`| Remaining Dropbox safe capacity | ${s.remainingDropboxSafeCapacity ?? "—"} |`);
  lines.push("");
  lines.push(`Check: ${s.p243ConfirmedSends} + ${s.remainingApplicantsReviewed} = ${s.p243ConfirmedSends + s.remainingApplicantsReviewed} (expect 81).`);
  lines.push("");
  lines.push(`## Remaining-74 category counts`);
  lines.push("");
  lines.push(`| Category | Count |`);
  lines.push(`| --- | ---: |`);
  for (const [cat, n] of Object.entries(s.categoryCounts)) {
    lines.push(`| ${cat} | ${n} |`);
  }
  lines.push("");
  lines.push(`## Capacity`);
  lines.push("");
  lines.push(`- Source: ${report.capacity.source}`);
  lines.push(`- API remaining: ${report.capacity.apiRequestsRemaining ?? "—"}`);
  lines.push(`- Safety reserve: ${report.capacity.safetyReserve}`);
  lines.push(`- Safe capacity: ${report.capacity.safeCapacity ?? "—"}`);
  lines.push(`- Detail: ${report.capacity.detail}`);
  lines.push("");

  if (report.newConfirmedSends.length) {
    lines.push(`## P244 new confirmed sends`);
    lines.push("");
    for (const c of report.newConfirmedSends) {
      lines.push(
        `- **${c.name}** (${c.candidateId}) store=${c.openStore} batch=${c.batchIndex} sig=${c.signatureRequestId} api ${c.apiCapacityBefore}→${c.apiCapacityAfter}`,
      );
    }
    lines.push("");
  }

  if (report.recovered.length) {
    lines.push(`## Recovery attempts`);
    lines.push("");
    for (const r of report.recovered) {
      lines.push(
        `- **${r.name}** found=${r.foundInBreezy} method=${r.recoveryMethod} id=${r.breezyCandidateId ?? "—"} — ${r.detail}`,
      );
    }
    lines.push("");
  }

  lines.push(`## Individual dispositions (all ${report.dispositions.length})`);
  lines.push("");
  for (const d of report.dispositions) {
    lines.push(`### ${d.sheetRowIndex + 1}. ${d.candidateName}`);
    lines.push("");
    lines.push(`- Email: ${d.candidateEmail ?? "—"}`);
    lines.push(`- Breezy ID: ${d.breezyCandidateId ?? "—"}`);
    lines.push(`- Position: ${d.position}`);
    lines.push(`- Open store: ${d.matchingOpenStore} (#${d.storeNumber})`);
    lines.push(`- Breezy stage: ${d.breezyStage}`);
    lines.push(`- Workflow stage: ${d.workflowStage}`);
    lines.push(`- Paperwork status: ${d.paperworkStatus}`);
    lines.push(`- Signature request ID: ${d.signatureRequestId ?? "—"}`);
    lines.push(`- Previously sent: ${d.previouslySent}`);
    lines.push(`- Sent during P243: ${d.sentDuringP243}`);
    lines.push(`- Eligibility: ${d.eligibilityResult}`);
    lines.push(`- Reason not sent: ${d.reasonNotSent ?? "—"}`);
    lines.push(`- Can send now: ${d.canBeSentNow}`);
    lines.push(`- Category: ${d.category}`);
    lines.push(`- Recommended next action: ${d.recommendedNextAction}`);
    if (d.sendVerification) {
      lines.push(
        `- Send verification: verified=${d.sendVerification.verified} — ${d.sendVerification.detail}`,
      );
    }
    if (d.recoveryAttempted) {
      lines.push(
        `- Recovery: succeeded=${d.recoverySucceeded} — ${d.recoveryDetail ?? "—"}`,
      );
    }
    lines.push("");
  }

  if (report.notes.length) {
    lines.push(`## Notes`);
    lines.push("");
    for (const n of report.notes) lines.push(`- ${n}`);
    lines.push("");
  }
  if (report.warnings.length) {
    lines.push(`## Warnings`);
    lines.push("");
    for (const w of report.warnings) lines.push(`- ${w}`);
    lines.push("");
  }
  if (report.stoppedOnSystemFailure) {
    lines.push(`## STOPPED`);
    lines.push("");
    lines.push(report.systemStopReason ?? "system failure");
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}
