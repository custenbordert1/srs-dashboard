import type { P1751AutomationReadinessReport } from "@/lib/p175.1-post-import-automation-readiness/types";

export function formatP1751Markdown(report: P1751AutomationReadinessReport): string {
  const c = report.checks;
  const g = report.globalValidation;
  const p = report.paperworkSummary;
  const op = report.controlledOperatorSendCycle;

  return `# P175.1 — Post-Import Automation Readiness Validation

Generated: ${report.generatedAt}
Read-only: **${report.readOnly}**

## Conclusion

**${report.conclusion}**

## Integrity checks

| Check | Result |
|-------|--------|
| Ingestion count = 371 | ${c.ingestionCount371 ? "PASS" : "FAIL"} (${c.ingestionCountActual}) |
| P170 discovers newest 25 | ${c.p170Newest25Discoverable ? "PASS" : "FAIL"} (${c.p170DiscoverableCount}/25) |
| P157 evaluates newest 25 | ${c.p157Newest25Evaluated ? "PASS" : "FAIL"} (${c.p157EvaluatedCount}/25) |
| P169 maps newest 25 | ${c.p169Newest25Mapped ? "PASS" : "FAIL"} |
| P171 maps newest 25 | ${c.p171Newest25Mapped ? "PASS" : "FAIL"} |
| No duplicate paperwork risk (newest 25) | ${c.noDuplicatePaperworkRisk ? "PASS" : "FAIL"} |
| No active signature conflicts (newest 25) | ${c.noActiveSignatureConflicts ? "PASS" : "FAIL"} |
| No invalid emails (global) | ${c.noInvalidEmails ? "PASS" : "FAIL"} (${g.invalidEmailCount}) |
| No synthetic ID issues | ${c.noSyntheticIdDuplicates ? "PASS" : "FAIL"} |

## Source attribution (ingestion)

| Source | Count |
|--------|-------|
| breezy_export | ${g.exportSourceCount} |
| merged | ${g.mergedSourceCount} |
| breezy_api / legacy | ${g.apiSourceCount} |

## Global safety

| Metric | Count |
|--------|-------|
| Duplicate paperwork risk | ${g.duplicatePaperworkRiskCount} |
| Active signature conflicts | ${g.activeSignatureConflictCount} |
| Synthetic ID mismatches | ${g.syntheticIdMismatchCount} |
| Synthetic ID collisions | ${g.syntheticIdCollisionCount} |

## Paperwork projection (newest 25)

- P152 eligible: **${p.paperworkEligibleCount}**
- Expected P169 AUTO_SEND sends: **${p.expectedPaperworkSendCount}**
- Dropbox API projection: **${p.dropboxApiProjection.totalRequests}** (POST ${p.dropboxApiProjection.postRequests}, GET ${p.dropboxApiProjection.getRequests}) — within budget: **${p.dropboxApiProjection.withinBudget}**

## Controlled operator send cycle

- Safe: **${op.safe}**
- P169 gates pass: **${op.p169GatesPass}**
${op.p169BlockingFactors.length > 0 ? `- P169 blockers: ${op.p169BlockingFactors.join("; ")}` : ""}
${op.reasons.length > 0 ? op.reasons.map((r) => `- ${r}`).join("\n") : "- No additional blockers"}

## Newest 25 candidates

| # | Name | P170 | P157 | P169 | P171 | P152 | Blockers |
|---|------|------|------|------|------|------|----------|
${report.newest25
  .map(
    (r) =>
      `| ${r.rank} | ${r.name.slice(0, 24)} | ${r.foundInP170 ? "yes" : "no"} | ${r.p157Recommendation ?? "—"} | ${r.p169Outcome ?? "—"} | ${r.p171State ?? "—"} | ${r.paperworkEligible ? "yes" : "no"} | ${r.blockers.slice(0, 2).join("; ") || "—"} |`,
  )
  .join("\n")}

Full data: \`artifacts/p175.1-post-import-automation-readiness.json\`
`;
}
