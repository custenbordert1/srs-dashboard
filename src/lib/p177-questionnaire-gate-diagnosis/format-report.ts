import type { P177QuestionnaireGateReport } from "@/lib/p177-questionnaire-gate-diagnosis/types";

export function formatP177Markdown(report: P177QuestionnaireGateReport): string {
  const s = report.summary;
  const b = report.blockerBreakdown;
  const r = report.recommendedSafestChange;

  return `# P177 — Questionnaire Gate Diagnosis Before Paperwork

Generated: ${report.generatedAt}
Read-only: **${report.readOnly}**

## Conclusion

**${report.conclusion}**

## Key findings

- Export has questionnaire data: **${report.findings.exportHasQuestionnaireData}**
- Newest 25 with questionnaire in store: **${report.findings.apiStoreQuestionnaireCoverageNewest25}/25**
- Review Questionnaire count: **${s.reviewQuestionnaireCount}/25**
- Artificial workflow gate: **${b.artificial_workflow_gate}**
- True business requirement: **${b.true_business_requirement}**
- Would Send Paperwork (questionnaire bypass only): **${s.wouldSendIfQuestionnaireBypass}**
- Would Send Paperwork (questionnaire + Paperwork Needed): **${s.wouldSendIfFullBypass}**

## P157 Send Paperwork requirements

${report.findings.p157SendPaperworkRequirements.map((x) => `- ${x}`).join("\n")}

## Questionnaire fields checked

${report.findings.questionnaireFieldsChecked.map((x) => `- ${x}`).join("\n")}

## P152 vs questionnaire

${report.findings.questionnaireRequiredFor1099Onboarding}

P152 covers: ${report.findings.p152RiskChecks.join(", ")}

## Recommended safest change

**${r.change}**

${r.rationale}

- Classification: **${r.classification}**
- Expected paperwork sends after change: **${r.expectedPaperworkSendCount}**
- Dropbox projection: **${s.projectedDropboxAfterSafestChange}** API calls

Safety:
${r.safetyConfirmation.map((x) => `- ${x}`).join("\n")}

## Patricia Irby

- Recruiter: ${report.patriciaIrby.assignedRecruiter}
- P157 action: ${report.patriciaIrby.currentP157Action}
- Questionnaire in store: ${report.patriciaIrby.questionnaireAvailable ? "yes" : "no"} (${report.patriciaIrby.questionnaireAnswerCount} answers)
- P152 eligible: ${report.patriciaIrby.p152Eligible ? "yes" : "no"}
- Send if questionnaire bypass: ${report.patriciaIrby.wouldSendIfQuestionnaireBypass ? "yes" : "no"}
- Send if full bypass: ${report.patriciaIrby.wouldSendIfFullBypass ? "yes" : "no"}

${report.patriciaIrby.explanation}

## Newest 25 blocker breakdown

| # | Name | P157 | P152 | Q in store | Classification | Sim Q bypass | Sim full |
|---|------|------|------|------------|----------------|--------------|----------|
${report.newest25
  .map(
    (d) =>
      `| ${d.rank} | ${d.name.slice(0, 18)} | ${d.currentP157Action} | ${d.p152Eligible ? "yes" : "no"} | ${d.questionnaireAvailable ? "yes" : "no"} | ${d.blockerClassification} | ${d.simulatedP157IfQuestionnaireBypass} | ${d.simulatedP157IfQuestionnaireAndWorkflowBypass} |`,
  )
  .join("\n")}

## Must stay manual review (${report.mustStayManualReview.length})

${report.mustStayManualReview.map((m) => `- **${m.name}**: ${m.reason}`).join("\n") || "_None_"}

Full data: \`artifacts/p177-questionnaire-gate-diagnosis.json\`
`;
}
