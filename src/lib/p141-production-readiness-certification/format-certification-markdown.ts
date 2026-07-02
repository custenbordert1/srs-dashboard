import type { ProductionReadinessCertificationReport } from "@/lib/p141-production-readiness-certification/types";

function passFailRows(items: Array<{ label: string; result: string; detail: string }>): string {
  return items.map((item) => `| ${item.label} | ${item.result} | ${item.detail} |`).join("\n");
}

export function formatCertificationMarkdown(report: ProductionReadinessCertificationReport): string {
  const subsystemRows = report.subsystemCertifications.map((s) => ({
    label: `${s.phase} — ${s.name}`,
    result: s.result,
    detail: s.detail,
  }));

  const safetyRows = report.safetyVerifications.map((s) => ({
    label: s.label,
    result: s.passed ? "PASS" : "FAIL",
    detail: s.detail,
  }));

  return `# P141 — Production Readiness Validation & Pilot Certification

**Generated:** ${report.generatedAt}  
**Mode:** ${report.mode} (audit only — no sends)

---

## Final recommendation

**${report.finalRecommendation}**

**Production readiness score:** ${report.productionReadinessScore}/100

---

## Subsystem certification (P122–P140)

| Subsystem | Result | Detail |
|-----------|--------|--------|
${passFailRows(subsystemRows)}

---

## Safety verification

| Check | Result | Detail |
|-------|--------|--------|
${passFailRows(safetyRows)}

---

## Dry-run simulation

| Field | Value |
|-------|-------|
| Live mode | ${report.dryRunSimulation.liveModeEnabled ? "ON (risk)" : "OFF"} |
| Paperwork sent | ${report.dryRunSimulation.paperworkSent ? "yes" : "no"} |
| executeBatch | ${report.dryRunSimulation.executeBatchCalled ? "called" : "not called"} |
| Breezy writes | ${report.dryRunSimulation.breezyWrites ? "yes" : "no"} |
| Pilot candidate | ${report.dryRunSimulation.pilotCandidateId ?? "—"} |
| P137 GO/NO-GO | ${report.dryRunSimulation.p137GoNoGo ?? "—"} |
| P138 verification | ${report.dryRunSimulation.p138OverallResult ?? "—"} |
| P140 health | ${report.dryRunSimulation.productionHealthResult ?? "—"} |

Phases simulated: ${report.dryRunSimulation.phasesSimulated.join(", ")}

---

## Remaining risks

${report.remainingRisks.map((r) => `- ${r}`).join("\n")}

---

## Required manual operator actions

${report.requiredManualOperatorActions.map((a) => `- ${a}`).join("\n")}

---

## Suggested improvements

${report.suggestedImprovements.map((s) => `- ${s}`).join("\n")}

---

## Safety invariants

- No paperwork sent during certification
- No Breezy writes
- No live mode enabled by P141
- No executeBatch()
- P122 execution logic unchanged

---

*Certification audit only. Taylor executes first live pilot per P139 runbook after completing manual actions.*
`;
}
