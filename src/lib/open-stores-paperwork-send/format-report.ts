import type { AutonomousCycleReport } from "@/lib/p243-autonomous-end-to-end-pipeline/types";
import { FORCE_AUTO_ADVANCE_WARNING } from "@/lib/open-stores-paperwork-send/force-auto-advance";
import { effectiveApplicantCount } from "@/lib/open-stores-paperwork-send/normalize";
import type {
  OpenStoreApplicantSummary,
  OpenStoreMatch,
  OpenStoreTopStoreSummary,
  OpenStoresPaperworkSendReport,
} from "@/lib/open-stores-paperwork-send/types";

function modeLabel(report: OpenStoresPaperworkSendReport): string {
  if (report.mode === "canary_live") return "CANARY-LIVE";
  if (report.mode === "blocked_fallback_dry_run") return "BLOCKED → DRY-RUN";
  return "DRY-RUN";
}

export function buildApplicantsPerStore(input: {
  matches: OpenStoreMatch[];
  cycle: AutonomousCycleReport | null;
}): OpenStoreApplicantSummary[] {
  const byPosition = new Map<string, AutonomousCycleReport["candidates"]>();
  if (input.cycle) {
    for (const c of input.cycle.candidates) {
      const key = c.positionId ?? "";
      if (!key) continue;
      const list = byPosition.get(key) ?? [];
      list.push(c);
      byPosition.set(key, list);
    }
  }

  const rows = input.matches.map((m) => {
    const candidates = m.positionId ? (byPosition.get(m.positionId) ?? []) : [];
    const planned = candidates.reduce((n, c) => n + (c.paperworkTasksPlanned || 0), 0);
    const sent = candidates.filter((c) => c.paperworkExecuted).length;
    const failures = candidates.filter((c) => c.outcome === "error").length;
    const autoAdvance = candidates.filter((c) => c.outcome === "auto_advance").length;
    return {
      projectNo: m.open.projectNo,
      projectName: m.open.projectName,
      city: m.open.city,
      state: m.open.state,
      districtManager: m.open.districtManager,
      sheetApplicantCount: effectiveApplicantCount({
        applicantCount: m.open.applicantCount,
        breezyCandidates: m.breezyPost?.candidates,
      }),
      breezyPostName: m.breezyPost?.name ?? null,
      positionId: m.positionId,
      matchConfidence: m.confidence,
      cyclePulled: candidates.length,
      cycleAutoAdvance: autoAdvance,
      cyclePaperworkPlanned: planned,
      cyclePaperworkSent: sent,
      cycleFailures: failures,
      matchNotes: m.matchNotes,
    };
  });

  // Keep highest-volume stores first in report output
  return rows.sort((a, b) => {
    const diff = b.sheetApplicantCount - a.sheetApplicantCount;
    if (diff !== 0) return diff;
    return `${a.city}, ${a.state}`.localeCompare(`${b.city}, ${b.state}`);
  });
}

export function buildTopStoresByApplicants(
  rows: OpenStoreApplicantSummary[],
  limit = 5,
): OpenStoreTopStoreSummary[] {
  return rows.slice(0, limit).map((row) => ({
    city: row.city,
    state: row.state,
    applicantCount: row.sheetApplicantCount,
    breezyPostName: row.breezyPostName,
    matchConfidence: row.matchConfidence,
  }));
}

export function buildReportTotals(input: {
  matches: OpenStoreMatch[];
  applicantsPerStore: OpenStoreApplicantSummary[];
  cycle: AutonomousCycleReport | null;
  canaryLimit: number;
  dryRun: boolean;
}): {
  totalSheetApplicants: number;
  totalQualifiedApplicants: number;
  estimatedPaperworkSends: number;
} {
  const totalSheetApplicants = input.applicantsPerStore.reduce(
    (n, r) => n + r.sheetApplicantCount,
    0,
  );

  const cycleAdvance = input.cycle?.autoAdvance ?? 0;
  const cyclePlanned = input.cycle?.paperworkPlanned ?? 0;
  const matchedSheetApplicants = input.applicantsPerStore
    .filter((r) => r.matchConfidence !== "unmatched" && r.matchConfidence !== "ambiguous")
    .reduce((n, r) => n + r.sheetApplicantCount, 0);

  // Prefer live cycle qualification when available; else sheet matched volume.
  const totalQualifiedApplicants =
    input.cycle != null ? cycleAdvance : matchedSheetApplicants;

  let estimatedPaperworkSends =
    input.cycle != null
      ? Math.max(cyclePlanned, cycleAdvance)
      : matchedSheetApplicants;

  if (!input.dryRun) {
    estimatedPaperworkSends = Math.min(estimatedPaperworkSends, input.canaryLimit);
  }

  return { totalSheetApplicants, totalQualifiedApplicants, estimatedPaperworkSends };
}

export function formatOpenStoresPaperworkMarkdown(
  report: OpenStoresPaperworkSendReport,
): string {
  const lines: string[] = [];
  lines.push(`# Open Stores Paperwork Send`);
  lines.push("");
  lines.push(`- Generated: ${report.generatedAt}`);
  lines.push(
    `- Mode: **${modeLabel(report)}** (dryRun=${report.dryRun}, confirmLive=${report.confirmLive}, canaryLimit=${report.canaryLimit})`,
  );
  lines.push(`- Workbook: \`${report.xlsxPath}\``);
  if (report.forceAutoAdvance) {
    lines.push(`- **WARNING: ${FORCE_AUTO_ADVANCE_WARNING}** (forced=${report.forcedAutoAdvanceCount})`);
  }
  lines.push(`- Stores with applicants: ${report.opensWithApplicants}`);
  lines.push(`- Total sheet applicants: ${report.totalSheetApplicants}`);
  lines.push(`- Qualified / estimated paperwork: ${report.totalQualifiedApplicants} / ${report.estimatedPaperworkSends}`);
  lines.push(
    `- Matched / unmatched / ambiguous: ${report.matchedOpens} / ${report.unmatchedOpens} / ${report.ambiguousOpens}`,
  );
  lines.push(`- Unique live positionIds: ${report.uniquePositionIds}`);
  lines.push(`- Paperwork planned / sent: ${report.totalPaperworkPlanned} / ${report.totalPaperworkSent}`);
  lines.push(
    `- Applicants tracked: planned=${report.applicantTally.planned} sent=${report.applicantTally.sent} skipped=${report.applicantTally.skipped}`,
  );
  lines.push(`- Failures: ${report.totalFailures}`);
  lines.push("");
  lines.push(`## Top stores by applicants`);
  lines.push("");
  for (const [i, store] of report.topStoresByApplicants.entries()) {
    lines.push(
      `${i + 1}. **${store.city}, ${store.state}** — ${store.applicantCount} applicants` +
        (store.breezyPostName ? ` → ${store.breezyPostName}` : " (no post match)"),
    );
  }
  if (report.applicants.length) {
    lines.push("");
    lines.push(`## Applicants processed`);
    lines.push("");
    lines.push(`| Status | Name | Email | Store | Paperwork | Skip reason |`);
    lines.push(`| --- | --- | --- | --- | --- | --- |`);
    for (const a of report.applicants) {
      lines.push(
        `| ${a.status} | ${a.name} | ${a.email ?? "—"} | ${a.storeLabel ?? a.breezyPostName ?? "—"} | ${a.paperworkType} | ${a.skipReason ?? "—"} |`,
      );
    }
  }
  lines.push("");
  lines.push(`## Applicants per store`);
  lines.push("");
  lines.push(
    `| City | State | Sheet # | Post | PositionId | Confidence | Pulled | Planned | Sent | Failures |`,
  );
  lines.push(`| --- | --- | ---: | --- | --- | --- | ---: | ---: | ---: | ---: |`);
  for (const row of report.applicantsPerStore) {
    lines.push(
      `| ${row.city} | ${row.state} | ${row.sheetApplicantCount} | ${row.breezyPostName ?? "—"} | ${row.positionId ?? "—"} | ${row.matchConfidence} | ${row.cyclePulled} | ${row.cyclePaperworkPlanned} | ${row.cyclePaperworkSent} | ${row.cycleFailures} |`,
    );
  }
  if (report.failures.length) {
    lines.push("");
    lines.push(`## Failures`);
    lines.push("");
    for (const f of report.failures) {
      lines.push(`- ${f.candidateId}: ${f.error}${f.storeHint ? ` (${f.storeHint})` : ""}`);
    }
  }
  if (report.warnings.length) {
    lines.push("");
    lines.push(`## Warnings`);
    lines.push("");
    for (const w of report.warnings) lines.push(`- ${w}`);
  }
  lines.push("");
  return lines.join("\n");
}

/**
 * Human-readable terminal summary (default CLI output).
 * Pass `showApplicants: true` to append the full Applicants Processed section.
 */
export function formatOpenStoresPaperworkStdout(
  report: OpenStoresPaperworkSendReport,
  options: { showApplicants?: boolean } = {},
): string {
  const lines: string[] = [];
  const divider = "─".repeat(56);

  lines.push(divider);
  lines.push(` Open Stores Paperwork Send  ·  ${modeLabel(report)}`);
  lines.push(divider);
  if (report.forceAutoAdvance) {
    lines.push(` !!! ${FORCE_AUTO_ADVANCE_WARNING}`);
    lines.push(` !!! Forced applicants this run: ${report.forcedAutoAdvanceCount}`);
    lines.push(divider);
  }
  lines.push(` Workbook:  ${report.xlsxPath}`);
  lines.push(
    ` Mode:      dry-run=${report.dryRun}  confirmLive=${report.confirmLive}  canary=${report.canaryLimit}  forceAutoAdvance=${report.forceAutoAdvance}`,
  );
  lines.push("");
  lines.push(" Summary");
  lines.push(`   Stores with applicants:     ${report.opensWithApplicants}`);
  lines.push(`   Total sheet applicants:     ${report.totalSheetApplicants}`);
  lines.push(`   Qualified applicants:       ${report.totalQualifiedApplicants}`);
  lines.push(`   Estimated paperwork sends:  ${report.estimatedPaperworkSends}`);
  lines.push(
    `   Matched / unmatched / ambiguous:  ${report.matchedOpens} / ${report.unmatchedOpens} / ${report.ambiguousOpens}`,
  );
  lines.push(`   Live position IDs:          ${report.uniquePositionIds}`);
  lines.push(
    `   Paperwork planned / sent:  ${report.totalPaperworkPlanned} / ${report.totalPaperworkSent}`,
  );
  lines.push(
    `   Applicants tracked:        planned=${report.applicantTally.planned}  sent=${report.applicantTally.sent}  skipped=${report.applicantTally.skipped}`,
  );
  if (report.totalFailures > 0) {
    lines.push(`   Failures:                   ${report.totalFailures}`);
  }

  if (report.cycle) {
    lines.push("");
    lines.push(" P243 cycle");
    lines.push(
      `   pulled=${report.cycle.pulled}  scored=${report.cycle.scored}  advance=${report.cycle.autoAdvance}  review=${report.cycle.humanReview}  reject=${report.cycle.autoReject}`,
    );
    lines.push(
      `   skipped: idempotent=${report.cycle.skippedIdempotent}  alreadySent=${report.cycle.skippedAlreadySent}  stateMachine=${report.cycle.skippedStateMachine}  canary=${report.cycle.skippedCanaryCap}`,
    );
  }

  lines.push("");
  lines.push(" Top 5 stores by applicants");
  if (report.topStoresByApplicants.length === 0) {
    lines.push("   (none)");
  } else {
    for (const [i, store] of report.topStoresByApplicants.entries()) {
      const post = store.breezyPostName ? ` → ${store.breezyPostName}` : " → (unmatched)";
      lines.push(
        `   ${i + 1}. ${store.city}, ${store.state}  (${store.applicantCount})${post}`,
      );
    }
  }

  const problemStores = report.applicantsPerStore.filter(
    (r) => r.matchConfidence === "unmatched" || r.matchConfidence === "ambiguous",
  );
  if (problemStores.length) {
    lines.push("");
    lines.push(" Needs attention");
    for (const row of problemStores.slice(0, 12)) {
      lines.push(
        `   · ${row.city}, ${row.state}  [${row.matchConfidence}]  applicants=${row.sheetApplicantCount}`,
      );
    }
    if (problemStores.length > 12) {
      lines.push(`   · …and ${problemStores.length - 12} more`);
    }
  }

  if (options.showApplicants) {
    lines.push("");
    lines.push(" Applicants Processed");
    if (report.applicants.length === 0) {
      lines.push("   (none — run without --sheet-only to pull/score candidates)");
    } else {
      for (const a of report.applicants) {
        const store = a.storeLabel ?? a.breezyPostName ?? a.positionId ?? "unknown store";
        const email = a.email ?? "(no email)";
        const base = `   · [${a.status.toUpperCase()}] ${a.name} <${email}> — ${store} — ${a.paperworkType}`;
        if (a.forcedAutoAdvance) {
          lines.push(`${base} (forced_auto_advance${a.skipReason && a.status === "skipped" ? `; skip: ${a.skipReason}` : ""})`);
        } else if (a.status === "skipped" && a.skipReason) {
          lines.push(`${base} (skip: ${a.skipReason})`);
        } else if (a.qualifiedAdvanced) {
          lines.push(`${base} (qualified/advanced)`);
        } else {
          lines.push(base);
        }
      }
    }
  } else if (report.applicants.length > 0) {
    lines.push("");
    lines.push(
      ` Tip: pass --show-applicants to list ${report.applicants.length} tracked applicant(s) (also in JSON artifact).`,
    );
  }

  if (report.failures.length) {
    lines.push("");
    lines.push(" Failures");
    for (const f of report.failures.slice(0, 10)) {
      lines.push(`   · ${f.candidateId}: ${f.error}`);
    }
  }

  if (report.warnings.length) {
    lines.push("");
    lines.push(" Warnings");
    for (const w of report.warnings.slice(0, 8)) {
      lines.push(`   · ${w}`);
    }
  }

  lines.push(divider);
  return lines.join("\n");
}
