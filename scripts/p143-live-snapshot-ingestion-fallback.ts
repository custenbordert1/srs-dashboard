/**
 * P143 — Live Snapshot Ingestion Fallback artifact
 * Usage: npx tsx scripts/p143-live-snapshot-ingestion-fallback.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildLiveSnapshotIngestionFallbackArtifact } from "@/lib/p143-live-snapshot-ingestion-fallback/build-live-snapshot-ingestion-fallback-artifact";

async function main() {
  const artifact = await buildLiveSnapshotIngestionFallbackArtifact();
  const artifactPath = path.join(process.cwd(), "artifacts", "p143-live-snapshot-ingestion-fallback.json");
  await mkdir(path.dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        ok: true,
        artifactPath,
        beforePreview: artifact.beforeCounts.previewOnly,
        beforeUi: artifact.beforeCounts.uiWouldShowBeforeFix,
        afterCount: artifact.afterCounts.liveSnapshotCandidateCount,
        candidateSource: artifact.afterCounts.candidateSource,
        syncStatus: artifact.afterCounts.syncStatus,
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
