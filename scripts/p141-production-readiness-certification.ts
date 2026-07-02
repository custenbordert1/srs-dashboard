/**
 * P141 — Production Readiness Validation & Pilot Certification
 * Usage: npx tsx scripts/p141-production-readiness-certification.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildProductionReadinessCertification,
  formatCertificationMarkdown,
} from "@/lib/p141-production-readiness-certification";

async function main() {
  const report = await buildProductionReadinessCertification({ skipHistoryAppend: true });
  const artifactsDir = path.join(process.cwd(), "artifacts");
  const jsonPath = path.join(artifactsDir, "p141-production-readiness-certification.json");
  const mdPath = path.join(artifactsDir, "p141-production-readiness-certification.md");

  await mkdir(artifactsDir, { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(mdPath, formatCertificationMarkdown(report), "utf8");

  console.log(
    JSON.stringify(
      {
        ok: true,
        jsonPath,
        mdPath,
        productionReadinessScore: report.productionReadinessScore,
        finalRecommendation: report.finalRecommendation,
        subsystemPass: report.subsystemCertifications.filter((c) => c.result === "PASS").length,
        subsystemFail: report.subsystemCertifications.filter((c) => c.result === "FAIL").length,
        safetyPass: report.safetyVerifications.filter((s) => s.passed).length,
        safetyFail: report.safetyVerifications.filter((s) => !s.passed).length,
        executeBatchCalled: false,
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
