/**
 * P142 — Candidate Sync & Operations Command Center Recovery (diagnostic)
 * Usage: npx tsx scripts/p142-candidate-sync-diagnostic.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildCandidateSyncDiagnostic } from "@/lib/p142-candidate-sync-diagnostic";

async function main() {
  const report = await buildCandidateSyncDiagnostic();
  const artifactPath = path.join(process.cwd(), "artifacts", "p142-candidate-sync-diagnostic.json");
  await mkdir(path.dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        ok: true,
        artifactPath,
        issueClassification: report.issueClassification,
        rootCause: report.rootCause,
        exactFailingComponent: report.exactFailingComponent,
        ingestionCandidateCount: report.ingestionStore.candidateCount,
        liveSnapshotCandidatesPulled: report.liveSnapshot.candidatesPulled,
        paperworkCandidateCount: report.paperworkCandidateSource.candidateCount,
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
