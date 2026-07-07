import type { P155ExceptionRow, P155OperationsDashboard, P155RecentSendRow } from "@/lib/p155-autopilot-operations-dashboard/types";

export function formatP155OperationsDashboardMarkdown(input: {
  dashboard: P155OperationsDashboard;
  recentSends: P155RecentSendRow[];
  exceptions: P155ExceptionRow[];
}): string {
  const d = input.dashboard;
  const lines = [
    "# P155 — Autopilot Operations Dashboard",
    "",
    `Generated: ${d.generatedAt}`,
    "",
    "## Autopilot Status",
    "",
    `- Enabled: ${d.status.enabled}`,
    `- Continuous: ${d.status.continuousEnabled}`,
    `- Runner: ${d.status.runnerStatus}`,
    `- Last run: ${d.status.lastRunAt ?? "—"}`,
    `- Next run: ${d.status.nextRunAt ?? "—"}`,
    `- Interval: ${d.status.intervalMinutes} min`,
    `- Send cap / cycle: ${d.status.maxSendsPerCycle}`,
    `- Assignment cap / cycle: ${d.status.maxAssignmentsPerCycle}`,
    "",
    "## Today's Activity",
    "",
    `- Evaluated: ${d.today.candidatesEvaluated}`,
    `- Assigned: ${d.today.recruitersAssigned}`,
    `- Sent: ${d.today.paperworkSent}`,
    `- Signed: ${d.today.paperworkSigned}`,
    `- Active signatures: ${d.today.activeSignatureRequests}`,
    `- Duplicates prevented: ${d.today.duplicatesPrevented}`,
    `- Failures: ${d.today.failures}`,
    "",
    "## Queue Health",
    "",
    `- Eligible: ${d.queue.eligibleForPaperwork}`,
    `- Waiting on signature: ${d.queue.waitingOnSignature}`,
    `- Signed today: ${d.queue.signedToday}`,
    `- Invalid email: ${d.queue.invalidEmail}`,
    `- Duplicates: ${d.queue.duplicateCandidates}`,
    `- Manual review: ${d.queue.manualReview}`,
    `- Disqualified/archived: ${d.queue.disqualifiedArchived}`,
    `- Queue remaining: ${d.queue.queueRemaining}`,
    "",
    "## Recent Sends",
    "",
  ];

  if (input.recentSends.length === 0) {
    lines.push("_No sends today._", "");
  } else {
    for (const row of input.recentSends.slice(0, 15)) {
      lines.push(
        `- **${row.candidateName}** (${row.email}) — ${row.recruiter} / ${row.dm} — ${row.status} — ${row.sentAt}${row.dryRun ? " _(dry)_" : ""}`,
      );
    }
    lines.push("");
  }

  lines.push("## Exceptions", "");
  if (input.exceptions.length === 0) {
    lines.push("_No exceptions recorded today._", "");
  } else {
    for (const row of input.exceptions.slice(0, 15)) {
      lines.push(`- [${row.category}] ${row.candidateName ?? "system"} — ${row.detail}`);
    }
    lines.push("");
  }

  lines.push(
    "## Controls",
    "",
    "Executive-only POST `/api/recruiting/autopilot/control` supports dry_cycle, live_cycle (confirmLive + env), pause, resume, refresh.",
    "Continuous daemon is **not** startable from this UI.",
    "",
  );

  return lines.join("\n");
}
