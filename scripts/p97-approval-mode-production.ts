import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildApprovalModeProductionFromStores } from "@/lib/approval-mode-production";

function loadEnvLocal(): void {
  try {
    const envPath = path.resolve(".env.local");
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // use process env
  }
}

async function main() {
  loadEnvLocal();
  const report = await buildApprovalModeProductionFromStores({ mtdOnly: true });
  const outDir = path.join(process.cwd(), ".data");
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, "p97-approval-mode-production-report.json");
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        metrics: report.metrics,
        auditLogPath: report.auditLogPath,
        rollbackArtifactPath: report.rollbackArtifactPath,
        stateArtifactPath: report.stateArtifactPath,
        sampleTraces: report.sampleTraces,
        remainingBlockersBeforeLivePaperwork: report.remainingBlockersBeforeLivePaperwork,
      },
      null,
      2,
    ),
  );
  console.log(`\nWrote ${outPath}`);
  console.log("\nTo persist, POST /api/approval-mode-production with { candidateIds: [...] }");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
