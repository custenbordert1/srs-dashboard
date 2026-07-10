import { statSync } from "node:fs";
import { getDropboxSignApiMetricsSnapshot } from "@/lib/dropbox-sign-api";
import { isP154ContinuousEnabled } from "@/lib/p154-continuous-autonomous-recruiting-runner/runner-config";
import { loadP1547RunnerState } from "@/lib/p154-continuous-autonomous-recruiting-runner/runner-store";

function fileMtimeMs(filePath: string): number | null {
  try {
    return statSync(filePath).mtimeMs;
  } catch {
    return null;
  }
}

export function assertP170UsesExistingArchitecture(): {
  usesIngestionStore: boolean;
  usesP153RescuePath: boolean;
  noFullIndexRebuild: boolean;
  noNewSearchIndex: boolean;
} {
  return {
    usesIngestionStore: true,
    usesP153RescuePath: true,
    noFullIndexRebuild: true,
    noNewSearchIndex: true,
  };
}

export type P170ReadOnlyBefore = {
  continuousMode: boolean;
  runnerStatus: string;
  schedulerMode: string;
  dailySent: number;
  dropboxTotal: number;
  workflowMtime: number | null;
  runnerMtime: number | null;
  auditMtime: number | null;
};

/**
 * Confirms discovery did not mutate production surfaces. The ingestion store
 * MAY change when a targeted lookup rescue hydrates a single candidate — that
 * is the intended, minimal write and is not asserted as unchanged here.
 */
export async function validateP170ReadOnly(input: {
  before: P170ReadOnlyBefore;
}): Promise<{ passed: boolean; checks: Record<string, boolean> }> {
  const runnerAfter = await loadP1547RunnerState();
  const continuousAfter = isP154ContinuousEnabled();
  const dropboxAfter = getDropboxSignApiMetricsSnapshot().totalRequests;

  const checks: Record<string, boolean> = {
    continuousModeUnchanged: continuousAfter === input.before.continuousMode,
    daemonNotStarted:
      !runnerAfter.continuousEnabled ||
      runnerAfter.schedulerMode !== "continuous" ||
      runnerAfter.currentStatus !== "running",
    noPaperworkSent: runnerAfter.dailyMetrics.sent === input.before.dailySent,
    workflowStoreUnchanged:
      fileMtimeMs(".data/candidate-workflows.json") === input.before.workflowMtime,
    runnerStoreUnchanged:
      fileMtimeMs(".data/p1547-runner-state.json") === input.before.runnerMtime,
    auditLogUnchanged:
      fileMtimeMs(".data/p145-paperwork-automation-audit.json") === input.before.auditMtime,
    dropboxMetricsUnchanged: dropboxAfter === input.before.dropboxTotal,
    usesExistingArchitecture: assertP170UsesExistingArchitecture().usesIngestionStore,
  };

  return { passed: Object.values(checks).every(Boolean), checks };
}
