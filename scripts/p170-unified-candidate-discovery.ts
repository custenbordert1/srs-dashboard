/**
 * P170 — Unified Candidate Discovery & Search validation (read-only).
 * Verifies that searching "Irby" immediately returns Patricia Irby from the
 * durable ingestion store (or via the existing P153.2 lookup rescue) regardless
 * of preview scan progress, and confirms no production surfaces were mutated.
 *
 * Usage: npx tsx scripts/p170-unified-candidate-discovery.ts
 */
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getDropboxSignApiMetricsSnapshot } from "../src/lib/dropbox-sign-api/metrics.ts";
import { isP154ContinuousEnabled } from "../src/lib/p154-continuous-autonomous-recruiting-runner/runner-config.ts";
import { loadP1547RunnerState } from "../src/lib/p154-continuous-autonomous-recruiting-runner/runner-store.ts";
import {
  assertP170UsesExistingArchitecture,
  discoverCandidate,
  formatP170Markdown,
  validateP170ReadOnly,
} from "../src/lib/p170-unified-candidate-discovery/index.ts";
import { P170_SOURCE_PHASE } from "../src/lib/p170-unified-candidate-discovery/types.ts";

function loadEnvLocal() {
  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq <= 0) continue;
      let v = t.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      process.env[t.slice(0, eq).trim()] = v;
    }
  } catch {
    /* optional */
  }
}

function fileMtimeMs(filePath: string): number | null {
  try {
    return statSync(filePath).mtimeMs;
  } catch {
    return null;
  }
}

loadEnvLocal();

const TARGET_QUERY = process.env.P170_TEST_QUERY ?? "Irby";

async function main() {
  const runnerBefore = await loadP1547RunnerState();
  const before = {
    continuousMode: isP154ContinuousEnabled(),
    runnerStatus: runnerBefore.currentStatus,
    schedulerMode: runnerBefore.schedulerMode,
    dailySent: runnerBefore.dailyMetrics.sent,
    dropboxTotal: getDropboxSignApiMetricsSnapshot().totalRequests,
    workflowMtime: fileMtimeMs(".data/candidate-workflows.json"),
    runnerMtime: fileMtimeMs(".data/p1547-runner-state.json"),
    auditMtime: fileMtimeMs(".data/p145-paperwork-automation-audit.json"),
  };

  const result = await discoverCandidate(TARGET_QUERY);
  const validation = await validateP170ReadOnly({ before });
  const arch = assertP170UsesExistingArchitecture();

  const isIrby = result.candidate
    ? /irby/i.test(result.candidate.name) || /irby/i.test(result.candidate.email ?? "")
    : false;

  const checks: Record<string, boolean> = {
    resultRendered: result.sourcePhase === P170_SOURCE_PHASE,
    readOnlyFlag: result.readOnly === true,
    patriciaFound: result.found && isIrby,
    sourceIndicated: result.source != null,
    discoveryStatusPresent: result.discovery != null,
    usesIngestionStore: arch.usesIngestionStore,
    usesP153RescuePath: arch.usesP153RescuePath,
    noFullIndexRebuild: arch.noFullIndexRebuild,
    validationReadOnlyPassed: validation.passed,
  };

  const allPassed = Object.values(checks).every(Boolean);

  const artifact = {
    sourcePhase: P170_SOURCE_PHASE,
    generatedAt: new Date().toISOString(),
    query: TARGET_QUERY,
    result,
    validation,
    architecture: arch,
    checks,
  };

  mkdirSync(path.join(process.cwd(), "artifacts"), { recursive: true });
  const jsonPath = path.join(process.cwd(), "artifacts", "p170-unified-candidate-discovery.json");
  const mdPath = path.join(process.cwd(), "artifacts", "p170-unified-candidate-discovery.md");
  writeFileSync(jsonPath, `${JSON.stringify(artifact, null, 2)}\n`);
  writeFileSync(
    mdPath,
    `${formatP170Markdown(result)}\n\n## Validation\n\n\`\`\`json\n${JSON.stringify(checks, null, 2)}\n\`\`\`\n`,
  );

  console.log(`P170 validation ${allPassed ? "PASSED" : "FAILED"}`);
  console.log(`Query: "${TARGET_QUERY}"`);
  console.log(`Found: ${result.found}${result.candidate ? ` — ${result.candidate.name}` : ""}`);
  console.log(`Source: ${result.source ?? "—"}`);
  console.log(`Rescue invoked: ${result.rescueInvoked} (${result.rescueSource ?? "n/a"})`);
  console.log(`Hydrated into store: ${result.hydratedIntoStore}`);
  console.log(`Read-only validation: ${validation.passed ? "clean" : "MUTATION DETECTED"}`);
  if (result.warnings.length > 0) console.log(`Warnings: ${result.warnings.join(" · ")}`);
  console.log(`Artifacts: ${jsonPath}`);

  if (!allPassed) process.exitCode = 1;
}

void main();
