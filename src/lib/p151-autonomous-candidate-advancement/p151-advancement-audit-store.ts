import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { PipelineAdvancementAuditEvent } from "@/lib/p151-autonomous-candidate-advancement/types";
import { P151_SOURCE_PHASE } from "@/lib/p151-autonomous-candidate-advancement/types";
import { recruitingDataDir } from "@/lib/recruiting-data-dir";

const MAX_AUDIT_EVENTS = 500;

function auditPath(): string {
  return path.join(recruitingDataDir(), "p151-candidate-advancement-audit.json");
}

type AuditStoreFile = {
  events: PipelineAdvancementAuditEvent[];
  updatedAt: string;
};

export async function loadPipelineAdvancementAuditLog(): Promise<PipelineAdvancementAuditEvent[]> {
  try {
    const raw = await readFile(auditPath(), "utf8");
    const parsed = JSON.parse(raw) as AuditStoreFile;
    return parsed.events ?? [];
  } catch {
    return [];
  }
}

export async function appendPipelineAdvancementAuditEvent(
  event: Omit<PipelineAdvancementAuditEvent, "id" | "at"> & { id?: string; at?: string },
): Promise<PipelineAdvancementAuditEvent[]> {
  const existing = await loadPipelineAdvancementAuditLog();
  const full: PipelineAdvancementAuditEvent = {
    id: event.id ?? `${P151_SOURCE_PHASE}-${randomUUID()}`,
    at: event.at ?? new Date().toISOString(),
    type: event.type,
    candidateId: event.candidateId,
    candidateName: event.candidateName,
    executed: event.executed,
    simulated: event.simulated,
    reason: event.reason,
    metadata: event.metadata,
  };
  const events = [full, ...existing].slice(0, MAX_AUDIT_EVENTS);
  const now = new Date().toISOString();
  await mkdir(path.dirname(auditPath()), { recursive: true });
  await writeFile(auditPath(), `${JSON.stringify({ events, updatedAt: now }, null, 2)}\n`, "utf8");
  return events;
}

export function countAuditEventsToday(events: PipelineAdvancementAuditEvent[]): {
  assignments: number;
  advancements: number;
} {
  const today = new Date().toISOString().slice(0, 10);
  let assignments = 0;
  let advancements = 0;
  for (const event of events) {
    if (!event.at.startsWith(today) || !event.executed) continue;
    if (event.type === "recruiter_assigned") assignments += 1;
    if (event.type === "candidate_advanced") advancements += 1;
  }
  return { assignments, advancements };
}
