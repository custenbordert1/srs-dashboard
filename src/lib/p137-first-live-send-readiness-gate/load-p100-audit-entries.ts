import { readFile } from "node:fs/promises";
import { p100AuditLogPath } from "@/lib/controlled-live-send/controlled-live-send-store";
import type { ControlledLiveSendExecutionEntry } from "@/lib/controlled-live-send/types";

export async function loadP100AuditEntries(): Promise<ControlledLiveSendExecutionEntry[]> {
  try {
    const raw = await readFile(p100AuditLogPath(), "utf8");
    return raw
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as ControlledLiveSendExecutionEntry);
  } catch {
    return [];
  }
}

export function hasCleanAuditHistory(
  candidateId: string,
  auditEntries: ControlledLiveSendExecutionEntry[],
): boolean {
  const forCandidate = auditEntries.filter((entry) => entry.candidateId === candidateId);
  if (forCandidate.length === 0) return true;
  return forCandidate.every((entry) => entry.outcome === "simulated" && !entry.error);
}
