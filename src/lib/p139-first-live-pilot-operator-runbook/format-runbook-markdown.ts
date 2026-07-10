import type { FirstLivePilotOperatorRunbookReport } from "@/lib/p139-first-live-pilot-operator-runbook/types";

function checklistLines(items: Array<{ label: string; passed?: boolean; detail?: string; instruction?: string; expectedValue?: string }>): string {
  return items
    .map((item) => {
      if (item.passed !== undefined) {
        const status = item.passed ? "PASS" : "PENDING";
        return `- [ ] **${item.label}** — ${status}${item.detail ? ` — ${item.detail}` : ""}`;
      }
      return `- [ ] **${item.label}** — expected: \`${item.expectedValue ?? "—"}\`${item.instruction ? ` — ${item.instruction}` : ""}`;
    })
    .join("\n");
}

export function formatRunbookMarkdown(report: FirstLivePilotOperatorRunbookReport): string {
  const { candidate, terminalCommands, rollbackInstructions } = report;

  return `# P139 — First Live Pilot Operator Runbook

**Operator:** ${report.operator}  
**Generated:** ${report.generatedAt}  
**Mode:** ${report.mode} (no automatic sends)

---

## Pilot candidate

| Field | Value |
|-------|-------|
| Name | ${candidate.candidateName} |
| Candidate ID | \`${candidate.candidateId}\` |
| Email | ${candidate.email} |
| Phone | ${candidate.phone ?? "— (not in local store)"} |
| Breezy job/project | ${candidate.breezyJobOrProject} |
| Position ID | ${candidate.positionId ?? "—"} |
| Dropbox Sign template | ${candidate.dropboxSignTemplate} (\`${candidate.dropboxSignTemplateKey}\`) |
| P124 approval | ${candidate.p124ApprovalDecision} |
| Approval score | ${candidate.approvalScore} |

---

## Phase status

### P137 — First Live Send Readiness Gate

- **GO / NO-GO:** ${report.p137ReadinessStatus.goNoGo}
- **Reason:** ${report.p137ReadinessStatus.goNoGoReason}
- **Target candidate matches P137 selection:** ${report.p137ReadinessStatus.isP137PrimarySelection ? "Yes — P137 primary selection" : report.p137ReadinessStatus.designatedTargetInAutoApprovedCohort ? "P139 designated target — in P137 AUTO_APPROVED cohort" : "No — verify Erica is AUTO_APPROVED before proceeding"}

### P138 — Post-send verification (run after P122 executeOne)

- **Overall:** ${report.p138VerificationStatus.overallResult} (expected **FAIL** before live send)
- **Reason:** ${report.p138VerificationStatus.goNoGoReason}
- **Note:** ${report.p138VerificationStatus.note}

---

## System safety checklist

${checklistLines(report.safetyChecklist.map((c) => ({ label: c.label, passed: c.passed, detail: c.detail })))}

---

## Human review checklist (Breezy — Taylor)

Verify manually in Breezy before running the live command:

${checklistLines(report.humanReviewChecklist.map((c) => ({ label: c.label, expectedValue: c.expectedValue, instruction: c.instruction })))}

---

## Terminal commands

Run from the project root: \`${process.cwd()}\`

### 1. Pause scheduler (recommended before live send)

\`\`\`bash
${terminalCommands.pauseSchedulerCommand}
\`\`\`

### 2. Enable pilot env vars (one candidate only)

\`\`\`bash
${terminalCommands.enablePilotEnv.join("\n")}
\`\`\`

### 3. Allowlist Erica only

\`\`\`bash
${terminalCommands.allowlistEricaOnly}
\`\`\`

### 4. Execute first live send (P122 executeOne — Taylor runs after Breezy review)

\`\`\`bash
${terminalCommands.p122LivePilotCommand}
\`\`\`

### 5. Verify send and apply safety lock (P138)

\`\`\`bash
${terminalCommands.p138VerificationCommand}
\`\`\`

### 6. Disable live env vars afterward

\`\`\`bash
${terminalCommands.disableLiveEnv.join("\n")}
\`\`\`

---

## Rollback / stop instructions

### Confirm no second send

${rollbackInstructions.confirmNoSecondSend.map((line) => `- ${line}`).join("\n")}

### Clear allowlist

${rollbackInstructions.clearAllowlist.map((line) => `- ${line}`).join("\n")}

### Pause scheduler

${rollbackInstructions.pauseScheduler.map((line) => `- ${line}`).join("\n")}

### Verify duplicate protection

${rollbackInstructions.verifyDuplicateProtection.map((line) => `- ${line}`).join("\n")}

### Confirm audit record

${rollbackInstructions.confirmAuditRecord.map((line) => `- ${line}`).join("\n")}

---

## Safety invariants

- **executeBatch:** forbidden — use executeOne only
- **Breezy writes:** none from automation — Taylor verifies in Breezy UI only
- **Pilot cap:** 1 send maximum
- **Continuous mode:** do not enable
- **P122** is the only component that may call executeOne

---

*This runbook does not send paperwork. Taylor executes the live command manually after completing the Breezy review checklist.*
`;
}
