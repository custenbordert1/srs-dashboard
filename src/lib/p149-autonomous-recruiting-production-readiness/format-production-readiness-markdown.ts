import type { ProductionReadinessReport } from "@/lib/p149-autonomous-recruiting-production-readiness/types";

function passFail(result: string): string {
  return result;
}

export function formatProductionReadinessMarkdown(report: ProductionReadinessReport): string {
  const subsystemRows = report.subsystemValidations
    .map(
      (s) =>
        `| ${s.phase} — ${s.name} | ${passFail(s.result)} | ${s.detail} | API ${s.apiOk ? "✓" : "✗"} | UI ${s.uiOk ? "✓" : "✗"} |`,
    )
    .join("\n");

  const e2eRows = report.e2eWorkflowTransitions
    .map((t) => `| ${t.step} | ${t.stage} | ${t.phase} | ${t.sampleCount} | ${t.description} |`)
    .join("\n");

  const checklistRows = report.goLiveChecklist
    .map((c) => `| ${c.category} | ${c.item} | ${c.status} | ${c.notes} |`)
    .join("\n");

  const activationRows = report.automationActivation
    .map(
      (a) =>
        `| ${a.automation} | \`${a.envFlag}\` | ${a.safeToEnable ? "Yes" : "No"} | ${a.requiresManualApproval ? "Yes" : "No"} | ${a.notes} |`,
    )
    .join("\n");

  return `# P149 — Production Readiness and Live Activation Report

**Generated:** ${report.generatedAt}  
**Mode:** ${report.mode} (audit only — no live sends)

---

## Final recommendation

**${report.finalRecommendation}**

**Production readiness score:** ${report.productionReadinessScore}/100

---

## Phase 1 — System validation (P143–P148)

| Subsystem | Result | Detail | API | UI |
|-----------|--------|--------|-----|-----|
${subsystemRows}

---

## Phase 2 — End-to-end workflow transitions

| Step | Stage | Phase | Samples | Description |
|------|-------|-------|---------|-------------|
${e2eRows}

---

## Phase 3 — Live dry run

| Metric | Value |
|--------|-------|
| Candidates evaluated | ${report.liveDryRun.candidatesEvaluated} |
| Eligible initial paperwork | ${report.liveDryRun.eligibleInitialPaperwork} |
| Eligible reminders | ${report.liveDryRun.eligibleReminders} |
| Blocked candidates | ${report.liveDryRun.blockedCandidates} |
| False positives (manual review) | ${report.liveDryRun.falsePositives} |
| Execution time (ms) | ${report.liveDryRun.executionTimeMs} |
| Phases completed | ${report.liveDryRun.phaseTimings.length} |

### Safety checks

${Object.entries(report.liveDryRun.safetyChecks)
  .map(([key, value]) => `- ${key}: ${value}`)
  .join("\n")}

---

## Phase 7 — Performance

| Metric | Value |
|--------|-------|
| Run duration (ms) | ${report.performance.runDurationMs} |
| API latency (ms) | ${report.performance.apiLatencyMs} |
| Cache hit rate | ${report.performance.cacheHitRate}% |
| Snapshot age (min) | ${report.performance.snapshotAgeMinutes ?? "—"} |

---

## Phase 8 — Go-live checklist

| Category | Item | Status | Notes |
|----------|------|--------|-------|
${checklistRows}

---

## Automation activation guide

| Automation | Env flag | Safe to enable | Manual approval | Notes |
|------------|----------|----------------|-----------------|-------|
${activationRows}

---

## Business impact estimate

| Metric | Value |
|--------|-------|
| Recruiter hours saved / week | ${report.businessImpact.estimatedRecruiterHoursSavedPerWeek}h |
| Manual touch reduction | ${report.businessImpact.estimatedManualTouchReductionPercent}% |
| Candidates processed today | ${report.businessImpact.candidatesProcessedToday} |

---

## Known risks

${report.knownRisks.length > 0 ? report.knownRisks.map((r) => `- ${r}`).join("\n") : "- None identified"}

---

## Recommended configuration

\`\`\`
${Object.entries(report.recommendedConfiguration)
  .map(([key, value]) => `${key}=${value}`)
  .join("\n")}
\`\`\`

---

## Safety confirmation

- executeBatch: not called
- Breezy writes: disabled
- Paperwork sent: ${report.paperworkSent ? "yes" : "no"}
- Live mode: ${report.liveModeEnabled ? "ON (risk)" : "OFF"}
`;
}
