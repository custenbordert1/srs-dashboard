import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { recruitingDataDir } from "@/lib/recruiting-data-dir";
import type { CandidateIngestionStoreFile } from "@/lib/candidate-ingestion/types";
import type { BreezyExportImportRollbackFile } from "@/lib/p175-breezy-export-import/types";
import { P175_SOURCE_PHASE } from "@/lib/p175-breezy-export-import/types";

export async function writeExportImportRollback(input: {
  auditEntryId: string;
  store: CandidateIngestionStoreFile;
}): Promise<string> {
  const rollbackDir = path.join(recruitingDataDir(), "rollback");
  await mkdir(rollbackDir, { recursive: true });
  const rollbackPath = path.join(rollbackDir, `p175-export-import-${input.auditEntryId}.json`);
  const payload: BreezyExportImportRollbackFile = {
    sourcePhase: P175_SOURCE_PHASE,
    createdAt: new Date().toISOString(),
    auditEntryId: input.auditEntryId,
    store: input.store,
  };
  await writeFile(rollbackPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return rollbackPath;
}
