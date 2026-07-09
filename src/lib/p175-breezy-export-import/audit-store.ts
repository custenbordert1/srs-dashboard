import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { recruitingDataDir } from "@/lib/recruiting-data-dir";
import type { BreezyExportImportAuditEntry } from "@/lib/p175-breezy-export-import/types";

const AUDIT_FILE = "p175-breezy-export-import-audit.jsonl";

function auditPath(): string {
  return path.join(recruitingDataDir(), AUDIT_FILE);
}

export async function appendBreezyExportImportAudit(
  entry: BreezyExportImportAuditEntry,
): Promise<void> {
  await mkdir(recruitingDataDir(), { recursive: true });
  await writeFile(auditPath(), `${JSON.stringify(entry)}\n`, { encoding: "utf8", flag: "a" });
}

export function newAuditEntryId(): string {
  return randomUUID();
}
