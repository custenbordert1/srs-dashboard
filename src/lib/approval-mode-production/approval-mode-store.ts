import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { recruitingDataDir } from "@/lib/recruiting-data-dir";
import type {
  P97ApprovalModeStateFile,
  P97AuditEntry,
  P97RollbackEntry,
  P97RollbackFile,
} from "@/lib/approval-mode-production/types";

function dataDir(): string {
  return recruitingDataDir();
}

export function p97StatePath(): string {
  return path.join(dataDir(), "p97-approval-mode-production.json");
}

export function p97RollbackPath(): string {
  return path.join(dataDir(), "p97-approval-mode-rollback.json");
}

export function p97AuditLogPath(): string {
  return path.join(dataDir(), "p97-approval-mode-audit.jsonl");
}

async function ensureDataDir(): Promise<void> {
  await mkdir(dataDir(), { recursive: true });
}

export async function loadP97State(): Promise<P97ApprovalModeStateFile> {
  try {
    const raw = await readFile(p97StatePath(), "utf8");
    return JSON.parse(raw) as P97ApprovalModeStateFile;
  } catch {
    return { version: 1, updatedAt: new Date().toISOString(), persisted: [] };
  }
}

export async function saveP97State(state: P97ApprovalModeStateFile): Promise<void> {
  await ensureDataDir();
  await writeFile(p97StatePath(), `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export async function loadP97RollbackFile(): Promise<P97RollbackFile> {
  try {
    const raw = await readFile(p97RollbackPath(), "utf8");
    return JSON.parse(raw) as P97RollbackFile;
  } catch {
    return { version: 1, updatedAt: new Date().toISOString(), entries: [] };
  }
}

export async function saveP97RollbackFile(file: P97RollbackFile): Promise<void> {
  await ensureDataDir();
  await writeFile(p97RollbackPath(), `${JSON.stringify(file, null, 2)}\n`, "utf8");
}

export async function appendP97Audit(entry: P97AuditEntry): Promise<void> {
  await ensureDataDir();
  await appendFile(p97AuditLogPath(), `${JSON.stringify(entry)}\n`, "utf8");
}

export async function appendP97Rollback(entry: P97RollbackEntry): Promise<P97RollbackFile> {
  const file = await loadP97RollbackFile();
  file.entries.push(entry);
  file.updatedAt = new Date().toISOString();
  await saveP97RollbackFile(file);
  return file;
}

export function newRollbackId(): string {
  return randomUUID();
}

export function newAuditId(): string {
  return randomUUID();
}
