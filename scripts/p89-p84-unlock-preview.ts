import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildP84UnlockPreviewFromStores } from "@/lib/p84-unlock-preview";

async function main() {
  const report = await buildP84UnlockPreviewFromStores({ mtdOnly: true });
  const outDir = path.join(process.cwd(), ".data");
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, "p89-p84-unlock-preview.json");
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        summary: report.summary,
        exampleUnlockable: report.unlockable.slice(0, 3),
        exampleMonitorOnly: report.monitorOnly.slice(0, 2),
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
