import type { P176RecruiterAssignmentReport } from "@/lib/p176-recruiter-assignment-before-paperwork/types";

export function formatP176Markdown(report: P176RecruiterAssignmentReport): string {
  const s = report.summary;

  return `# P176 — Recruiter Assignment Before Paperwork Eligibility

Generated: ${report.generatedAt}
Mode: ${report.dryRun ? "**DRY RUN**" : "**ASSIGNED (workflow store only)**"}

## Conclusion

**${report.conclusion}**

## Safety

- Paperwork sent: **${s.paperworkSent}**
- Breezy writes: **none**
- Dropbox writes: **none**
- Duplicate paperwork risk in eligible set: **${s.noDuplicatePaperworkRisk ? "none" : "present"}**
${report.rollbackPath ? `- Rollback: \`${report.rollbackPath}\`` : ""}

## Summary

| Metric | Before | After |
|--------|--------|-------|
| Paperwork eligible (newest 25) | ${s.paperworkEligibleBefore} | ${s.paperworkEligibleAfter} |
| Recruiters assigned this run | — | ${s.recruitersAssigned} |
| Still blocked | — | ${s.stillBlockedCount} |
| Duplicate blocked | — | ${s.duplicateBlockedCount} |
| Newly paperwork eligible | — | ${s.newlyPaperworkEligible} |

## Paperwork projection (if send cycle ran)

- Expected AUTO_SEND count: **${s.expectedPaperworkSendCount}**
- Dropbox API projection: **${s.dropboxApiProjection.totalRequests}** (within budget: ${s.dropboxApiProjection.withinBudget})

## Newest 25 before / after

| # | Name | Recruiter before | Recruiter after | P157 | Eligible before | Eligible after | Blockers after |
|---|------|------------------|-----------------|------|-----------------|----------------|----------------|
${report.after
  .map((row) => {
    const prev = report.before.find((b) => b.candidateId === row.candidateId);
    return `| ${row.rank} | ${row.name.slice(0, 20)} | ${prev?.assignedRecruiter ?? "—"} | ${row.assignedRecruiter} | ${row.p157Recommendation ?? "—"} | ${prev?.paperworkEligible ? "yes" : "no"} | ${row.paperworkEligible ? "yes" : "no"} | ${row.blockers.slice(0, 1).join("; ") || "—"} |`;
  })
  .join("\n")}

## Assignments applied

| Name | Recruiter | Confidence | Status |
|------|-----------|------------|--------|
${report.assignments
  .filter((a) => !a.skippedReason)
  .slice(0, 30)
  .map((a) => `| ${a.name} | ${a.recruiter} | ${a.confidence}% | applied |`)
  .join("\n") || "| — | — | — | none |"}

Full data: \`artifacts/p176-recruiter-assignment-before-paperwork.json\`
`;
}
