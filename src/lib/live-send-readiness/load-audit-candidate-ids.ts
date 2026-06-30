import { readFile } from "node:fs/promises";
import { p97AuditLogPath } from "@/lib/approval-mode-production/approval-mode-store";
import type { P97AuditEntry } from "@/lib/approval-mode-production/types";

export async function loadP97AuditCandidateIds(): Promise<Set<string>> {
  try {
    const raw = await readFile(p97AuditLogPath(), "utf8");
    const ids = new Set<string>();
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const entry = JSON.parse(trimmed) as P97AuditEntry;
      if (entry.action === "approval_persist") {
        ids.add(entry.candidateId);
      }
    }
    return ids;
  } catch {
    return new Set();
  }
}
