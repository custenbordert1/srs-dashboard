import type {
  P242CandidateMatch,
  P242FinalReport,
  P242PreviewReport,
  P242PreviewSummary,
} from "@/lib/p242-open-store-paperwork-push/types";

export function formatP242PreviewMarkdown(report: P242PreviewReport): string {
  const s = report.summary;
  const lines: string[] = [
    `# P242 Open Store Paperwork Push — Preview`,
    ``,
    `- Generated: ${report.generatedAt}`,
    `- Workbook: \`${report.xlsxPath}\``,
    `- Dropbox testMode: **${report.dropboxTestMode ?? "unknown"}**`,
    ``,
    `## Summary`,
    ``,
    `| Metric | Count |`,
    `| --- | ---: |`,
    `| Open stores reviewed | ${s.openStoresReviewed} |`,
    `| Applicants found | ${s.applicantsFound} |`,
    `| Unique applicants | ${s.uniqueApplicants} |`,
    `| Eligible | ${s.eligible} |`,
    `| Already sent | ${s.alreadySent} |`,
    `| Already signed | ${s.alreadySigned} |`,
    `| Missing email | ${s.missingEmail} |`,
    `| Position mismatch | ${s.positionMismatch} |`,
    `| Over 60 miles | ${s.over60Miles} |`,
    `| Duplicates / identity conflicts | ${s.duplicates} |`,
    `| Other blocked | ${s.otherBlocked} |`,
    ``,
    `## Eligible candidates`,
    ``,
  ];

  const eligible = report.candidates.filter((c) => c.eligibility === "eligible");
  if (!eligible.length) {
    lines.push(`_None_`, ``);
  } else {
    lines.push(
      `| Name | Email | Store | DM | Stage | Miles | Recruiter |`,
      `| --- | --- | --- | --- | --- | ---: | --- |`,
    );
    for (const c of eligible) {
      lines.push(
        `| ${c.name} | ${c.email ?? "—"} | ${c.storeLabel} | ${c.districtManager} | ${c.workflowStage} | ${c.milesToStore ?? "—"} | ${c.assignedRecruiter} |`,
      );
    }
    lines.push(``);
  }

  lines.push(`## Blocked candidates (top reasons)`, ``);
  const blocked = report.candidates.filter((c) => c.eligibility === "blocked");
  lines.push(
    `| Name | Store | Reasons | Detail |`,
    `| --- | --- | --- | --- |`,
  );
  for (const c of blocked.slice(0, 80)) {
    lines.push(
      `| ${c.name} | ${c.storeLabel} | ${c.blockReasons.join(", ")} | ${(c.blockDetail ?? "").slice(0, 80)} |`,
    );
  }
  if (blocked.length > 80) {
    lines.push(`| … | … | … | +${blocked.length - 80} more |`);
  }
  lines.push(``);

  lines.push(`## By store`, ``);
  lines.push(`| Store | DM | Applicants | Eligible | Blocked |`);
  lines.push(`| --- | --- | ---: | ---: | ---: |`);
  for (const row of s.byStore) {
    lines.push(
      `| ${row.storeLabel} | ${row.districtManager} | ${row.applicants} | ${row.eligible} | ${row.blocked} |`,
    );
  }
  lines.push(``);

  lines.push(`## By DM`, ``);
  lines.push(`| DM | Applicants | Eligible | Blocked |`);
  lines.push(`| --- | ---: | ---: | ---: |`);
  for (const row of s.byDM) {
    lines.push(
      `| ${row.districtManager} | ${row.applicants} | ${row.eligible} | ${row.blocked} |`,
    );
  }
  lines.push(``);

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

export function formatP242FinalMarkdown(report: P242FinalReport): string {
  const s = report.summary;
  const lines: string[] = [
    `# P242 Open Store Paperwork Push — Final`,
    ``,
    `- Generated: ${report.generatedAt}`,
    `- Mode: **${report.mode}** (dryRun=${report.dryRun})`,
    `- Live writes occurred: **${report.liveWritesOccurred}**`,
    `- Dropbox testMode: **${report.dropboxTestMode ?? "unknown"}**`,
    `- Batches attempted: ${report.batchesAttempted} (size≤${report.batchSize})`,
    `- Force auto-advance: ${report.forceAutoAdvance}; force fresh-reset: ${report.forceFreshReset}`,
    report.stoppedOnSystemFailure
      ? `- **STOPPED on system failure:** ${report.systemStopReason}`
      : `- Completed without system-wide stop`,
    ``,
    `## Summary`,
    ``,
    `| Metric | Count |`,
    `| --- | ---: |`,
    `| Open stores reviewed | ${s.openStoresReviewed} |`,
    `| Applicants found | ${s.applicantsFound} |`,
    `| Unique applicants | ${s.uniqueApplicants} |`,
    `| Eligible | ${s.eligible} |`,
    `| Attempted | ${s.attempted} |`,
    `| Confirmed sends | ${s.confirmedSends} |`,
    `| Failed | ${s.failed} |`,
    `| Already-sent exclusions | ${s.alreadySentExclusions} |`,
    `| Signed exclusions | ${s.signedExclusions} |`,
    `| Remaining stores with no usable applicant | ${s.remainingStoresWithNoUsableApplicant} |`,
    ``,
    `## Confirmed sends`,
    ``,
  ];

  if (!report.sent.length) {
    lines.push(`_None_`, ``);
  } else {
    lines.push(
      `| Name | Store | Batch | SignatureRequestId | Stage after |`,
      `| --- | --- | ---: | --- | --- |`,
    );
    for (const row of report.sent) {
      lines.push(
        `| ${row.name} | ${row.storeLabel} | ${row.batchIndex} | ${row.signatureRequestId ?? "—"} | ${row.workflowStageAfter ?? "—"} |`,
      );
    }
    lines.push(``);
  }

  lines.push(`## Failures`, ``);
  if (!report.failed.length) {
    lines.push(`_None_`, ``);
  } else {
    lines.push(
      `| Name | Store | Class | Reason |`,
      `| --- | --- | --- | --- |`,
    );
    for (const row of report.failed) {
      lines.push(
        `| ${row.name} | ${row.storeLabel} | ${row.failureClass ?? "—"} | ${row.failureReason ?? row.skipReason ?? "—"} |`,
      );
    }
    lines.push(``);
  }

  lines.push(`## Store coverage`, ``);
  lines.push(
    `| Store | DM | Found | Eligible | Confirmed | Usable remaining |`,
  );
  lines.push(`| --- | --- | ---: | ---: | ---: | --- |`);
  for (const row of report.storeCoverage) {
    lines.push(
      `| ${row.storeLabel} | ${row.districtManager} | ${row.applicantsFound} | ${row.eligible} | ${row.confirmedSends} | ${row.usableApplicantRemaining ? "yes" : "no"} |`,
    );
  }
  lines.push(``);

  if (report.assignments.length) {
    lines.push(`## Ownership assignments`, ``);
    lines.push(`| Name | Field | Before | After | Applied |`);
    lines.push(`| --- | --- | --- | --- | --- |`);
    for (const a of report.assignments) {
      lines.push(
        `| ${a.name} | ${a.field} | ${a.before} | ${a.after} | ${a.applied} |`,
      );
    }
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

export function summarizeEligibleForJson(candidates: P242CandidateMatch[]) {
  return candidates.filter((c) => c.eligibility === "eligible");
}

export function summarizeBlockedForJson(candidates: P242CandidateMatch[]) {
  return candidates.filter((c) => c.eligibility === "blocked");
}

export function emptyPreviewSummary(openStoresReviewed = 0): P242PreviewSummary {
  return {
    openStoresReviewed,
    applicantsFound: 0,
    uniqueApplicants: 0,
    eligible: 0,
    alreadySent: 0,
    alreadySigned: 0,
    missingEmail: 0,
    positionMismatch: 0,
    over60Miles: 0,
    duplicates: 0,
    otherBlocked: 0,
    byStore: [],
    byDM: [],
  };
}
