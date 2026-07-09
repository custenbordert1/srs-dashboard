/**
 * P161.1 — Executive snapshot store (disk persistence + shared types).
 *
 * The snapshot is a pre-computed aggregate of the expensive executive builds
 * (P159 operations control center + P160 production readiness + P161 app health).
 * It is persisted to the recruiting data dir so that a warm snapshot survives
 * across cold starts and can be served in <500ms while a background refresh runs.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { recruitingDataDir } from "@/lib/recruiting-data-dir";
import { incrementFilesystemReads } from "@/lib/app-performance/performance-metrics";
import type { P161AppHealthReport } from "@/lib/app-loading-reliability/build-app-health";
import type { P159OperationsControlCenter } from "@/lib/p159-operations-control-center/types";
import type { P160ProductionReadinessReport } from "@/lib/p160-production-readiness/types";

export const EXECUTIVE_SNAPSHOT_VERSION = "p161.1-v1";

export type ExecutiveSnapshotOrigin = "full" | "building" | "degraded";

export type ExecutiveQueueSummary = {
  candidatesEvaluated: number;
  eligibleNow: number;
  queueRemaining: number;
  waitingOnSignature: number;
  manualReview: number;
  blocked: number;
};

export type ExecutiveOperationsSummary = {
  systemMode: string;
  recommendation: string;
  recommendationDetail: string;
  daemonRunning: boolean;
  continuousEnabled: boolean;
};

export type ExecutiveTodaysPaperwork = {
  paperworkSent: number;
  signedToday: number;
  pendingSignatures: number;
  duplicatesPrevented: number;
  failures: number;
};

export type ExecutiveTodaysBatches = {
  sendBatchCount: number;
  sendBatches: P159OperationsControlCenter["today"]["sendBatches"];
  recentBatchHistory: P159OperationsControlCenter["batchHistory"];
};

export type ExecutiveDaemonStatus = {
  daemonRunning: boolean;
  continuousEnabled: boolean;
  schedulerMode: string;
  systemMode: string;
  serverStartTime: string | null;
};

export type ExecutiveSnapshot = {
  version: string;
  origin: ExecutiveSnapshotOrigin;
  generatedAt: string;
  buildDurationMs: number;
  appHealth: P161AppHealthReport;
  productionReadiness: P160ProductionReadinessReport;
  operations: P159OperationsControlCenter;
  queueSummary: ExecutiveQueueSummary;
  operationsSummary: ExecutiveOperationsSummary;
  todaysPaperwork: ExecutiveTodaysPaperwork;
  todaysBatches: ExecutiveTodaysBatches;
  readinessScore: number | null;
  failures: number;
  lastCycle: string | null;
  daemonStatus: ExecutiveDaemonStatus;
  warnings: string[];
};

function snapshotPath(): string {
  return path.join(recruitingDataDir(), "app-performance", "executive-snapshot.json");
}

export async function readSnapshotFromDisk(): Promise<ExecutiveSnapshot | null> {
  try {
    const raw = await readFile(snapshotPath(), "utf8");
    incrementFilesystemReads();
    const parsed = JSON.parse(raw) as ExecutiveSnapshot;
    if (parsed.version !== EXECUTIVE_SNAPSHOT_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function writeSnapshotToDisk(snapshot: ExecutiveSnapshot): Promise<void> {
  const target = snapshotPath();
  const { safeRecruitingMkdir } = await import("@/lib/recruiting-data-dir");
  await safeRecruitingMkdir(path.dirname(target));
  await writeFile(target, JSON.stringify(snapshot, null, 2), "utf8");
}
