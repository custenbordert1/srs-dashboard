/** P229 markdown report formatter. */

import {
  P229_CATEGORY_LABELS,
  type P229AnalysisResult,
} from "@/lib/p229-routing-recovery-analysis/types";

export function formatP229MarkdownReport(result: P229AnalysisResult): string {
  const { categoryCounts: c, eligibility: e, routingCurrent, routingProjected } = result;
  const lines: string[] = [];

  lines.push("# P229 — Routing Quality Recovery & Eligibility Expansion");
  lines.push("");
  lines.push(`Generated: ${result.generatedAt}`);
  lines.push("");
  lines.push(
    "Execution mode: **read_only** (no candidate writes, no workflow/DM/recruiter changes, no Dropbox Sign, no MEL/Breezy writes).",
  );
  lines.push("");
  lines.push("## Executive Summary");
  lines.push("");
  lines.push(
    `- **Routing score:** ${routingCurrent.score}/100 (${routingCurrent.level}) → projected **${routingProjected.score}/100** (${routingProjected.level})`,
  );
  lines.push(
    `- **Send-eligible:** ${e.currentEligible} → projected **${e.projectedEligible}** (Δ ${e.increase >= 0 ? "+" : ""}${e.increase})`,
  );
  lines.push(
    `- **Routing-cleared (workflow-active):** blocked ${e.routingBlockedCurrent} → cleared after sim **${e.routingClearedProjected}** (Δ +${e.routingClearedIncrease})`,
  );
  lines.push(
    `- **Potential send-ready if Paperwork Needed:** ${e.potentialSendReadyIfPaperworkNeeded}`,
  );
  lines.push(
    `- **Recoverable (A–D):** ${c.A + c.B + c.C + c.D} · Operator (E): ${c.E} · Not recoverable (F): ${c.F}`,
  );
  lines.push("");
  lines.push("## Recoverable Candidates by Category");
  lines.push("");
  lines.push("| Cat | Meaning | Count |");
  lines.push("| --- | --- | ---: |");
  for (const key of ["A", "B", "C", "D", "E", "F"] as const) {
    lines.push(`| ${key} | ${P229_CATEGORY_LABELS[key]} | ${c[key]} |`);
  }
  lines.push("");
  lines.push("## Routing Quality Metrics");
  lines.push("");
  lines.push("| Metric | Current | Projected |");
  lines.push("| --- | ---: | ---: |");
  lines.push(`| Routing score | ${routingCurrent.score} | ${routingProjected.score} |`);
  lines.push(
    `| coverage_unknown | ${routingCurrent.coverageUnknownCount} | ${routingProjected.coverageUnknownCount} |`,
  );
  lines.push(
    `| missing_assigned_dm | ${routingCurrent.missingDmCount} | ${routingProjected.missingDmCount} |`,
  );
  lines.push(
    `| missing_location | ${routingCurrent.missingLocationCount} | ${routingProjected.missingLocationCount} |`,
  );
  lines.push(
    `| Coverage unknown % | ${(routingCurrent.coverageUnknownPct * 100).toFixed(1)}% | ${(routingProjected.coverageUnknownPct * 100).toFixed(1)}% |`,
  );
  lines.push(
    `| Missing DM % | ${(routingCurrent.missingDmPct * 100).toFixed(1)}% | ${(routingProjected.missingDmPct * 100).toFixed(1)}% |`,
  );
  lines.push("");
  lines.push("## Eligibility Simulation (in-memory only)");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("| --- | ---: |");
  lines.push(`| Current eligible | ${e.currentEligible} |`);
  lines.push(`| Projected eligible | ${e.projectedEligible} |`);
  lines.push(`| Increase | ${e.increase} |`);
  lines.push(`| Workflow-active evaluated | ${e.workflowActiveEvaluated} |`);
  lines.push(`| Potential if Paperwork Needed | ${e.potentialSendReadyIfPaperworkNeeded} |`);
  lines.push("");
  lines.push("### Batch feasibility");
  lines.push("");
  lines.push("| Batch | Feasible now | Feasible projected | Routing-ready estimate |");
  lines.push("| ---: | --- | --- | --- |");
  for (const b of e.batchFeasibility) {
    lines.push(
      `| ${b.batchSize} | ${b.feasibleNow ? "yes" : "no"} | ${b.feasibleProjected ? "yes" : "no"} | ${b.feasibleRoutingReady ? "yes" : "no"} |`,
    );
  }
  lines.push("");
  lines.push("## Top Recoverable Markets");
  lines.push("");
  lines.push("### States");
  lines.push("");
  lines.push("| State | Blocked | Recoverable | cov_unk | miss_DM | miss_loc |");
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: |");
  for (const s of result.markets.topRecoverableStates.slice(0, 8)) {
    lines.push(
      `| ${s.state} | ${s.blockedTotal} | ${s.recoverableTotal} | ${s.coverageUnknown} | ${s.missingAssignedDm} | ${s.missingLocation} |`,
    );
  }
  lines.push("");
  lines.push("### Cities");
  lines.push("");
  lines.push("| City | State | Blocked | A | B | C | D |");
  lines.push("| --- | --- | ---: | ---: | ---: | ---: | ---: |");
  for (const m of result.markets.topRecoverableCities.slice(0, 8)) {
    lines.push(
      `| ${m.city} | ${m.state} | ${m.blockedTotal} | ${m.recoverableA} | ${m.recoverableB} | ${m.recoverableC} | ${m.recoverableD} |`,
    );
  }
  lines.push("");
  lines.push("## Largest Remaining Blockers (after sim)");
  lines.push("");
  lines.push("| Blocker | Count |");
  lines.push("| --- | ---: |");
  for (const row of e.remainingBlockersAfterSim.slice(0, 12)) {
    lines.push(`| ${row.blocker} | ${row.count} |`);
  }
  lines.push("");
  lines.push("## Operational Impact (estimates)");
  lines.push("");
  lines.push(
    `- Additional paperwork candidates (est.): **${result.operationalImpact.additionalPaperworkCandidates}**`,
  );
  lines.push(
    `- Weekly onboarding capacity delta: **${result.operationalImpact.additionalWeeklyOnboardingCapacityLow}–${result.operationalImpact.additionalWeeklyOnboardingCapacityHigh}**`,
  );
  lines.push(`- Recruiter: ${result.operationalImpact.expectedRecruiterWorkloadDelta}`);
  lines.push(`- DM: ${result.operationalImpact.expectedDmWorkloadDelta}`);
  lines.push("");
  lines.push("## Recommended Engineering Priorities");
  lines.push("");
  for (const [i, p] of result.engineeringPriorities.entries()) {
    lines.push(`${i + 1}. ${p}`);
  }
  lines.push("");
  lines.push("## Safety Confirmation");
  lines.push("");
  lines.push("- No candidates modified");
  lines.push("- No workflow changed");
  lines.push("- No recruiter/DM assignments");
  lines.push("- No Dropbox Sign");
  lines.push("- No MEL/Breezy writes");
  lines.push("- No deployment");
  lines.push("- No commits/merges/pushes");
  lines.push("- Simulation not persisted to durable stores");
  lines.push("");

  return lines.join("\n");
}
