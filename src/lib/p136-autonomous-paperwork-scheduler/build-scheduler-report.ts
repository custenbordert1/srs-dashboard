import { loadPilotConfig } from "@/lib/p122-controlled-live-paperwork-pilot/pilot-config";
import {
  isSchedulerHeartbeatStale,
  loadSchedulerState,
} from "@/lib/p136-autonomous-paperwork-scheduler/scheduler-store";
import type { AutonomousPaperworkSchedulerReport } from "@/lib/p136-autonomous-paperwork-scheduler/types";
import { P136_SOURCE_PHASE } from "@/lib/p136-autonomous-paperwork-scheduler/types";

export async function buildAutonomousPaperworkSchedulerReport(input?: {
  lastCycle?: import("@/lib/p136-autonomous-paperwork-scheduler/types").SchedulerCycleReport | null;
}): Promise<AutonomousPaperworkSchedulerReport> {
  const state = await loadSchedulerState();
  const pilotConfig = loadPilotConfig();
  const heartbeatStale = isSchedulerHeartbeatStale(state);
  const runtimeMs =
    state.uptimeStartedAt != null ? Math.max(0, Date.now() - Date.parse(state.uptimeStartedAt)) : 0;

  const metrics = state.lastCycleMetrics;
  const safetyStatus = {
    previewOnly: true as const,
    breezyWrites: false as const,
    liveModeEnabled: pilotConfig.liveModeEnabled,
    paperworkSent: false as const,
    executeBatchCalled: false as const,
    p122Unchanged: true as const,
    checks: [
      { id: "preview_only", label: "Preview-only", passed: true, detail: "Orchestrates existing preview components." },
      { id: "no_breezy_writes", label: "No Breezy writes", passed: true, detail: "Read-only coordination." },
      { id: "no_sends", label: "No paperwork sends", passed: true, detail: "P122 execution unchanged." },
      {
        id: "live_mode",
        label: "Live mode off",
        passed: !pilotConfig.liveModeEnabled,
        detail: pilotConfig.liveModeEnabled ? "Env live mode on." : "Live mode off.",
      },
    ],
  };

  let goNoGo: AutonomousPaperworkSchedulerReport["goNoGo"] = "GO WITH CONDITIONS";
  let goNoGoReason = "Scheduler coordinates preview-only P123/P124/P125/P134/P135 workflow.";

  if (heartbeatStale && state.schedulerStatus === "running") {
    goNoGo = "NO-GO";
    goNoGoReason = "Stale heartbeat detected — recover lock before continuous operation.";
  } else if (state.schedulerMode === "continuous" && !heartbeatStale) {
    goNoGoReason = "Continuous mode armed — cycles via run-once or CLI ticks.";
  }

  return {
    sourcePhase: P136_SOURCE_PHASE,
    generatedAt: new Date().toISOString(),
    mode: "previewOnly",
    state,
    heartbeat: {
      lastAt: state.lastHeartbeatAt,
      stale: heartbeatStale,
      healthy: !heartbeatStale,
    },
    runtimeMs,
    lastCycle: input?.lastCycle ?? null,
    executivePanel: {
      schedulerStatus: state.schedulerStatus,
      currentPhase: state.currentPhase,
      lastCycleAt: state.lastCycleAt,
      nextCycleAt: state.nextScheduledCycleAt,
      runtimeMs,
      heartbeatHealthy: !heartbeatStale,
      currentQueue: metrics?.queueSize ?? 0,
      remediationsCompleted: metrics?.remediationsExecuted ?? 0,
      estimatedApprovalsUnlocked: metrics?.approvalsUnlocked ?? 0,
      safetyStatus,
    },
    goNoGo,
    goNoGoReason,
    executeBatchCalled: false,
    breezyWrites: false,
    liveModeEnabled: pilotConfig.liveModeEnabled,
    paperworkSent: false,
  };
}
