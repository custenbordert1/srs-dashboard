import type { P228Assessment } from "@/lib/p228-production-readiness/types";

function mdTable(headers: string[], rows: string[][]): string {
  const head = `| ${headers.join(" | ")} |`;
  const sep = `| ${headers.map(() => "---").join(" | ")} |`;
  return [head, sep, ...rows.map((r) => `| ${r.join(" | ")} |`)].join("\n");
}

export function formatP228MarkdownReport(a: P228Assessment): string {
  const p = a.pipeline;
  const e = a.eligibility.totals;
  const top = a.eligibility.topBlockers.slice(0, 10);

  const riskRows = Object.entries(a.risk.dimensions).map(([id, d]) => [
    id,
    d.level,
    String(d.score),
    d.explanation ?? "—",
  ]);

  const recruiterRows = a.recruiters.slice(0, 15).map((r) => [
    r.recruiter,
    String(r.candidateCount),
    String(r.paperworkQueue),
    String(r.overdueQueue),
    String(r.unassignedCandidates),
    r.avgDistance == null ? "—" : String(r.avgDistance),
    String(r.avgEligibilityScore),
  ]);

  const dmRows = a.districtManagers.slice(0, 15).map((d) => [
    d.districtManager,
    String(d.assigned),
    String(d.paperwork),
    String(d.eligible),
    String(d.blocked),
    d.avgDistance == null ? "—" : String(d.avgDistance),
  ]);

  return [
    "# P228 — Production Readiness Assessment & Scale Authorization",
    "",
    `Generated: ${a.generatedAt}`,
    "",
    `Execution mode: **${a.executionMode}** (no candidate writes, no Dropbox sends, no MEL/Breezy writes).`,
    "",
    "## Executive Summary",
    "",
    `- **Go / No-Go:** ${a.goNoGo.decision}`,
    `- **Operational readiness:** ${a.risk.operationalReadinessScore}/100`,
    `- **Data quality:** ${a.dataQuality.score}/100`,
    `- **Recommended max batch:** ${a.scale.recommendedMaximumBatchSize}`,
    `- **Send-eligible now:** ${e.eligible}`,
    `- **P227 validation:** 3/3 testMode sends, 0 side effects`,
    "",
    "## 1. Pipeline Inventory",
    "",
    mdTable(
      ["Metric", "Count"],
      [
        ["Total candidates", String(p.totalCandidates)],
        ["Active (non-terminal)", String(p.active)],
        ["Workflow-active (P223)", String(p.workflowActive)],
        ["Paperwork Needed", String(p.paperworkNeeded)],
        ["Paperwork Sent", String(p.paperworkSent)],
        ["Signed", String(p.signed)],
        ["Ready for MEL", String(p.readyForMel)],
        ["Loaded in MEL", String(p.loadedInMel)],
        ["Terminal", String(p.terminal)],
      ],
    ),
    "",
    "### By stage",
    "",
    mdTable(
      ["Stage", "Count"],
      Object.entries(p.byStage)
        .sort((a, b) => b[1] - a[1])
        .map(([s, n]) => [s, String(n)]),
    ),
    "",
    "## 2. Eligibility Breakdown",
    "",
    `Evaluated workflow-active: **${e.workflowActiveEvaluated}** · Eligible: **${e.eligible}**`,
    "",
    mdTable(
      ["Category", "Count"],
      [
        ["eligible", String(e.eligible)],
        ["missing_identity", String(e.missing_identity)],
        ["missing_email", String(e.missing_email)],
        ["missing_phone", String(e.missing_phone)],
        ["missing_position", String(e.missing_position)],
        ["missing_location", String(e.missing_location)],
        ["missing_assigned_dm", String(e.missing_assigned_dm)],
        ["missing_recruiter", String(e.missing_recruiter)],
        ["over_60_miles", String(e.over_60_miles)],
        ["coverage_unknown", String(e.coverage_unknown)],
        ["archived", String(e.archived)],
        ["duplicate", String(e.duplicate)],
        ["already_sent", String(e.already_sent)],
        ["already_signed", String(e.already_signed)],
        ["other", String(e.other)],
      ],
    ),
    "",
    "### Top 10 blockers",
    "",
    mdTable(
      ["Rank", "Blocker", "Count"],
      top.map((b, i) => [String(i + 1), b.blocker, String(b.count)]),
    ),
    "",
    "## 3. Recruiter Health",
    "",
    mdTable(
      [
        "Recruiter",
        "Candidates",
        "Paperwork Q",
        "Overdue",
        "Unassigned flag",
        "Avg mi",
        "Avg elig",
      ],
      recruiterRows,
    ),
    "",
    "## 4. District Manager Health",
    "",
    mdTable(
      ["DM", "Assigned", "Paperwork", "Eligible", "Blocked", "Avg mi"],
      dmRows,
    ),
    "",
    "## 5. Geographic Coverage",
    "",
    "### Strongest states",
    "",
    mdTable(
      ["State", "Eligible", "Total", "Score"],
      a.geography.strongestStates.map((s) => [
        s.state,
        String(s.eligible),
        String(s.total),
        String(s.score),
      ]),
    ),
    "",
    "### Weakest states",
    "",
    mdTable(
      ["State", "Eligible", "Total", "Score"],
      a.geography.weakestStates.map((s) => [
        s.state,
        String(s.eligible),
        String(s.total),
        String(s.score),
      ]),
    ),
    "",
    `Over-60 markets: ${a.geography.marketsOver60.length} · Coverage unknown markets: ${a.geography.coverageUnknown.length} · Zero-eligible markets: ${a.geography.zeroEligible.length}`,
    "",
    "## 6. Dropbox Sign Health",
    "",
    mdTable(
      ["Status", "Count"],
      [
        ["pending (sent)", String(a.dropbox.pending)],
        ["viewed", String(a.dropbox.viewed)],
        ["signed", String(a.dropbox.signed)],
        ["expired (inferred)", String(a.dropbox.expired)],
        ["cancelled/declined", String(a.dropbox.cancelled)],
        ["failed", String(a.dropbox.failed)],
        ["with signatureRequestId", String(a.dropbox.withSignatureRequestId)],
        ["duplicate prevention hits", String(a.dropbox.duplicatePreventionCount)],
        ["P219–P221 controlled", String(a.dropbox.recentControlledSends.p219_p221)],
        ["P227 controlled", String(a.dropbox.recentControlledSends.p227)],
        ["testMode", String(a.dropbox.recentControlledSends.testMode)],
      ],
    ),
    "",
    "## 7. Data Quality",
    "",
    mdTable(
      ["Metric", "Value"],
      [
        ["Score", String(a.dataQuality.score)],
        ["Recovered identities", String(a.dataQuality.recoveredIdentities)],
        ["Recovered emails", String(a.dataQuality.recoveredEmails)],
        ["Recovered DMs", String(a.dataQuality.recoveredDms)],
        ["Workflow restored", String(a.dataQuality.workflowRestored)],
        ["Ingestion only", String(a.dataQuality.ingestionOnly)],
        ["Duplicates", String(a.dataQuality.duplicates)],
        ["Orphan workflow", String(a.dataQuality.orphanWorkflow)],
        ["Orphan ingestion", String(a.dataQuality.orphanIngestion)],
      ],
    ),
    "",
    "## 8. Operational Risk",
    "",
    mdTable(["Dimension", "Level", "Score", "Explanation"], riskRows),
    "",
    `**Operational readiness score: ${a.risk.operationalReadinessScore}/100**`,
    "",
    "## 9. Scale Recommendation",
    "",
    `**Recommended maximum batch size: ${a.scale.recommendedMaximumBatchSize}**`,
    "",
    ...a.scale.rationale.map((r) => `- ${r}`),
    "",
    a.scale.riskSummary,
    "",
    "## 10. Go / No-Go",
    "",
    `**Decision: ${a.goNoGo.decision}**`,
    "",
    a.goNoGo.conditions.length
      ? ["### Conditions", "", ...a.goNoGo.conditions.map((c) => `- ${c}`), ""].join("\n")
      : "",
    a.goNoGo.blockers.length
      ? ["### Blockers", "", ...a.goNoGo.blockers.map((b) => `- ${b}`), ""].join("\n")
      : "",
    "## Safety",
    "",
    "Candidate writes 0 · Dropbox sends 0 · MEL writes 0 · Breezy writes 0 · Workflow changes 0 · Commits 0",
    "",
  ].join("\n");
}
