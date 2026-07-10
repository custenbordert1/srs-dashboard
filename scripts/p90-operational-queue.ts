import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildP84OperationalQueueFromStores } from "@/lib/p84-operational-queue";

async function main() {
  const report = await buildP84OperationalQueueFromStores({ mtdOnly: true });
  const outDir = path.join(process.cwd(), ".data");
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, "p90-operational-queue.json");
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        metrics: report.metrics,
        sampleUnlockable: report.unlockable.slice(0, 2).map((e) => ({
          candidateName: e.candidateName,
          queueStatus: e.queueStatusLabel,
          nextAction: e.nextAction,
          steps: e.steps.map((s) => ({
            step: s.stepLabel,
            pending: s.pending,
            manualApprovalRequired: s.manualApprovalRequired,
          })),
        })),
        remainingBlockersBeforeLiveSend: report.remainingBlockersBeforeLiveSend,
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
