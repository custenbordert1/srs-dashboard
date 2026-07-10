/**
 * P123 — Autonomous Paperwork Orchestrator Production Readiness
 * Usage: npx tsx scripts/p123-production-readiness.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildProductionReadinessReport } from "@/lib/autonomous-paperwork-orchestrator";

async function main() {
  const report = await buildProductionReadinessReport();
  const artifactPath = path.join(process.cwd(), "artifacts", "p123-production-readiness.json");
  await mkdir(path.dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        ok: true,
        artifactPath,
        goNoGo: report.goNoGo,
        readyCount: report.readyCandidates.length,
        blockedCount: report.blockedCandidates.length,
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
