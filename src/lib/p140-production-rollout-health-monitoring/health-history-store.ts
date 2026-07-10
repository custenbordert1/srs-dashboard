import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {recruitingDataDir, safeRecruitingMkdir } from "@/lib/recruiting-data-dir";
import type { HealthMetricsSnapshot } from "@/lib/p140-production-rollout-health-monitoring/types";

const MAX_SNAPSHOTS = 48;

export type HealthHistoryStore = {
  version: 1;
  snapshots: HealthMetricsSnapshot[];
  updatedAt: string;
};

function historyPath(): string {
  return path.join(recruitingDataDir(), "p140-production-health-history.json");
}

export async function loadHealthHistory(): Promise<HealthHistoryStore> {
  try {
    const raw = await readFile(historyPath(), "utf8");
    return JSON.parse(raw) as HealthHistoryStore;
  } catch {
    return { version: 1, snapshots: [], updatedAt: new Date().toISOString() };
  }
}

export async function appendHealthSnapshot(snapshot: HealthMetricsSnapshot): Promise<HealthHistoryStore> {
  const store = await loadHealthHistory();
  store.snapshots.push(snapshot);
  if (store.snapshots.length > MAX_SNAPSHOTS) {
    store.snapshots = store.snapshots.slice(-MAX_SNAPSHOTS);
  }
  store.updatedAt = new Date().toISOString();
  await safeRecruitingMkdir();
  await writeFile(historyPath(), `${JSON.stringify(store, null, 2)}\n`, "utf8");
  return store;
}

export function computeTrend(
  current: number,
  previous: number | null,
): "stable" | "growing" | "shrinking" | "unknown" {
  if (previous == null) return "unknown";
  if (current > previous) return "growing";
  if (current < previous) return "shrinking";
  return "stable";
}
