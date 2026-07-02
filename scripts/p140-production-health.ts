/**
 * P140 — Production Rollout & Health Monitoring
 * Usage: npx tsx scripts/p140-production-health.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildProductionHealthReport } from "@/lib/p140-production-rollout-health-monitoring";

async function main() {
  const report = await buildProductionHealthReport();
  const artifactPath = path.join(process.cwd(), "artifacts", "p140-production-health.json");
  await mkdir(path.dirname(artifactPath), { recursive: true });

  const artifact = {
    sourcePhase: report.sourcePhase,
    generatedAt: report.generatedAt,
    mode: report.mode,
    overallHealthScore: report.overallHealthScore,
    overallResult: report.overallResult,
    componentStatuses: report.componentStatuses,
    activeAlerts: report.activeAlerts,
    metrics: report.metrics,
    historicalMetrics: report.historicalMetrics,
    recommendations: report.recommendations,
    executivePanel: report.executivePanel,
    executeBatchCalled: report.executeBatchCalled,
    breezyWrites: report.breezyWrites,
    liveModeEnabled: report.liveModeEnabled,
    paperworkSent: report.paperworkSent,
  };

  await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        ok: true,
        artifactPath,
        overallHealthScore: report.overallHealthScore,
        overallResult: report.overallResult,
        activeAlerts: report.activeAlerts.length,
        executeBatchCalled: false,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
