"use client";

import type { DmEscalationLogEntry } from "@/lib/dm-dashboard/dm-operational-types";

const STORAGE_KEY = "srs-dm-escalation-log-v1";
const MAX_ENTRIES = 200;

function readAll(): DmEscalationLogEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((row): row is DmEscalationLogEntry => {
      return (
        row &&
        typeof row === "object" &&
        typeof (row as DmEscalationLogEntry).id === "string" &&
        typeof (row as DmEscalationLogEntry).actionType === "string"
      );
    });
  } catch {
    return [];
  }
}

function writeAll(entries: DmEscalationLogEntry[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
}

export function listDmEscalationLogs(options?: {
  dmUserId?: string;
  limit?: number;
}): DmEscalationLogEntry[] {
  const limit = options?.limit ?? 50;
  let rows = readAll();
  if (options?.dmUserId) {
    rows = rows.filter((row) => row.dmUserId === options.dmUserId);
  }
  return rows
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export function appendDmEscalationLog(entry: DmEscalationLogEntry): DmEscalationLogEntry[] {
  const next = [entry, ...readAll()].slice(0, MAX_ENTRIES);
  writeAll(next);
  return next;
}

export function clearDmEscalationLogsForDev(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}
