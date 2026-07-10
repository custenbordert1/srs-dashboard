import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PaperworkExecutionAuditEvent } from "@/lib/autonomous-paperwork-execution-engine/types";
import {recruitingDataDir, safeRecruitingMkdir } from "@/lib/recruiting-data-dir";

const MAX_AUDIT_EVENTS = 500;

function auditPath(): string {
  return path.join(recruitingDataDir(), "p71-paperwork-execution-audit.json");
}

type AuditStoreFile = {
  events: PaperworkExecutionAuditEvent[];
  updatedAt: string;
};

export async function loadPaperworkExecutionAuditLog(): Promise<PaperworkExecutionAuditEvent[]> {
  try {
    const raw = await readFile(auditPath(), "utf8");
    const parsed = JSON.parse(raw) as AuditStoreFile;
    return parsed.events ?? [];
  } catch {
    return [];
  }
}

export async function appendPaperworkExecutionAuditEvent(
  event: PaperworkExecutionAuditEvent,
): Promise<PaperworkExecutionAuditEvent[]> {
  const existing = await loadPaperworkExecutionAuditLog();
  const events = [event, ...existing].slice(0, MAX_AUDIT_EVENTS);
  const now = new Date().toISOString();
  await safeRecruitingMkdir();
  await writeFile(auditPath(), `${JSON.stringify({ events, updatedAt: now }, null, 2)}\n`, "utf8");
  return events;
}

export function buildAuditEventId(referenceMs: number, candidateId: string): string {
  return `audit-${candidateId}-${referenceMs}`;
}
