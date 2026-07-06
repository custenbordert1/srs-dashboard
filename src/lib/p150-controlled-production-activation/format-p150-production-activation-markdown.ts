import type { ControlledProductionActivationSummary } from "@/lib/p150-controlled-production-activation/types";

export function formatP150ProductionActivationMarkdown(
  report: ControlledProductionActivationSummary,
): string {
  const lines: string[] = [
    "# P150 — Controlled Production Activation",
    "",
    `Generated: ${report.generatedAt}`,
    `Mode: ${report.dryRun ? "dry run" : "live"}`,
    `P150 enabled: ${report.autoSendEnabled}`,
    `Max sends limit: ${report.maxSendsLimit}`,
    "",
    "## Summary",
    "",
    `- Candidates evaluated: ${report.classification.candidatesEvaluated}`,
    `- In paperwork queue: ${report.classification.inPaperworkQueue}`,
    `- Ready to send: ${report.classification.categoryCounts.READY_TO_SEND}`,
    `- Actually sent: ${report.sentCount}`,
    `- Skipped: ${report.skippedCount}`,
    `- Blocked: ${report.blockedCount}`,
    `- Failures: ${report.failedCount}`,
    `- Duplicate prevention: ${report.duplicatesPrevented}`,
    `- Cooldown blocked: ${report.cooldownBlocked}`,
    `- Execution duration: ${report.executionTimeMs}ms`,
    `- Cap reached: ${report.capReached ? "yes" : "no"}`,
    `- Stopped on error: ${report.stoppedOnError ? "yes" : "no"}`,
    "",
    "## Category counts",
    "",
  ];

  for (const [category, count] of Object.entries(report.classification.categoryCounts)) {
    lines.push(`- ${category}: ${count}`);
  }

  lines.push("", `## Eligibility summary (all ${report.classification.candidatesEvaluated} candidates)`, "");
  const eligibilityEntries = Object.entries(report.classification.eligibilitySummary).sort(
    (a, b) => b[1] - a[1],
  );
  for (const [reason, count] of eligibilityEntries) {
    lines.push(`- (${count}) ${reason}`);
  }

  lines.push("", "## Blocker summary (aggregated)", "");
  const blockerEntries = Object.entries(report.classification.blockerSummary).sort((a, b) => b[1] - a[1]);
  if (blockerEntries.length === 0) {
    lines.push("_No blocked candidates_");
  } else {
    for (const [reason, count] of blockerEntries) {
      lines.push(`- (${count}) ${reason}`);
    }
  }

  lines.push("", "## Queue zero explanation", "");
  for (const line of report.classification.queueZeroExplanation) {
    lines.push(`- ${line}`);
  }

  const sent = report.items.filter((item) => item.sendResult === "sent");
  const skipped = report.items.filter((item) => item.sendResult === "skipped");
  const blocked = report.items.filter(
    (item) => item.sendResult === "blocked" || item.sendResult === "duplicatePrevented",
  );
  const failed = report.items.filter((item) => item.sendResult === "failed");

  lines.push("", "## Sent candidates", "");
  if (sent.length === 0) {
    lines.push("_None_");
  } else {
    for (const item of sent) {
      lines.push(
        `- **${item.candidateName}** (${item.candidateId}) — ${item.email} — signature: ${item.signatureRequestId ?? "—"}`,
      );
    }
  }

  lines.push("", "## Skipped candidates", "");
  if (skipped.length === 0) {
    lines.push("_None_");
  } else {
    for (const item of skipped) {
      lines.push(`- ${item.candidateName} (${item.candidateId}): ${item.reason}`);
    }
  }

  lines.push("", "## Blocked candidates (execution phase)", "");
  if (blocked.length === 0) {
    lines.push("_None_");
  } else {
    for (const item of blocked) {
      lines.push(`- ${item.candidateName} (${item.candidateId}): ${item.blockedReason ?? item.reason}`);
    }
  }

  lines.push("", "## Failures", "");
  if (failed.length === 0) {
    lines.push("_None_");
  } else {
    for (const item of failed) {
      lines.push(`- ${item.candidateName} (${item.candidateId}): ${item.reason}`);
    }
  }

  const dropboxSignRequests = sent
    .map((item) => item.signatureRequestId)
    .filter((id): id is string => Boolean(id));

  lines.push(
    "",
    "## Audit & integrations",
    "",
    `- Audit events appended for ${report.items.length} execution item(s)`,
    `- Breezy writes: ${report.breezyWrites ? "yes" : "no"}`,
    `- Dropbox Sign requests created: ${dropboxSignRequests.length}`,
  );
  if (dropboxSignRequests.length > 0) {
    for (const id of dropboxSignRequests) {
      lines.push(`  - ${id}`);
    }
  }

  lines.push("", "## Rollback recommendation", "", report.rollbackRecommendation, "");

  const blockedByCategory = report.classification.candidates.filter(
    (c) => c.category !== "READY_TO_SEND" && c.category !== "NOT_REQUIRING_PAPERWORK",
  );
  if (blockedByCategory.length > 0) {
    lines.push("## All blocked / waiting candidates (classification)", "");
    for (const c of blockedByCategory.slice(0, 100)) {
      lines.push(`- **${c.candidateName}** (${c.candidateId}) — ${c.category}: ${c.primaryBlockerReason}`);
    }
    if (blockedByCategory.length > 100) {
      lines.push(`- _…and ${blockedByCategory.length - 100} more (see JSON artifact)_`);
    }
  }

  return `${lines.join("\n")}\n`;
}
