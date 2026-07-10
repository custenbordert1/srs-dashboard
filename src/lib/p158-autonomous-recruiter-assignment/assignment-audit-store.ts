import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { P158_AUDIT_MAX_EVENTS } from "@/lib/p158-autonomous-recruiter-assignment/assignment-config";
import type { P158AssignmentAuditEvent } from "@/lib/p158-autonomous-recruiter-assignment/types";
import { P158_SOURCE_PHASE } from "@/lib/p158-autonomous-recruiter-assignment/types";
import { recruitingDataDir } from "@/lib/recruiting-data-dir";

type AuditFile = {
  events: P158AssignmentAuditEvent[];
  rollbacks: P158RollbackRecord[];
  updatedAt: string;
};

export type P158RollbackRecord = {
  rollbackId: string;
  auditEventId: string;
  candidateId: string;
  beforeRecruiter: string | null;
  beforeDm: string | null;
  afterRecruiter: string | null;
  createdAt: string;
  rolledBackAt: string | null;
};

function auditPath(): string {
  return path.join(recruitingDataDir(), "p158-recruiter-assignment-audit.json");
}

async function loadStore(): Promise<AuditFile> {
  try {
    const raw = await readFile(auditPath(), "utf8");
    const parsed = JSON.parse(raw) as AuditFile;
    return {
      events: parsed.events ?? [],
      rollbacks: parsed.rollbacks ?? [],
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
    };
  } catch {
    return { events: [], rollbacks: [], updatedAt: new Date().toISOString() };
  }
}

async function saveStore(store: AuditFile): Promise<void> {
  await mkdir(path.dirname(auditPath()), { recursive: true });
  await writeFile(auditPath(), `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

export async function loadP158AssignmentAuditLog(): Promise<P158AssignmentAuditEvent[]> {
  const store = await loadStore();
  return store.events;
}

export async function appendP158AssignmentAuditEvent(
  event: Omit<P158AssignmentAuditEvent, "id" | "at"> & { id?: string; at?: string },
): Promise<P158AssignmentAuditEvent> {
  const store = await loadStore();
  const full: P158AssignmentAuditEvent = {
    id: event.id ?? `${P158_SOURCE_PHASE}-${randomUUID()}`,
    at: event.at ?? new Date().toISOString(),
    candidateId: event.candidateId,
    candidateName: event.candidateName,
    action: event.action,
    recruiter: event.recruiter,
    confidence: event.confidence,
    reason: event.reason,
    executionMode: event.executionMode,
    beforeRecruiter: event.beforeRecruiter,
    afterRecruiter: event.afterRecruiter,
    rollbackId: event.rollbackId,
    metadata: event.metadata,
  };
  store.events = [full, ...store.events].slice(0, P158_AUDIT_MAX_EVENTS);
  store.updatedAt = new Date().toISOString();
  await saveStore(store);
  return full;
}

export async function registerP158Rollback(record: Omit<P158RollbackRecord, "rolledBackAt">): Promise<void> {
  const store = await loadStore();
  store.rollbacks = [
    { ...record, rolledBackAt: null },
    ...store.rollbacks.filter((r) => r.rollbackId !== record.rollbackId),
  ].slice(0, P158_AUDIT_MAX_EVENTS);
  store.updatedAt = new Date().toISOString();
  await saveStore(store);
}

export async function markP158RollbackComplete(rollbackId: string): Promise<void> {
  const store = await loadStore();
  store.rollbacks = store.rollbacks.map((r) =>
    r.rollbackId === rollbackId ? { ...r, rolledBackAt: new Date().toISOString() } : r,
  );
  store.updatedAt = new Date().toISOString();
  await saveStore(store);
}

export async function loadP158RollbackRecords(): Promise<P158RollbackRecord[]> {
  const store = await loadStore();
  return store.rollbacks;
}

export function countP158AssignmentsToday(events: P158AssignmentAuditEvent[]): number {
  const today = new Date().toISOString().slice(0, 10);
  return events.filter((e) => e.at.startsWith(today) && e.action === "assigned").length;
}

export function hasP158RecentAssignment(events: P158AssignmentAuditEvent[], candidateId: string): boolean {
  return events.some(
    (e) => e.candidateId === candidateId && e.action === "assigned" && !e.metadata?.rolledBack,
  );
}
