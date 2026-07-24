import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { recruitingDataDir, safeRecruitingMkdir } from "@/lib/recruiting-data-dir";
import type { P207Alert } from "@/lib/p207-autonomous-readiness-dashboard/types";
import type { P207QuotaHistory } from "@/lib/p207-autonomous-readiness-dashboard/dropboxRecovery";

type AlertStoreFile = {
  version: 1;
  updatedAt: string;
  alerts: P207Alert[];
  quotaHistory: P207QuotaHistory;
};

function storePath(): string {
  return path.join(recruitingDataDir(), "p207-1-alert-state.json");
}

async function readStore(): Promise<AlertStoreFile> {
  try {
    const raw = await readFile(storePath(), "utf8");
    const parsed = JSON.parse(raw) as AlertStoreFile;
    return {
      version: 1,
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
      alerts: Array.isArray(parsed.alerts) ? parsed.alerts : [],
      quotaHistory: parsed.quotaHistory ?? {
        previousQuota: null,
        lastObservedQuota: null,
        pilotInProgress: false,
        productionSendHealthy: false,
      },
    };
  } catch {
    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      alerts: [],
      quotaHistory: {
        previousQuota: null,
        lastObservedQuota: null,
        pilotInProgress: false,
        productionSendHealthy: false,
      },
    };
  }
}

async function writeStore(file: AlertStoreFile): Promise<void> {
  await safeRecruitingMkdir(recruitingDataDir());
  await writeFile(storePath(), `${JSON.stringify(file, null, 2)}\n`, "utf8");
}

export async function loadP207AlertState(): Promise<{
  alerts: P207Alert[];
  quotaHistory: P207QuotaHistory;
}> {
  const file = await readStore();
  return { alerts: file.alerts, quotaHistory: file.quotaHistory };
}

export async function persistP207AlertState(input: {
  alerts: P207Alert[];
  quotaHistory: P207QuotaHistory;
}): Promise<void> {
  await writeStore({
    version: 1,
    updatedAt: new Date().toISOString(),
    alerts: input.alerts,
    quotaHistory: input.quotaHistory,
  });
}

/** Advance quota history after a successful Dropbox probe (read-only side effect on local alert state). */
export function advanceQuotaHistory(
  history: P207QuotaHistory,
  currentQuota: number | null,
): P207QuotaHistory {
  if (currentQuota == null) return history;
  return {
    ...history,
    previousQuota:
      history.lastObservedQuota != null ? history.lastObservedQuota : history.previousQuota,
    lastObservedQuota: currentQuota,
  };
}
