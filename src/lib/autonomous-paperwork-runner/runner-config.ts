import type { AutonomousPaperworkRunnerMode } from "@/lib/autonomous-paperwork-runner/types";
import type { AutonomousPaperworkRunMode } from "@/lib/p106-autonomous-paperwork-engine/types";

export type RunnerProductionConfig = {
  scheduleEnabled: boolean;
  defaultMode: AutonomousPaperworkRunnerMode;
  liveEngineMode: AutonomousPaperworkRunMode | null;
  fullReconciliationDaily: boolean;
};

export function resolveRunnerProductionConfig(): RunnerProductionConfig {
  const scheduleEnabled = process.env.AUTONOMOUS_PAPERWORK_RUNNER_SCHEDULE_ENABLED === "true";
  const liveFlag = process.env.AUTONOMOUS_PAPERWORK_RUNNER_LIVE_MODE?.trim();
  const fullReconciliationDaily =
    process.env.AUTONOMOUS_PAPERWORK_RUNNER_DAILY_RECONCILIATION === "true";

  let liveEngineMode: AutonomousPaperworkRunMode | null = null;
  if (liveFlag === "executeSafeSingles" || liveFlag === "runOnce") {
    liveEngineMode = liveFlag === "executeSafeSingles" ? "executeSafeSingles" : "executeOne";
  }

  let defaultMode: AutonomousPaperworkRunnerMode = "dryRun";
  if (scheduleEnabled && liveEngineMode) {
    defaultMode = "scheduled";
  } else if (liveEngineMode === "executeOne") {
    defaultMode = "runOnce";
  }

  return {
    scheduleEnabled,
    defaultMode,
    liveEngineMode,
    fullReconciliationDaily,
  };
}

export function mapRunnerModeToEngineMode(input: {
  mode: AutonomousPaperworkRunnerMode;
  liveEngineMode: AutonomousPaperworkRunMode | null;
}): AutonomousPaperworkRunMode {
  if (input.mode === "dryRun" || input.mode === "fullReconciliation") return "dryRun";
  if (input.liveEngineMode === "executeSafeSingles") return "executeSafeSingles";
  return "executeOne";
}

export const P106_1_FULL_RECONCILIATION_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function shouldRunScheduledFullReconciliation(input: {
  lastFullReconciliationAt: string | null;
  fullReconciliationDaily: boolean;
  nowMs?: number;
}): boolean {
  if (!input.fullReconciliationDaily) return false;
  const now = input.nowMs ?? Date.now();
  const last = Date.parse(input.lastFullReconciliationAt ?? "");
  if (!Number.isFinite(last)) return true;
  return now - last >= P106_1_FULL_RECONCILIATION_INTERVAL_MS;
}
