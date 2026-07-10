import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { recruitingDataDir, safeRecruitingMkdir } from "@/lib/recruiting-data-dir";
import type { P184AuditEvent } from "@/lib/p184-autonomous-paperwork-send-engine/types";
import { P184_SOURCE_PHASE } from "@/lib/p184-autonomous-paperwork-send-engine/types";

const MAX_EVENTS = 2_000;

function auditPath(): string {
  return path.join(recruitingDataDir(), "p184-paperwork-send-audit.json");
}

type AuditFile = {
  updatedAt: string;
  events: P184AuditEvent[];
};

let memoryEvents: P184AuditEvent[] | null = null;

async function readAuditFile(): Promise<AuditFile> {
  if (memoryEvents) {
    return { updatedAt: new Date().toISOString(), events: memoryEvents };
  }
  try {
    const raw = await readFile(auditPath(), "utf8");
    const parsed = JSON.parse(raw) as AuditFile;
    return {
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
      events: Array.isArray(parsed.events) ? parsed.events : [],
    };
  } catch {
    return { updatedAt: new Date().toISOString(), events: [] };
  }
}

async function writeAuditFile(file: AuditFile): Promise<void> {
  memoryEvents = file.events;
  await safeRecruitingMkdir();
  await writeFile(auditPath(), `${JSON.stringify(file, null, 2)}\n`, "utf8");
}

export async function appendP184AuditEvent(
  partial: Omit<P184AuditEvent, "id" | "at" | "operator"> & {
    id?: string;
    at?: string;
  },
): Promise<P184AuditEvent> {
  const event: P184AuditEvent = {
    id: partial.id ?? randomUUID(),
    at: partial.at ?? new Date().toISOString(),
    candidateId: partial.candidateId,
    candidateName: partial.candidateName,
    jobId: partial.jobId,
    jobName: partial.jobName,
    operator: "Autonomous Engine",
    templateKey: partial.templateKey,
    envelopeId: partial.envelopeId,
    status: partial.status,
    latencyMs: partial.latencyMs,
    failureReason: partial.failureReason,
    retryCount: partial.retryCount,
    mode: partial.mode,
    idempotencyKey: partial.idempotencyKey,
    simulated: partial.simulated,
  };

  const file = await readAuditFile();
  const events = [...file.events, event].slice(-MAX_EVENTS);
  await writeAuditFile({ updatedAt: event.at, events });
  return event;
}

export async function listP184AuditEvents(limit = 200): Promise<P184AuditEvent[]> {
  const file = await readAuditFile();
  return file.events.slice(-limit);
}

export function resetP184AuditMemoryForTests(): void {
  memoryEvents = null;
}

export { P184_SOURCE_PHASE };
