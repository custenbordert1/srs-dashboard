import type {
  P243OsbpqFinalReport,
  P243OsbpqPreviewReport,
  P243OsbpqQueueItem,
  P243OsbpqSendRow,
} from "@/lib/p243-open-store-bulk-paperwork-queue/types";

export function formatP243OsbpqPreviewMarkdown(report: P243OsbpqPreviewReport): string {
  const s = report.summary;
  const cap = report.capacity;
  const lines: string[] = [
    `# P243 Open Store Bulk Paperwork Queue — Preview`,
    ``,
    `- Generated: ${report.generatedAt}`,
    `- Workbook: \`${report.xlsxPath}\``,
    `- Dropbox testMode: **${report.dropboxTestMode ?? "unknown"}**`,
    `- Capacity confirmed: **${cap.confirmed}** (source=${cap.source})`,
    `- API remaining: **${cap.apiRequestsRemaining ?? "—"}**; safe capacity: **${cap.safeCapacity ?? "—"}** (reserve=${cap.safetyReserve})`,
    cap.stopAfterPreview
      ? `- **STOP after preview:** capacity could not be confirmed or safe capacity is null`
      : `- Live send headroom available: ${cap.safeCapacity}`,
    ``,
    `## Summary`,
    ``,
    `| Metric | Count |`,
    `| --- | ---: |`,
    `| Reviewed | ${s.reviewed} |`,
    `| Eligible | ${s.eligible} |`,
    `| Already sent | ${s.alreadySent} |`,
    `| Already signed | ${s.alreadySigned} |`,
    `| Duplicates | ${s.duplicates} |`,
    `| Invalid email | ${s.invalidEmail} |`,
    `| Blocked | ${s.blocked} |`,
    `| Ambiguous | ${s.ambiguous} |`,
    `| Unresolved | ${s.unresolved} |`,
    `| API remaining | ${s.apiRemaining ?? "—"} |`,
    `| Safe capacity | ${s.safeCapacity ?? "—"} |`,
    `| Would send | ${s.wouldSend} |`,
    `| Deferred | ${s.deferred} |`,
    ``,
    `## Would-send queue (priority order)`,
    ``,
  ];

  const wouldSend = report.queue.filter((c) => report.eligibleIds.includes(c.candidateId));
  if (!wouldSend.length) {
    lines.push(`_None_`, ``);
  } else {
    lines.push(
      `| # | Name | Email | Store | Tier | Miles | Stage | Idempotency |`,
      `| ---: | --- | --- | --- | --- | ---: | --- | --- |`,
    );
    for (const c of wouldSend) {
      lines.push(
        `| ${c.queuePriority} | ${c.name} | ${c.email ?? "—"} | ${c.storeLabel} | ${c.distanceTier} | ${c.milesToStore ?? "—"} | ${c.workflowStage} | \`${c.idempotencyKey}\` |`,
      );
    }
    lines.push(``);
  }

  const deferred = report.queue.filter((c) => report.deferredIds.includes(c.candidateId));
  lines.push(`## Deferred (eligible_deferred_api_capacity)`, ``);
  if (!deferred.length) {
    lines.push(`_None_`, ``);
  } else {
    lines.push(`| Name | Store | Tier | Reason |`);
    lines.push(`| --- | --- | --- | --- |`);
    for (const c of deferred) {
      lines.push(
        `| ${c.name} | ${c.storeLabel} | ${c.distanceTier} | eligible_deferred_api_capacity |`,
      );
    }
    lines.push(``);
  }

  lines.push(`## Blocked (sample)`, ``);
  const blocked = report.queue.filter((c) => c.eligibility === "blocked");
  lines.push(`| Name | Store | Reasons | Detail |`);
  lines.push(`| --- | --- | --- | --- |`);
  for (const c of blocked.slice(0, 80)) {
    lines.push(
      `| ${c.name} | ${c.storeLabel} | ${c.blockReasons.join(", ")} | ${(c.blockDetail ?? "").slice(0, 90)} |`,
    );
  }
  if (blocked.length > 80) {
    lines.push(`| … | … | … | +${blocked.length - 80} more |`);
  }
  lines.push(``);

  if (cap.limitationNotes.length) {
    lines.push(`## Capacity notes`, ``);
    for (const n of cap.limitationNotes) lines.push(`- ${n}`);
    lines.push(``);
  }
  if (report.notes.length) {
    lines.push(`## Notes`, ``);
    for (const n of report.notes) lines.push(`- ${n}`);
    lines.push(``);
  }
  if (report.warnings.length) {
    lines.push(`## Warnings`, ``);
    for (const w of report.warnings) lines.push(`- ${w}`);
    lines.push(``);
  }

  return `${lines.join("\n")}\n`;
}

export function formatP243OsbpqFinalMarkdown(report: P243OsbpqFinalReport): string {
  const s = report.summary;
  const lines: string[] = [
    `# P243 Open Store Bulk Paperwork Queue — Final`,
    ``,
    `- Generated: ${report.generatedAt}`,
    `- Mode: **${report.mode}** (dryRun=${report.dryRun})`,
    `- Live writes occurred: **${report.liveWritesOccurred}**`,
    `- Dropbox testMode: **${report.dropboxTestMode ?? "unknown"}**`,
    `- Batches attempted: ${report.batchesAttempted} (size≤${report.batchSize})`,
    `- Force auto-advance: ${report.forceAutoAdvance}; force fresh-reset: ${report.forceFreshReset}`,
    `- Capacity: remaining=${report.capacity.apiRequestsRemaining ?? "—"} safe=${report.capacity.safeCapacity ?? "—"} source=${report.capacity.source}`,
    report.stoppedOnSystemFailure
      ? `- **STOPPED on system failure:** ${report.systemStopReason}`
      : `- Completed without system-wide stop`,
    ``,
    `## Summary`,
    ``,
    `| Metric | Count |`,
    `| --- | ---: |`,
    `| Reviewed | ${s.reviewed} |`,
    `| Eligible | ${s.eligible} |`,
    `| Already sent | ${s.alreadySent} |`,
    `| Already signed | ${s.alreadySigned} |`,
    `| Duplicates | ${s.duplicates} |`,
    `| Invalid email | ${s.invalidEmail} |`,
    `| Blocked | ${s.blocked} |`,
    `| API remaining | ${s.apiRemaining ?? "—"} |`,
    `| Safe capacity | ${s.safeCapacity ?? "—"} |`,
    `| Would send | ${s.wouldSend} |`,
    `| Attempted | ${s.attempted} |`,
    `| Confirmed sends | ${s.confirmedSends} |`,
    `| Deferred | ${s.deferred} |`,
    `| Failed | ${s.failed} |`,
    ``,
  ];

  lines.push(`## Confirmed sends`, ``);
  appendSendTable(lines, report.confirmed);
  lines.push(`## Deferred`, ``);
  appendSendTable(lines, report.deferred);
  lines.push(`## Failures`, ``);
  appendSendTable(lines, report.failures);

  if (report.notes.length) {
    lines.push(`## Notes`, ``);
    for (const n of report.notes) lines.push(`- ${n}`);
    lines.push(``);
  }
  if (report.warnings.length) {
    lines.push(`## Warnings`, ``);
    for (const w of report.warnings) lines.push(`- ${w}`);
    lines.push(``);
  }

  return `${lines.join("\n")}\n`;
}

function appendSendTable(lines: string[], rows: P243OsbpqSendRow[]): void {
  if (!rows.length) {
    lines.push(`_None_`, ``);
    return;
  }
  lines.push(
    `| Name | Store | Batch | Confirmed | Sig | Status | Detail |`,
    `| --- | --- | ---: | --- | --- | --- | --- |`,
  );
  for (const r of rows) {
    const detail =
      r.failureReason ?? r.deferReason ?? r.skipReason ?? (r.confirmed ? "ok" : "—");
    lines.push(
      `| ${r.name} | ${r.storeLabel} | ${r.batchIndex} | ${r.confirmed} | ${(r.signatureRequestId ?? "—").slice(0, 12)} | ${r.paperworkStatusAfter ?? "—"} | ${String(detail).slice(0, 80)} |`,
    );
  }
  lines.push(``);
}

export function summarizeQueueForJson(items: P243OsbpqQueueItem[]) {
  return items.map((c) => ({
    candidateId: c.candidateId,
    name: c.name,
    email: c.email,
    storeLabel: c.storeLabel,
    storeNumber: c.storeNumber,
    project: c.project,
    distanceTier: c.distanceTier,
    milesToStore: c.milesToStore,
    eligibility: c.eligibility,
    blockReasons: c.blockReasons,
    blockDetail: c.blockDetail,
    idempotencyKey: c.idempotencyKey,
    queuePriority: c.queuePriority,
    matchMethod: c.matchMethod,
  }));
}
