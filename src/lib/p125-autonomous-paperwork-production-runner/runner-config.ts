import {
  P125_DEFAULT_INTERVAL_MS,
  type ProductionRunnerMode,
} from "@/lib/p125-autonomous-paperwork-production-runner/types";

export type ProductionRunnerConfig = {
  defaultMode: ProductionRunnerMode;
  continuousEnabled: boolean;
  liveExecutionEnabled: boolean;
  scheduleIntervalMs: number;
  maxConcurrentSends: number;
  confirmationPhrase: string;
};

export function resolveProductionRunnerConfig(): ProductionRunnerConfig {
  const interval = Number(process.env.P125_RUNNER_INTERVAL_MS) || P125_DEFAULT_INTERVAL_MS;
  return {
    defaultMode: "manual",
    continuousEnabled: process.env.P125_RUNNER_CONTINUOUS_ENABLED === "true",
    liveExecutionEnabled:
      process.env.AUTONOMOUS_PAPERWORK_LIVE_PILOT_ENABLED === "true" &&
      process.env.AUTONOMOUS_PAPERWORK_LIVE_MODE === "true" &&
      process.env.AUTONOMOUS_PAPERWORK_OPERATOR_GO === "true",
    scheduleIntervalMs: interval,
    maxConcurrentSends: 1,
    confirmationPhrase: process.env.P125_RUNNER_CONFIRMATION_PHRASE?.trim() || "SEND 1 PAPERWORK PACKET",
  };
}

export function shouldExecuteLive(input: {
  mode: ProductionRunnerMode;
  config: ProductionRunnerConfig;
  explicitExecute?: boolean;
}): boolean {
  if (input.explicitExecute === false) return false;
  if (input.mode === "manual" && input.explicitExecute !== true) return false;
  return input.config.liveExecutionEnabled && input.mode !== "paused" && input.mode !== "stopped";
}
