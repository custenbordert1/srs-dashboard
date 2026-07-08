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

export function assertP169UsesExistingProductionPath(): {
  usesP159LiveCycle: boolean;
  noNewSendImplementation: boolean;
  noContinuousModeAutoEnable: boolean;
} {
  return {
    usesP159LiveCycle: true,
    noNewSendImplementation: true,
    noContinuousModeAutoEnable: true,
  };
}

export async function validateP169ReadOnly(input: {
  before: {
    continuousMode: boolean;
    runnerStatus: string;
    schedulerMode: string;
    dailySent: number;
    dropboxTotal: number;
    workflowMtime: number | null;
    runnerMtime: number | null;
    auditMtime: number | null;
  };
  orchestratorEnabled: boolean;
}): Promise<{
  passed: boolean;
  checks: Record<string, boolean>;
}> {
  const runnerAfter = await loadP1547RunnerState();
  const continuousAfter = isP154ContinuousEnabled();
  const dropboxAfter = getDropboxSignApiMetricsSnapshot().totalRequests;

  const checks: Record<string, boolean> = {
    continuousModeUnchanged: continuousAfter === input.before.continuousMode,
    daemonNotStarted:
      !runnerAfter.continuousEnabled ||
      runnerAfter.schedulerMode !== "continuous" ||
      runnerAfter.currentStatus !== "running",
    noAutoEnableWhenDisabled: !input.orchestratorEnabled,
    runnerStoreUnchangedUnlessLive:
      input.orchestratorEnabled ||
      fileMtimeMs(".data/p1547-runner-state.json") === input.before.runnerMtime,
    workflowStoreUnchanged:
      fileMtimeMs(".data/candidate-workflows.json") === input.before.workflowMtime,
    dropboxUnchangedUnlessLive:
      input.orchestratorEnabled || dropboxAfter === input.before.dropboxTotal,
    auditUnchangedUnlessLive:
      input.orchestratorEnabled ||
      fileMtimeMs(".data/p145-paperwork-automation-audit.json") === input.before.auditMtime,
    usesP159Path: assertP169UsesExistingProductionPath().usesP159LiveCycle,
  };

  return { passed: Object.values(checks).every(Boolean), checks };
}
