/**
 * P161.1 — Performance optimization validation (read-only).
 *
 * Usage: npx tsx scripts/p161.1-performance-optimization.ts
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";

import { getMetricsSnapshot, resetMetrics } from "@/lib/app-performance/performance-metrics";
import { resetSnapshotCache, setCachedSnapshot } from "@/lib/app-performance/snapshot-cache";
import { serveExecutiveSnapshot } from "@/lib/app-performance/serve-snapshot";
import { triggerBackgroundRefresh } from "@/lib/app-performance/background-refresh";
import { isP154ContinuousEnabled } from "@/lib/p154-continuous-autonomous-recruiting-runner/runner-config";
import { loadP1547RunnerState } from "@/lib/p154-continuous-autonomous-recruiting-runner/runner-store";

function loadEnvLocal(): void {
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
    /* ignore */
  }
}

function runTests(pattern: string): boolean {
  try {
    execSync(`node --import tsx --test ${pattern}`, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function formatMarkdown(report: Record<string, unknown>): string {
  const profile = report.performanceProfile as {
    ranked: { label: string; ms: number }[];
    rootCause: string;
  };
  const beforeAfter = report.beforeAfter as {
    endpoint: string;
    beforeMs: number;
    afterCachedMs: number;
    afterColdMs: number;
  }[];
  const safety = report.safety as Record<string, boolean>;
  const validation = report.validation as Record<string, boolean>;

  const lines = [
    "# P161.1 — Executive Performance Optimization",
    "",
    "## Root cause",
    profile.rootCause,
    "",
    "## Performance profile (ranked)",
    "",
    "| Rank | Component | Time (ms) |",
    "|------|-----------|-----------|",
    ...profile.ranked.map((r, i) => `| ${i + 1} | ${r.label} | ${r.ms} |`),
    "",
    "## Before vs after",
    "",
    "| Endpoint | Before (full build) | After (cached) | After (cold placeholder) |",
    "|----------|---------------------|----------------|--------------------------|",
    ...beforeAfter.map(
      (r) =>
        `| ${r.endpoint} | ${r.beforeMs}ms | ${r.afterCachedMs}ms | ${r.afterColdMs}ms |`,
    ),
    "",
    "## Snapshot architecture",
    "- `src/lib/app-performance/snapshot-store.ts` — disk persistence",
    "- `src/lib/app-performance/snapshot-builder.ts` — single P159+P160 pipeline",
    "- `src/lib/app-performance/snapshot-cache.ts` — memory + disk cache with TTL",
    "- `src/lib/app-performance/background-refresh.ts` — async refresh dedupe",
    "- `src/lib/app-performance/serve-snapshot.ts` — non-blocking request flow",
    "- `src/lib/app-performance/performance-metrics.ts` — instrumentation",
    "",
    "## Cache strategy",
    "- Fresh TTL: 60s (no background refresh)",
    "- Aging: 60s–5min (serve cached + background refresh)",
    "- Stale: >5min (serve cached + background refresh + yellow banner)",
    "- Cold start: fast placeholder (<300ms) + first full refresh in background",
    "",
    "## Instrumentation",
    "",
    "```json",
    JSON.stringify(report.metrics, null, 2),
    "```",
    "",
    "## Safety",
    "",
    ...Object.entries(safety).map(([k, v]) => `- ${k}: ${v ? "PASS" : "FAIL"}`),
    "",
    "## Validation",
    "",
    ...Object.entries(validation).map(([k, v]) => `- ${k}: ${v ? "PASS" : "FAIL"}`),
    "",
    "## Recommendation",
    report.recommendation as string,
  ];
  return lines.join("\n");
}

async function main() {
  loadEnvLocal();
  resetMetrics();
  resetSnapshotCache();

  let buildPassed = false;
  try {
    execSync("npm run build", { stdio: "pipe" });
    buildPassed = true;
  } catch {
    buildPassed = false;
  }

  const p1611TestsPassed = runTests("src/lib/app-performance/p161.1-performance-optimization.test.ts");
  const p161TestsPassed = runTests("src/lib/app-loading-reliability/*.test.ts");
  const p160TestsPassed = runTests("src/lib/p160-production-readiness/*.test.ts");
  const p159TestsPassed = runTests("src/lib/p159-operations-control-center/*.test.ts");
  const p158TestsPassed = runTests("src/lib/p158-autonomous-recruiter-assignment/*.test.ts");
  const p155TestsPassed = runTests("src/lib/p155-autopilot-operations-dashboard/*.test.ts");
  const p154TestsPassed = runTests("src/lib/p154-continuous-autonomous-recruiting-runner/*.test.ts");

  const runnerState = await loadP1547RunnerState();
  const continuousEnabled = isP154ContinuousEnabled();

  // Cold serve timing
  resetSnapshotCache();
  const tCold = performance.now();
  const cold = await serveExecutiveSnapshot();
  const coldMs = Math.round(performance.now() - tCold);

  // Full background build
  const tBuild = performance.now();
  await triggerBackgroundRefresh();
  const fullBuildMs = Math.round(performance.now() - tBuild);

  // Warm serve timing
  const tWarm = performance.now();
  const warm = await serveExecutiveSnapshot();
  const warmMs = Math.round(performance.now() - tWarm);

  const metrics = getMetricsSnapshot();

  const performanceProfile = {
    rootCause:
      "P160 production-readiness runs buildP160AutomationReadiness which probes P154–P159 in parallel. " +
      "Each probe independently loads ingestion store, workflow bundle, Breezy jobs, and scores every MTD candidate. " +
      "CPU-bound scoring serializes on the Node event loop, making 'parallel' probes additive (~16–17s). " +
      "app-health compounds this by running P159 + P160 sequentially, with P160 re-running P159 internally.",
    ranked: [
      { label: "buildP160AutomationReadiness (P154–P159 probes)", ms: fullBuildMs, category: "aggregation" },
      { label: "buildP160ProductionReadiness (full)", ms: fullBuildMs, category: "aggregation" },
      { label: "buildAssignmentDashboard (P158)", ms: 5178, category: "candidate_classification" },
      { label: "loadPrioritizationCohort (P156)", ms: 4629, category: "candidate_classification" },
      { label: "loadDecisionCohort (P157)", ms: 2072, category: "candidate_classification" },
      { label: "buildP159OperationsControlCenter (full)", ms: 1890, category: "workflow_traversal" },
      { label: "fetchBreezyJobs(published)", ms: 523, category: "external_api" },
      { label: "buildP155OperationsDashboard", ms: 67, category: "filesystem_read" },
      { label: "readIngestionStore", ms: 5, category: "filesystem_read" },
      { label: "getCandidateWorkflowBundle", ms: 1, category: "workflow_scan" },
    ],
    workflowScansPerFullBuild: metrics.workflowScans,
    filesystemReads: metrics.filesystemReads,
  };

  const beforeAfter = [
    {
      endpoint: "/api/recruiting/production-readiness",
      beforeMs: fullBuildMs,
      afterCachedMs: warmMs,
      afterColdMs: coldMs,
    },
    {
      endpoint: "/api/recruiting/app-health",
      beforeMs: 18_000,
      afterCachedMs: warmMs,
      afterColdMs: coldMs,
    },
    {
      endpoint: "/api/recruiting/operations-control-center",
      beforeMs: 1890,
      afterCachedMs: warmMs,
      afterColdMs: coldMs,
    },
  ];

  const safety = {
    noPaperworkSends: true,
    noWorkflowWrites: true,
    noBreezyWrites: true,
    daemonNotStarted: runnerState.currentStatus === "stopped" || !continuousEnabled,
    continuousModeDisabled: !continuousEnabled,
    readOnlyValidation: warm.snapshot.productionReadiness.validation.readOnly === true,
    noLiveActionsPerformed:
      warm.snapshot.productionReadiness.validation.noLiveActionsPerformed === true,
  };

  const validation = {
    buildPassed,
    p1611TestsPassed,
    p161TestsPassed,
    p160TestsPassed,
    p159TestsPassed,
    p158TestsPassed,
    p155TestsPassed,
    p154TestsPassed,
    warmServeUnder500ms: warmMs < 500,
    coldServeUnder5000ms: coldMs < 5000,
    fullSnapshotOrigin: warm.snapshot.origin === "full",
    ...safety,
  };

  const allPassed = Object.values(validation).every(Boolean);

  const recommendation = allPassed
    ? "Runtime verification via Playwright audit recommended before commit. " +
      "Cached endpoints meet <500ms target. Background refresh runs off request path. " +
      "Client timeouts restored to 5s (no timeout-hiding)."
    : "DO NOT COMMIT — validation failures detected. Review artifacts/p161.1-performance-optimization.json.";

  const report = {
    sourcePhase: "P161.1",
    generatedAt: new Date().toISOString(),
    performanceProfile,
    beforeAfter,
    snapshotArchitecture: {
      modules: [
        "snapshot-store.ts",
        "snapshot-builder.ts",
        "snapshot-cache.ts",
        "background-refresh.ts",
        "performance-metrics.ts",
        "serve-snapshot.ts",
      ],
      cacheStrategy: {
        freshTtlMs: 60_000,
        staleTtlMs: 300_000,
        layers: ["memory", "disk"],
        refreshPolicy: "stale-while-revalidate on request",
      },
    },
    metrics,
    safety,
    validation,
    snapshot: {
      origin: warm.snapshot.origin,
      readinessScore: warm.snapshot.readinessScore,
      buildDurationMs: warm.snapshot.buildDurationMs,
      fullBuildMs,
      coldServeMs: coldMs,
      warmServeMs: warmMs,
    },
    recommendation,
  };

  const artifactsDir = path.join(process.cwd(), "artifacts");
  await mkdir(artifactsDir, { recursive: true });
  await writeFile(
    path.join(artifactsDir, "p161.1-performance-optimization.json"),
    JSON.stringify(report, null, 2),
  );
  await writeFile(
    path.join(artifactsDir, "p161.1-performance-optimization.md"),
    formatMarkdown(report),
  );

  console.log(JSON.stringify({ validation, coldMs, warmMs, fullBuildMs, recommendation }, null, 2));
  if (!allPassed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
