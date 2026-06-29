import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PaperworkSendAuditEvent } from "@/lib/autonomous-paperwork-send-engine/types";
import { recruitingDataDir } from "@/lib/recruiting-data-dir";

const MAX_AUDIT_EVENTS = 500;

function auditPath(): string {
  return path.join(recruitingDataDir(), "p84-paperwork-send-audit.json");
}

type AuditStoreFile = {
  events: PaperworkSendAuditEvent[];
  updatedAt: string;
};

export async function loadPaperworkSendAuditLog(): Promise<PaperworkSendAuditEvent[]> {
  try {
    const raw = await readFile(auditPath(), "utf8");
    const parsed = JSON.parse(raw) as AuditStoreFile;
    return parsed.events ?? [];
  } catch {
    return [];
  }
}

export async function appendPaperworkSendAuditEvent(
  event: PaperworkSendAuditEvent,
): Promise<PaperworkSendAuditEvent[]> {
  const existing = await loadPaperworkSendAuditLog();
  const events = [event, ...existing].slice(0, MAX_AUDIT_EVENTS);
  const now = new Date().toISOString();
  await mkdir(recruitingDataDir(), { recursive: true });
  await writeFile(auditPath(), `${JSON.stringify({ events, updatedAt: now }, null, 2)}\n`, "utf8");
  return events;
}

export function buildPaperworkSendAuditEventId(referenceMs: number, candidateId: string): string {
  return `p84-audit-${candidateId}-${referenceMs}`;
}
