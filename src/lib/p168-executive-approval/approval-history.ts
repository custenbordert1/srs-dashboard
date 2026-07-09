import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  P168ApprovalHistoryEntry,
  P168LastExecution,
} from "@/lib/p168-executive-approval/approval-types";
import { P168_SOURCE_PHASE } from "@/lib/p168-executive-approval/approval-types";
import {recruitingDataDir, safeRecruitingMkdir } from "@/lib/recruiting-data-dir";

const MAX_HISTORY = 200;

function historyPath(): string {
  return path.join(recruitingDataDir(), "p168-executive-approval-history.json");
}

type HistoryStoreFile = {
  entries: P168ApprovalHistoryEntry[];
  updatedAt: string;
};

export async function loadP168ApprovalHistory(): Promise<P168ApprovalHistoryEntry[]> {
  try {
    const raw = await readFile(historyPath(), "utf8");
    const parsed = JSON.parse(raw) as HistoryStoreFile;
    return parsed.entries ?? [];
  } catch {
    return [];
  }
}

export async function appendP168ApprovalHistoryEntry(
  entry: Omit<P168ApprovalHistoryEntry, "id" | "at"> & { id?: string; at?: string },
): Promise<P168ApprovalHistoryEntry[]> {
  const existing = await loadP168ApprovalHistory();
  const full: P168ApprovalHistoryEntry = {
    id: entry.id ?? `${P168_SOURCE_PHASE}-${randomUUID()}`,
    at: entry.at ?? new Date().toISOString(),
    executiveUserId: entry.executiveUserId,
    executiveEmail: entry.executiveEmail,
    recommendation: entry.recommendation,
    recommendationId: entry.recommendationId,
    approved: entry.approved,
    executed: entry.executed,
    result: entry.result,
    paperworkSent: entry.paperworkSent,
    durationMs: entry.durationMs,
    dropboxRequests: entry.dropboxRequests,
    errors: entry.errors,
    message: entry.message,
  };
  const entries = [full, ...existing].slice(0, MAX_HISTORY);
  const now = new Date().toISOString();
  await safeRecruitingMkdir();
  await writeFile(historyPath(), `${JSON.stringify({ entries, updatedAt: now }, null, 2)}\n`, "utf8");
  return entries;
}

export function resolveP168LastExecution(history: P168ApprovalHistoryEntry[]): P168LastExecution {
  const lastExecuted = history.find((e) => e.executed);
  if (!lastExecuted) {
    return {
      at: null,
      executiveEmail: null,
      paperworkSent: null,
      durationMs: null,
      dropboxRequests: null,
      errors: null,
      result: null,
    };
  }
  return {
    at: lastExecuted.at,
    executiveEmail: lastExecuted.executiveEmail,
    paperworkSent: lastExecuted.paperworkSent,
    durationMs: lastExecuted.durationMs,
    dropboxRequests: lastExecuted.dropboxRequests,
    errors: lastExecuted.errors,
    result: lastExecuted.result,
  };
}
