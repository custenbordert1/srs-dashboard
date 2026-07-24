import type {
  P249DryRunReport,
  P249GoNoGo,
  P249LiveExecutionPlan,
  P249OperationsDashboard,
  P249OutstandingPaperworkAnalysis,
  P249ProductionReadiness,
} from "@/lib/p249-daily-ops-mission/types";

export function formatP249ReadinessMarkdown(r: P249ProductionReadiness): string {
  const lines = [
    `# P249 — Production Readiness Verification`,
    ``,
    `**Ops date:** ${r.opsDate}`,
    `**Generated:** ${r.generatedAt}`,
    `**Overall:** ${r.overall}`,
    `**Mode:** read-only (no sends)`,
    ``,
    `| Status | Count |`,
    `| --- | ---: |`,
    `| PASS | ${r.passCount} |`,
    `| FAIL | ${r.failCount} |`,
    `| WARN | ${r.warnCount} |`,
    ``,
    `## Modes`,
    ``,
    `- Email mode: \`${r.modes.emailMode}\``,
    `- Dropbox testMode: \`${r.modes.dropboxTestMode}\``,
    `- Resend ready for live: ${r.modes.resendReady ? "yes" : "no"}`,
    `- Pilot live env: ${r.modes.pilotLiveEnvOk ? "yes" : "no"}`,
    ``,
    `## Checklist`,
    ``,
    `| Status | Category | Check | Detail |`,
    `| --- | --- | --- | --- |`,
  ];
  for (const c of r.checklist) {
    lines.push(
      `| ${c.status} | ${c.category} | ${c.label} | ${c.detail.replace(/\|/g, "/")} |`,
    );
  }
  lines.push(``, `## Blockers`, ``);
  if (r.blockers.length === 0) lines.push(`_None_`, ``);
  else {
    for (const b of r.blockers) lines.push(`- ${b}`);
    lines.push(``);
  }
  return lines.join("\n");
}

export function formatP249OutstandingMarkdown(
  o: P249OutstandingPaperworkAnalysis,
): string {
  const c = o.counts;
  const lines = [
    `# P249 — Outstanding Paperwork Analysis`,
    ``,
    `**Ops date:** ${o.opsDate}`,
    `**Generated:** ${o.generatedAt}`,
    ``,
    `## Counts`,
    ``,
    `| Metric | Count |`,
    `| --- | ---: |`,
    `| Eligible for initial paperwork | ${c.eligibleForInitialPaperwork} |`,
    `| Already sent | ${c.alreadySent} |`,
    `| Outstanding Dropbox signatures | ${c.outstandingDropboxSignatures} |`,
    `| Reminder-eligible (total) | ${c.reminderEligibleTotal} |`,
    `| Reminder 1 | ${c.reminder1} |`,
    `| Reminder 2 | ${c.reminder2} |`,
    `| Reminder 3 | ${c.reminder3} |`,
    `| Reminder 4 | ${c.reminder4} |`,
    `| Viewed but not signed | ${c.viewedButNotSigned} |`,
    `| Signed | ${c.signed} |`,
    `| Ready for MEL (incl. verify-signed) | ${c.readyForMel} |`,
    `| Workflow: Paperwork Needed | ${c.paperworkNeededWorkflow} |`,
    `| Workflow: Paperwork Sent | ${c.paperworkSentWorkflow} |`,
    ``,
    `## Blocked by reason`,
    ``,
    `| Reason | Count | Auto-fix? | Manual action |`,
    `| --- | ---: | --- | --- |`,
  ];
  for (const b of o.blockedByReason) {
    lines.push(
      `| ${b.reason} | ${b.count} | ${b.automaticFix ? "yes" : "no"} | ${b.manualAction} |`,
    );
  }
  lines.push(
    ``,
    `## Sources`,
    ``,
    `- P242 preview: ${o.source.p242Preview ? "yes" : "no"}`,
    `- P246 preview: ${o.source.p246Preview ? "yes" : "no"}`,
    `- Workflow store: ${o.source.workflowStore ? "yes" : "no"}`,
    `- Reminder store file present: ${o.source.reminderStorePresent ? "yes" : "no"}`,
    ``,
  );
  return lines.join("\n");
}

export function formatP249DryRunMarkdown(d: P249DryRunReport): string {
  const s = d.simulations;
  const lines = [
    `# P249 — Complete Dry Run Report`,
    ``,
    `**Ops date:** ${d.opsDate}`,
    `**Generated:** ${d.generatedAt}`,
    `**Zero writes confirmed:** yes`,
    ``,
    `| Write class | Count |`,
    `| --- | ---: |`,
    `| Live emails sent | ${d.liveEmailsSent} |`,
    `| Dropbox writes | ${d.dropboxWrites} |`,
    `| MEL writes | ${d.melWrites} |`,
    `| Breezy writes | ${d.breezyWrites} |`,
    ``,
    `## Simulations`,
    ``,
    `| Simulation | Count |`,
    `| --- | ---: |`,
    `| Initial paperwork would send | ${s.initialPaperworkWouldSend} |`,
    `| Initial deferred/blocked | ${s.initialPaperworkDeferredOrBlocked} |`,
    `| Reminders would send | ${s.remindersWouldSend} |`,
    `| Reminders skipped (cooldown/dup) | ${s.remindersSkippedDuplicateOrCooldown} |`,
    `| Duplicates detected | ${s.duplicatesDetected} |`,
    `| Dropbox refresh probed | ${s.dropboxRefreshProbed} |`,
    `| Dropbox refresh OK | ${s.dropboxRefreshOk} |`,
    `| Idempotent skips | ${s.idempotentSkips} |`,
    `| Candidate advancement planned | ${s.candidateAdvancementPlanned} |`,
    `| Open-store eligible would send | ${s.openStoreEligibleWouldSend} |`,
    `| Open-store safe capacity | ${s.openStoreSafeCapacity ?? "n/a"} |`,
    ``,
    `## Notes`,
    ``,
  ];
  for (const n of d.notes) lines.push(`- ${n}`);
  lines.push(``, `## Warnings`, ``);
  if (d.warnings.length === 0) lines.push(`_None_`, ``);
  else for (const w of d.warnings) lines.push(`- ${w}`);
  lines.push(``);
  return lines.join("\n");
}

export function formatP249LivePlanMarkdown(p: P249LiveExecutionPlan): string {
  const lines = [
    `# P249 — Safe Live Execution Plan`,
    ``,
    `**Ops date:** ${p.opsDate}`,
    `**Generated:** ${p.generatedAt}`,
    `**Recommendation:** ${p.recommendation}`,
    ``,
    `> Plan only — do not execute live from this artifact.`,
    ``,
    `## Step order`,
    ``,
  ];
  for (const s of p.steps) {
    lines.push(`### ${s.order}. ${s.action}`);
    lines.push(``);
    lines.push(`- Count: ${s.count ?? "n/a"}`);
    lines.push(`- Risk: ${s.risk}`);
    if (s.command) lines.push(`- Command: \`${s.command}\``);
    lines.push(`- Notes: ${s.notes}`);
    lines.push(``);
  }
  lines.push(`## Throughput estimate`, ``);
  lines.push(`- Initial sends/hour (cap): ${p.throughputEstimate.initialSendsPerHour}`);
  lines.push(`- Reminders/hour (theoretical): ${p.throughputEstimate.remindersPerHour}`);
  lines.push(
    `- Est. minutes for reminders: ${p.throughputEstimate.estimatedMinutesForReminders ?? "n/a"}`,
  );
  lines.push(
    `- Est. minutes for initial sends: ${p.throughputEstimate.estimatedMinutesForInitialSends ?? "n/a"}`,
  );
  lines.push(``, `## Operational risks`, ``);
  for (const r of p.operationalRisks) lines.push(`- ${r}`);
  lines.push(``);
  return lines.join("\n");
}

export function formatP249OperationsDashboardMarkdown(
  d: P249OperationsDashboard,
): string {
  return [
    `# P249 — Operations Dashboard`,
    ``,
    `**Ops date:** ${d.opsDate}`,
    `**Generated:** ${d.generatedAt}`,
    ``,
    `| Metric | Value |`,
    `| --- | ---: |`,
    `| New applicants (Applied) | ${d.newApplicants} |`,
    `| Paperwork Needed | ${d.paperworkNeeded} |`,
    `| Eligible to Send | ${d.eligibleToSend} |`,
    `| Paperwork Sent | ${d.paperworkSent} |`,
    `| Outstanding Signatures | ${d.outstandingSignatures} |`,
    `| Reminder 1 | ${d.reminder1} |`,
    `| Reminder 2 | ${d.reminder2} |`,
    `| Reminder 3 | ${d.reminder3} |`,
    `| Reminder 4 | ${d.reminder4} |`,
    `| Viewed | ${d.viewed} |`,
    `| Signed Today | ${d.signedToday} |`,
    `| Ready for MEL | ${d.readyForMel} |`,
    `| Blocked (manual) | ${d.blocked} |`,
    `| Pipeline Health % | ${d.pipelineHealthPct} |`,
    `| Est. recruiter hours saved | ${d.estimatedRecruiterHoursSaved} |`,
    ``,
  ].join("\n");
}

export function formatP249GoNoGoMarkdown(g: P249GoNoGo): string {
  const lines = [
    `# P249 — GO / NO-GO`,
    ``,
    `**Ops date:** ${g.opsDate}`,
    `**Generated:** ${g.generatedAt}`,
    `**Decision:** **${g.decision}**`,
    ``,
    `| Key metric | Value |`,
    `| --- | ---: |`,
    `| Pipeline health score | ${g.pipelineHealthScore} |`,
    `| Eligible first-time paperwork | ${g.eligibleFirstTimePaperwork} |`,
    `| Eligible reminders | ${g.eligibleReminders} |`,
    `| Expected Ready for MEL today | ${g.expectedReadyForMelToday} |`,
    ``,
    `## Justification`,
    ``,
    g.justification,
    ``,
    `## Blockers preventing production execution`,
    ``,
  ];
  if (g.blockers.length === 0) lines.push(`_None_`, ``);
  else {
    for (const b of g.blockers) lines.push(`- ${b}`);
    lines.push(``);
  }
  return lines.join("\n");
}
