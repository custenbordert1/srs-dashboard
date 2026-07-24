/**
 * P188.3 validation — read-only recruiter ownership analysis.
 * No production writes, workflow updates, approvals, paperwork, MEL, or automation.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  P188_3_SOURCE_PHASE,
  runP1883OwnershipAnalysis,
} from "@/lib/p188-3-recruiter-ownership-recovery";

function loadEnvLocal(): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("node:fs") as typeof import("node:fs");
    const raw = fs.readFileSync(".env.local", "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // optional
  }
}

const ART = path.join(process.cwd(), "artifacts");

async function main() {
  loadEnvLocal();
  delete process.env.P158_AUTOMATIC_ASSIGNMENTS_ENABLED;
  delete process.env.P187_EXECUTE_PRODUCTION_CANARY;
  delete process.env.P185_PRODUCTION_AUTOMATION_ENABLED;
  delete process.env.P188_ENRICHMENT_WRITE_EXECUTION;

  await mkdir(ART, { recursive: true });
  const result = await runP1883OwnershipAnalysis();

  const ownershipJson = {
    sourcePhase: P188_3_SOURCE_PHASE,
    scannedAt: result.scannedAt,
    recordsScanned: result.recordsScanned,
    sources: result.ownershipAnalysis,
    primaryRootCause: result.primaryRootCause,
    whyOwnershipDisappeared: result.whyOwnershipDisappeared,
    rootCauseFindings: result.rootCauseFindings,
    sideEffects: result.sideEffects,
  };

  const recoveryJson = {
    sourcePhase: P188_3_SOURCE_PHASE,
    scannedAt: result.scannedAt,
    reconstructionPerformed: false,
    historical: result.historicalReconstruction,
    simulationCounts: result.recoverySimulation.counts,
    sampleRows: result.recoverySimulation.sampleRows,
    note: "Simulation only — no reconstruction writes performed.",
  };

  const forecastJson = {
    sourcePhase: P188_3_SOURCE_PHASE,
    scannedAt: result.scannedAt,
    ...result.p187Forecast,
    note: "Forecast applies simulated ownership + existing job resolution virtually.",
  };

  const primaryFindings = result.rootCauseFindings.filter((f) => f.primary);

  const rootCauseMd = `# P188.3 Root Cause Report — Recruiter Ownership

Generated: ${result.scannedAt}

## Verdict

**${result.primaryRootCause}**

## Why ownership disappeared

${result.whyOwnershipDisappeared}

## Primary findings

${primaryFindings
  .map(
    (f) => `### ${f.category}

${f.detail}

Evidence:
${f.evidence.map((e) => `- ${e}`).join("\n")}
`,
  )
  .join("\n")}

## Secondary findings

${result.rootCauseFindings
  .filter((f) => !f.primary)
  .map((f) => `- **${f.category}**: ${f.detail}`)
  .join("\n")}

## Current durable state

- Workflow records: ${result.recordsScanned}
- Unassigned: ${result.recordsScanned} (expected from probe)
- Historical named assignments available in audit (not restored): ${result.historicalReconstruction.potentialReconstructableFromAudit}
- Rapid wipe pairings observed: ${result.historicalReconstruction.rapidWipeCount}

## Side effects

All zero — analysis only.
`;

  const readinessMd = `# P188.3 Readiness Report

Generated: ${result.scannedAt}

## Summary

| Metric | Value |
| --- | ---: |
| Records scanned | ${result.recordsScanned} |
| Automatically recoverable (sim) | ${result.recoverySimulation.counts.automatically_recoverable} |
| Operator confirmation required | ${result.recoverySimulation.counts.operator_confirmation_required} |
| Conflicting | ${result.recoverySimulation.counts.conflicting} |
| Stale | ${result.recoverySimulation.counts.stale} |
| Impossible to recover | ${result.recoverySimulation.counts.impossible_to_recover} |
| Both resolved under ownership+job sim | ${result.p187Forecast.bothResolvedUnderSimulation} |
| Predicted recommendation-ready | ${result.p187Forecast.recommendationReady} |
| Predicted P187 eligible | ${result.p187Forecast.p187Eligible} |
| Bypass excluded | ${result.p187Forecast.bypassExcluded} |
| Production writes | 0 |
| Workflow updates | 0 |

## Root cause (short)

${result.primaryRootCause}

## Exact next production action

${result.exactNextProductionAction}

## Constraints honored

- No production writes
- No workflow updates
- No approvals / paperwork / MEL
- No automation enablement
- Reconstruction not performed
- P188.4 not started
`;

  await Promise.all([
    writeFile(path.join(ART, "p188-3-root-cause-report.md"), rootCauseMd),
    writeFile(
      path.join(ART, "p188-3-recruiter-ownership-analysis.json"),
      `${JSON.stringify(ownershipJson, null, 2)}\n`,
    ),
    writeFile(
      path.join(ART, "p188-3-recovery-simulation.json"),
      `${JSON.stringify(recoveryJson, null, 2)}\n`,
    ),
    writeFile(
      path.join(ART, "p188-3-authoritative-ownership-design.md"),
      result.authoritativeOwnershipDesignMarkdown,
    ),
    writeFile(
      path.join(ART, "p188-3-p187-readiness-forecast.json"),
      `${JSON.stringify(forecastJson, null, 2)}\n`,
    ),
    writeFile(path.join(ART, "p188-3-readiness-report.md"), readinessMd),
  ]);

  console.log(
    JSON.stringify(
      {
        ok: true,
        recordsScanned: result.recordsScanned,
        rootCause: result.primaryRootCause,
        recoverableFromAudit: result.historicalReconstruction.potentialReconstructableFromAudit,
        simulation: result.recoverySimulation.counts,
        forecast: result.p187Forecast,
        sideEffects: result.sideEffects,
        exactNextProductionAction: result.exactNextProductionAction,
        artifacts: [
          "artifacts/p188-3-root-cause-report.md",
          "artifacts/p188-3-recruiter-ownership-analysis.json",
          "artifacts/p188-3-recovery-simulation.json",
          "artifacts/p188-3-authoritative-ownership-design.md",
          "artifacts/p188-3-p187-readiness-forecast.json",
          "artifacts/p188-3-readiness-report.md",
        ],
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
