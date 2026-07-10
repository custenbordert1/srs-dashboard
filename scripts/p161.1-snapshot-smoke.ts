/**
 * P161.1 — Snapshot layer smoke test (read-only).
 * Verifies cold-start returns a fast placeholder, background refresh produces a
 * full snapshot, and subsequent reads are served instantly from cache.
 *
 * Usage: npx tsx scripts/p161.1-snapshot-smoke.ts
 */
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

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

async function main() {
  loadEnvLocal();
  const { serveExecutiveSnapshot } = await import("@/lib/app-performance/serve-snapshot");
  const { triggerBackgroundRefresh } = await import("@/lib/app-performance/background-refresh");
  const { getMetricsSnapshot } = await import("@/lib/app-performance/performance-metrics");
  const { resetSnapshotCache } = await import("@/lib/app-performance/snapshot-cache");

  resetSnapshotCache();

  const t0 = performance.now();
  const cold = await serveExecutiveSnapshot();
  const coldMs = performance.now() - t0;
  console.log(`COLD serve: ${coldMs.toFixed(0)}ms origin=${cold.snapshot.origin} stale=${cold.meta.stale} refreshing=${cold.meta.refreshing}`);

  console.log("Awaiting first full background refresh...");
  const tBuild = performance.now();
  await triggerBackgroundRefresh();
  console.log(`Full snapshot built in ${(performance.now() - tBuild).toFixed(0)}ms`);

  const t1 = performance.now();
  const warm = await serveExecutiveSnapshot();
  const warmMs = performance.now() - t1;
  console.log(`WARM serve: ${warmMs.toFixed(0)}ms origin=${warm.snapshot.origin} stale=${warm.meta.stale} age=${warm.meta.ageSeconds}s fromMemory=${warm.meta.fromMemory}`);

  const t2 = performance.now();
  const warm2 = await serveExecutiveSnapshot();
  const warm2Ms = performance.now() - t2;
  console.log(`WARM serve #2: ${warm2Ms.toFixed(0)}ms origin=${warm2.snapshot.origin}`);

  console.log("\nSnapshot contents:");
  console.log("  readinessScore:", warm.snapshot.readinessScore);
  console.log("  queueSummary:", JSON.stringify(warm.snapshot.queueSummary));
  console.log("  todaysPaperwork:", JSON.stringify(warm.snapshot.todaysPaperwork));
  console.log("  daemonStatus:", JSON.stringify(warm.snapshot.daemonStatus));
  console.log("  validation:", JSON.stringify(warm.snapshot.productionReadiness.validation));

  console.log("\nMetrics:");
  const m = getMetricsSnapshot();
  console.log(`  cacheHit%=${m.cacheHitRatePct} cacheMiss%=${m.cacheMissRatePct} refreshes=${m.backgroundRefreshes} builds(avg)=${m.avgSnapshotBuildMs}ms fsReads=${m.filesystemReads} workflowScans=${m.workflowScans}`);
  console.log(`  longestFunction=${m.longestFunction?.label} maxMs=${m.longestFunction?.maxMs}`);

  const targets: string[] = [];
  if (coldMs >= 5000) targets.push(`COLD serve too slow: ${coldMs.toFixed(0)}ms`);
  if (warmMs >= 500) targets.push(`WARM serve exceeds 500ms target: ${warmMs.toFixed(0)}ms`);
  if (warm.snapshot.origin !== "full") targets.push("WARM snapshot not full");
  if (targets.length > 0) {
    console.log("\nFAILURES:\n" + targets.map((t) => "  - " + t).join("\n"));
    process.exit(1);
  }
  console.log("\nSMOKE PASS ✔");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
