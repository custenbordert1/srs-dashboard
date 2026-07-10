import type { RunnerProductionConfig } from "@/lib/autonomous-paperwork-runner/runner-config";
import type { AutonomousPaperworkRunnerState } from "@/lib/autonomous-paperwork-runner/types";
import type { PaperworkRunnerOperationalMode } from "@/lib/p118-autonomous-paperwork-operations-center/types";

export function resolveRunnerOperationalMode(input: {
  config: RunnerProductionConfig;
  state: AutonomousPaperworkRunnerState;
}): PaperworkRunnerOperationalMode {
  if (input.config.liveEngineMode != null) {
    return "live";
  }
  if (!input.config.scheduleEnabled && input.state.runnerStatus === "stopped") {
    return "disabled";
  }
  return "dryRun";
}
