/**
 * P149 — Production Readiness and Live Activation
 * Usage: npx tsx scripts/p149-autonomous-recruiting-production-readiness.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildAutonomousRecruitingProductionReadiness,
  formatProductionReadinessMarkdown,
} from "@/lib/p149-autonomous-recruiting-production-readiness";

async function main() {
  const session = {
    userId: "p149-script",
    email: "script@local",
    name: "P149 Script",
    role: "executive" as const,
    territoryStates: [],
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  };

  const report = await buildAutonomousRecruitingProductionReadiness({ session });
  const jsonPath = path.join(process.cwd(), "artifacts", "p149-autonomous-recruiting-production-readiness.json");
  const mdPath = path.join(process.cwd(), "artifacts", "p149-autonomous-recruiting-production-readiness.md");
  await mkdir(path.dirname(jsonPath), { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(mdPath, formatProductionReadinessMarkdown(report), "utf8");

  console.log(
    JSON.stringify(
      {
        ok: true,
        jsonPath,
        mdPath,
        productionReadinessScore: report.productionReadinessScore,
        finalRecommendation: report.finalRecommendation,
        subsystemPass: report.subsystemValidations.filter((s) => s.result === "PASS").length,
        subsystemFail: report.subsystemValidations.filter((s) => s.result === "FAIL").length,
        candidatesEvaluated: report.liveDryRun.candidatesEvaluated,
        executeBatchCalled: false,
        breezyWrites: false,
        paperworkSent: false,
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
