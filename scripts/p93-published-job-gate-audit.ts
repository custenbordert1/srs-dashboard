import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildPublishedJobGateAuditFromStores } from "@/lib/published-job-gate-audit";

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
  const report = await buildPublishedJobGateAuditFromStores({ mtdOnly: true });
  const outDir = path.join(process.cwd(), ".data");
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, "p93-published-job-gate-audit.json");
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        metrics: report.metrics,
        primaryBlockerCounts: report.metrics.primaryBlockerCounts,
        exampleTraces: report.exampleTraces.map((t) => ({
          candidateId: t.candidateId,
          candidateName: t.candidateName,
          positionId: t.positionId,
          primaryBlocker: t.primaryBlocker,
          blockerReason: t.blockerReason,
          workflowStatus: t.workflowStatus,
          p83Action: t.p83.action,
          p84Eligible: t.p84.eligible,
        })),
        nextOperationalFix: report.nextOperationalFix,
        remainingBlockersBeforeP84Unlock: report.remainingBlockersBeforeP84Unlock,
      },
      null,
      2,
    ),
  );
  console.log(`\nWrote ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
