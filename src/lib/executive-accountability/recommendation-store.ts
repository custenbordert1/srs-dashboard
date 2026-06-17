import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import {
  appendAuditEntry,
  normalizeExecutiveTrackedAction,
} from "@/lib/executive-accountability/action-audit";
import type {
  ExecutiveActionAuditEntry,
  ExecutiveActionStatus,
  ExecutiveTrackedAction,
  ForecastHistoryEntry,
  OperationalEvidence,
  OperationalEvidenceKind,
} from "@/lib/executive-accountability/types";
import { createOperationalEvidence } from "@/lib/executive-accountability/action-audit";

const STORE_DIR = path.join(process.cwd(), ".data");
const STORE_PATH = path.join(STORE_DIR, "executive-accountability.json");

export type ExecutiveAccountabilityStoreFile = {
  actions: ExecutiveTrackedAction[];
  forecastHistory: ForecastHistoryEntry[];
  auditLog: ExecutiveActionAuditEntry[];
  updatedAt: string;
};

function emptyStore(now: string): ExecutiveAccountabilityStoreFile {
  return { actions: [], forecastHistory: [], auditLog: [], updatedAt: now };
}

function normalizeStore(raw: Partial<ExecutiveAccountabilityStoreFile>): ExecutiveAccountabilityStoreFile {
  return {
    actions: Array.isArray(raw.actions)
      ? raw.actions.map((row) =>
          normalizeExecutiveTrackedAction(row as ExecutiveTrackedAction),
        )
      : [],
    forecastHistory: Array.isArray(raw.forecastHistory) ? raw.forecastHistory : [],
    auditLog: Array.isArray(raw.auditLog) ? raw.auditLog : [],
    updatedAt: raw.updatedAt ?? new Date().toISOString(),
  };
}

async function readStore(): Promise<ExecutiveAccountabilityStoreFile> {
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    return normalizeStore(JSON.parse(raw) as Partial<ExecutiveAccountabilityStoreFile>);
  } catch {
    return emptyStore(new Date().toISOString());
  }
}

async function writeStore(file: ExecutiveAccountabilityStoreFile): Promise<void> {
  await mkdir(STORE_DIR, { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(file, null, 2), "utf8");
}

export async function loadExecutiveAccountabilityStore(): Promise<ExecutiveAccountabilityStoreFile> {
  return readStore();
}

export async function saveExecutiveAccountabilityStore(
  file: ExecutiveAccountabilityStoreFile,
): Promise<void> {
  file.updatedAt = new Date().toISOString();
  await writeStore(file);
}

function serialize(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

export type ExecutiveActionUpdatePatch = Partial<
  Pick<
    ExecutiveTrackedAction,
    "status" | "outcomeNotes" | "notes" | "owner" | "dueDate"
  >
> & {
  appendNote?: string;
  ownerManuallyAssigned?: boolean;
  dueDateManuallySet?: boolean;
  operationalEvidenceKind?: OperationalEvidenceKind;
  operationalEvidenceDetail?: string | null;
};

export async function updateExecutiveAction(
  recommendationId: string,
  patch: ExecutiveActionUpdatePatch,
  actor: { displayName: string },
): Promise<{ action: ExecutiveTrackedAction | null; auditLog: ExecutiveActionAuditEntry[] }> {
  const file = await readStore();
  const index = file.actions.findIndex((row) => row.recommendationId === recommendationId);
  if (index < 0) return { action: null, auditLog: file.auditLog };

  const existing = file.actions[index]!;
  const now = new Date().toISOString();
  let auditLog = file.auditLog;

  const recordChange = (field: string, oldValue: unknown, newValue: unknown) => {
    const oldSerialized = serialize(oldValue);
    const newSerialized = serialize(newValue);
    if (oldSerialized === newSerialized) return;
    auditLog = appendAuditEntry(auditLog, {
      recommendationId,
      changedBy: actor.displayName,
      field,
      oldValue: oldSerialized,
      newValue: newSerialized,
      changedAt: now,
    });
  };

  const notes = [...existing.notes];
  if (patch.appendNote?.trim()) {
    notes.push(patch.appendNote.trim());
    recordChange("notes", existing.notes, notes);
  }
  if (patch.notes) {
    recordChange("notes", existing.notes, patch.notes);
    notes.splice(0, notes.length, ...patch.notes);
  }

  const status = patch.status ?? existing.status;
  if (patch.status !== undefined) {
    recordChange("status", existing.status, status);
  }

  const owner =
    patch.owner !== undefined ? patch.owner : existing.owner;
  if (patch.owner !== undefined) {
    recordChange("owner", existing.owner, owner);
  }

  const ownerManuallyAssigned =
    patch.ownerManuallyAssigned ??
    (patch.owner !== undefined ? true : existing.ownerManuallyAssigned);
  if (patch.ownerManuallyAssigned !== undefined || patch.owner !== undefined) {
    recordChange("ownerManuallyAssigned", existing.ownerManuallyAssigned, ownerManuallyAssigned);
  }

  const dueDate = patch.dueDate ?? existing.dueDate;
  if (patch.dueDate !== undefined) {
    recordChange("dueDate", existing.dueDate, dueDate);
  }

  const dueDateManuallySet =
    patch.dueDateManuallySet ??
    (patch.dueDate !== undefined ? true : existing.dueDateManuallySet);
  if (patch.dueDateManuallySet !== undefined || patch.dueDate !== undefined) {
    recordChange("dueDateManuallySet", existing.dueDateManuallySet, dueDateManuallySet);
  }

  const outcomeNotes =
    patch.outcomeNotes !== undefined ? patch.outcomeNotes : existing.outcomeNotes;
  if (patch.outcomeNotes !== undefined) {
    recordChange("outcomeNotes", existing.outcomeNotes, outcomeNotes);
  }

  let operationalEvidence: OperationalEvidence[] = [...existing.operationalEvidence];
  if (patch.operationalEvidenceKind) {
    const evidence = createOperationalEvidence({
      kind: patch.operationalEvidenceKind,
      recordedBy: actor.displayName,
      detail: patch.operationalEvidenceDetail,
      recordedAt: now,
    });
    operationalEvidence = [...operationalEvidence, evidence];
    recordChange("operationalEvidence", existing.operationalEvidence.length, operationalEvidence.length);
  }

  const completedAt =
    status === "completed" && existing.status !== "completed"
      ? now
      : status === "completed"
        ? existing.completedAt ?? now
        : status === "open" || status === "in_progress"
          ? null
          : existing.completedAt;

  const archivedAt =
    status === "archived" && existing.status !== "archived"
      ? now
      : existing.archivedAt;

  const updated: ExecutiveTrackedAction = {
    ...existing,
    status: status as ExecutiveActionStatus,
    outcomeNotes,
    actualOutcome: outcomeNotes,
    owner,
    ownerManuallyAssigned,
    dueDate,
    dueDateManuallySet,
    notes,
    operationalEvidence,
    completedAt,
    archivedAt,
    archivedReason:
      status === "archived" && !existing.archivedReason
        ? "manual_archive"
        : existing.archivedReason,
    updatedAt: now,
  };

  file.actions[index] = updated;
  file.auditLog = auditLog;
  await writeStore(file);
  return { action: updated, auditLog };
}

export function createActionId(): string {
  return randomUUID();
}
