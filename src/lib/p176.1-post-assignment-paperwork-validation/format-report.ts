import type { P1761PostAssignmentReport } from "@/lib/p176.1-post-assignment-paperwork-validation/types";

export function formatP1761Markdown(report: P1761PostAssignmentReport): string {
  const s = report.summary;
  const p = report.patriciaIrby;
  const op = report.controlledOperatorSendCycle;

  return `# P176.1 — Post-Assignment Paperwork Eligibility Validation

Generated: ${report.generatedAt}
Read-only: **${report.readOnly}**

## Conclusion

**${report.conclusion}**

## Summary

| Metric | Value |
|--------|-------|
| P157 Assign Recruiter (before P176) | ${s.p157AssignRecruiterBefore} |
| P157 Send Paperwork (after P176) | ${s.p157SendPaperworkAfter} |
| P157 action changed | ${s.p157ActionChangedCount} |
| P152 eligible before | ${s.p152EligibleBefore} |
| P152 eligible after | ${s.p152EligibleAfter} |
| Ready for paperwork (P157 + P152) | **${s.readyForPaperworkCount}** |
| Still blocked | ${s.stillBlockedCount} |
| Duplicate blocked | ${s.duplicateBlockedCount} |
| Projected Dropbox API calls | ${s.projectedDropboxApiCalls} |

## Patricia Irby

| Check | Result |
|-------|--------|
| Assigned to Logan | ${p.assignedToLogan ? "yes" : "no"} (${p.assignedRecruiter}) |
| P170 discoverable | ${p.p170Discoverable ? "yes" : "no"} |
| P157 evaluated | ${p.p157Evaluated ? "yes" : "no"} |
| P157 action | ${p.p157Action ?? "—"} |
| P152 paperwork eligible | ${p.p152PaperworkEligible ? "yes" : "no"} |
| Ready for send | ${p.readyForSend ? "yes" : "no"} |
| Blockers | ${p.blockers.join("; ") || "none"} |

## Controlled operator send

- Safe: **${op.safe}**
- P169 gates pass: **${op.p169GatesPass}**
${op.p169BlockingFactors.length > 0 ? `- Blockers: ${op.p169BlockingFactors.join("; ")}` : ""}
${op.reasons.map((r) => `- ${r}`).join("\n")}

## Ready for paperwork (${report.readyForPaperwork.length})

${report.readyForPaperwork.length > 0 ? report.readyForPaperwork.map((r) => `- **${r.name}** (${r.email}) — ${r.recruiter} · P157: ${r.p157Action}`).join("\n") : "_None_"}

## Newest 25

| # | Name | Recruiter | P157 before → after | P152 before/after | Ready |
|---|------|-----------|---------------------|-------------------|-------|
${report.newest25
  .map(
    (r) =>
      `| ${r.rank} | ${r.name.slice(0, 22)} | ${r.assignedRecruiter} | ${r.p157Before ?? "—"} → ${r.p157After ?? "—"} | ${r.p152EligibleBefore ? "yes" : "no"}/${r.p152EligibleAfter ? "yes" : "no"} | ${r.readyForPaperwork ? "yes" : "no"} |`,
  )
  .join("\n")}

Full data: \`artifacts/p176.1-post-assignment-paperwork-validation.json\`
`;
}
