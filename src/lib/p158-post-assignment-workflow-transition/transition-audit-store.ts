import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { P1583_AUDIT_MAX_EVENTS } from "@/lib/p158-post-assignment-workflow-transition/transition-config";
import { P158_3_SOURCE_PHASE } from "@/lib/p158-post-assignment-workflow-transition/transition-config";
import { recruitingDataDir } from "@/lib/recruiting-data-dir";

export type P1583TransitionAuditEvent = {
  id: string;
  at: string;
  candidateId: string;
  candidateName: string;
  action: "simulated" | "transitioned" | "blocked" | "skipped" | "failed" | "rolled_back";
  executionMode: "simulation" | "production";
  beforeWorkflowStatus: string | null;
  afterWorkflowStatus: string | null;
  beforeActionType: string | null;
  afterActionType: string | null;
  reason: string;
  rollbackId: string | null;
  metadata?: Record<string, string | number | boolean | null>;
};

export type P1583TransitionRollbackRecord = {
  rollbackId: string;
  auditEventId: string;
  candidateId: string;
  beforeWorkflowStatus: string | null;
  beforeActionType: string | null;
  beforeRequiredAction: string | null;
  afterWorkflowStatus: string | null;
  afterActionType: string | null;
  createdAt: string;
  rolledBackAt: string | null;
};

type AuditFile = {
  events: P1583TransitionAuditEvent[];
  rollbacks: P1583TransitionRollbackRecord[];
  updatedAt: string;
};

function auditPath(): string {
  return path.join(recruitingDataDir(), "p158-workflow-transition-audit.json");
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

export async function loadP1583TransitionAuditLog(): Promise<P1583TransitionAuditEvent[]> {
  const store = await loadStore();
  return store.events;
}

export async function appendP1583TransitionAuditEvent(
  event: Omit<P1583TransitionAuditEvent, "id" | "at"> & { id?: string; at?: string },
): Promise<P1583TransitionAuditEvent> {
  const store = await loadStore();
  const full: P1583TransitionAuditEvent = {
    id: event.id ?? `${P158_3_SOURCE_PHASE}-${randomUUID()}`,
    at: event.at ?? new Date().toISOString(),
    candidateId: event.candidateId,
    candidateName: event.candidateName,
    action: event.action,
    executionMode: event.executionMode,
    beforeWorkflowStatus: event.beforeWorkflowStatus,
    afterWorkflowStatus: event.afterWorkflowStatus,
    beforeActionType: event.beforeActionType,
    afterActionType: event.afterActionType,
    reason: event.reason,
    rollbackId: event.rollbackId,
    metadata: event.metadata,
  };
  store.events = [full, ...store.events].slice(0, P1583_AUDIT_MAX_EVENTS);
  store.updatedAt = new Date().toISOString();
  await saveStore(store);
  return full;
}

export async function registerP1583TransitionRollback(
  record: Omit<P1583TransitionRollbackRecord, "rolledBackAt">,
): Promise<void> {
  const store = await loadStore();
  store.rollbacks = [
    { ...record, rolledBackAt: null },
    ...store.rollbacks.filter((r) => r.rollbackId !== record.rollbackId),
  ].slice(0, P1583_AUDIT_MAX_EVENTS);
  store.updatedAt = new Date().toISOString();
  await saveStore(store);
}

export async function markP1583TransitionRollbackComplete(rollbackId: string): Promise<void> {
  const store = await loadStore();
  store.rollbacks = store.rollbacks.map((r) =>
    r.rollbackId === rollbackId ? { ...r, rolledBackAt: new Date().toISOString() } : r,
  );
  store.updatedAt = new Date().toISOString();
  await saveStore(store);
}

export async function loadP1583TransitionRollbackRecords(): Promise<P1583TransitionRollbackRecord[]> {
  const store = await loadStore();
  return store.rollbacks;
}
