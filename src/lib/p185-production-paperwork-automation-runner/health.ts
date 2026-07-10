import { readDropboxSignConfig } from "@/lib/dropbox-sign";
import { loadP184EngineState } from "@/lib/p184-autonomous-paperwork-send-engine/store";
import {
  getP185StorageHealth,
  loadP185RunnerState,
} from "@/lib/p185-production-paperwork-automation-runner/durableStorage";
import { describeActiveLease } from "@/lib/p185-production-paperwork-automation-runner/lease";
import { evaluateP185LiveGates } from "@/lib/p185-production-paperwork-automation-runner/safety";
import type {
  P185HealthReport,
  P185SchedulerStatus,
} from "@/lib/p185-production-paperwork-automation-runner/types";
import { P185_SOURCE_PHASE } from "@/lib/p185-production-paperwork-automation-runner/types";

export function isP185SchedulerAuthConfigured(): boolean {
  return Boolean(process.env.CRON_SECRET?.trim() || process.env.P185_CRON_SECRET?.trim());
}

export function resolveP185SchedulerStatus(input: {
  productionAutomationEnabled: boolean;
  killSwitch: boolean;
  pauseUntil: string | null;
  authConfigured: boolean;
  nowMs?: number;
}): P185SchedulerStatus {
  const nowMs = input.nowMs ?? Date.now();
  if (!input.authConfigured) return "misconfigured";
  if (input.killSwitch) return "paused";
  if (input.pauseUntil && Date.parse(input.pauseUntil) > nowMs) return "paused";
  if (!input.productionAutomationEnabled && process.env.P185_PRODUCTION_AUTOMATION_ENABLED !== "1") {
    return "disabled";
  }
  return "active";
}

export async function buildP185HealthReport(input?: {
  nowMs?: number;
  breezyHealthy?: boolean;
  breezyDetail?: string;
}): Promise<P185HealthReport> {
  const nowMs = input?.nowMs ?? Date.now();
  const state = await loadP185RunnerState();
  const p184 = await loadP184EngineState();
  const storage = getP185StorageHealth();
  const lease = describeActiveLease(state, nowMs);
  const authConfigured = isP185SchedulerAuthConfigured();
  const dropboxConfigured = Boolean(readDropboxSignConfig());
  const automationEnabled =
    state.safety.productionAutomationEnabled ||
    process.env.P185_PRODUCTION_AUTOMATION_ENABLED === "1";

  const schedulerStatus = resolveP185SchedulerStatus({
    productionAutomationEnabled: automationEnabled,
    killSwitch: state.safety.killSwitch,
    pauseUntil: state.safety.pauseUntil,
    authConfigured,
    nowMs,
  });

  const liveGates = evaluateP185LiveGates({
    state,
    p184Config: p184.config,
    storage,
    dropboxConfigured,
    authConfigured,
    nowMs,
  });

  const automationMode: P185HealthReport["automationMode"] = !p184.config.enabled
    ? "disabled"
    : p184.config.mode === "live" && liveGates.ready
      ? "live"
      : "dry_run";

  return {
    phase: P185_SOURCE_PHASE,
    generatedAt: new Date(nowMs).toISOString(),
    runnerStatus: state.runnerStatus,
    schedulerStatus,
    automationMode,
    lastAttemptedCycle: state.lastAttemptedCycle,
    lastSuccessfulCycle: state.lastSuccessfulCycle,
    lastLiveSendAt: state.lastLiveSendAt,
    nextScheduledRunAt: state.nextScheduledRunAt,
    lease,
    storage: {
      adapter: storage.adapter,
      durable: storage.durable,
      healthy: storage.healthy,
      detail: storage.detail,
    },
    breezySource: {
      healthy: input?.breezyHealthy ?? true,
      detail: input?.breezyDetail ?? "Not probed this request.",
    },
    dropboxSign: {
      healthy: dropboxConfigured,
      detail: dropboxConfigured
        ? "Dropbox Sign API credentials configured."
        : "Dropbox Sign credentials missing.",
    },
    schedulerAuth: {
      configured: authConfigured,
      detail: authConfigured
        ? "CRON_SECRET or P185_CRON_SECRET configured."
        : "Scheduler secret missing — cron endpoint will reject requests.",
    },
    circuitBreaker: state.circuit,
    killSwitch: state.safety.killSwitch,
    pauseUntil: state.safety.pauseUntil,
    metrics: state.metrics,
    alerts: state.alerts.filter((a) => a.active),
    liveEnablementReady: liveGates.ready,
    liveEnablementBlockers: liveGates.blockers,
  };
}
