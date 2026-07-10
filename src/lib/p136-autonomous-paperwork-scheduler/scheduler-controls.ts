import {
  appendSchedulerAudit,
  loadSchedulerState,
  saveSchedulerState,
} from "@/lib/p136-autonomous-paperwork-scheduler/scheduler-store";
import type { SchedulerMode, SchedulerState } from "@/lib/p136-autonomous-paperwork-scheduler/types";

export async function startScheduler(input?: {
  intervalMs?: number;
  mode?: "continuous" | "oneCycle";
}): Promise<SchedulerState> {
  const state = await loadSchedulerState();
  state.continuousEnabled = input?.mode !== "oneCycle";
  state.schedulerMode = input?.mode === "oneCycle" ? "oneCycle" : "continuous";
  state.schedulerStatus = "idle";
  state.startedAt = state.startedAt ?? new Date().toISOString();
  state.uptimeStartedAt = state.uptimeStartedAt ?? new Date().toISOString();
  if (input?.intervalMs) state.scheduleIntervalMs = input.intervalMs;
  state.nextScheduledCycleAt = new Date(Date.now() + state.scheduleIntervalMs).toISOString();
  await saveSchedulerState(state);
  await appendSchedulerAudit({ action: "start", mode: state.schedulerMode, intervalMs: state.scheduleIntervalMs });
  return state;
}

export async function pauseScheduler(): Promise<SchedulerState> {
  const state = await loadSchedulerState();
  state.schedulerMode = "paused";
  state.schedulerStatus = state.processingLock ? "running" : "paused";
  await saveSchedulerState(state);
  await appendSchedulerAudit({ action: "pause" });
  return state;
}

export async function resumeScheduler(): Promise<SchedulerState> {
  const state = await loadSchedulerState();
  state.schedulerMode = state.continuousEnabled ? "continuous" : "manual";
  state.schedulerStatus = state.processingLock ? "running" : "idle";
  state.nextScheduledCycleAt = new Date(Date.now() + state.scheduleIntervalMs).toISOString();
  await saveSchedulerState(state);
  await appendSchedulerAudit({ action: "resume" });
  return state;
}

export async function stopScheduler(): Promise<SchedulerState> {
  const state = await loadSchedulerState();
  state.continuousEnabled = false;
  state.schedulerMode = "stopped";
  state.schedulerStatus = state.processingLock ? "running" : "stopped";
  state.nextScheduledCycleAt = null;
  await saveSchedulerState(state);
  await appendSchedulerAudit({ action: "stop" });
  return state;
}

export async function setSchedulerManualMode(): Promise<SchedulerState> {
  const state = await loadSchedulerState();
  state.schedulerMode = "manual";
  state.continuousEnabled = false;
  state.schedulerStatus = state.processingLock ? "running" : "idle";
  await saveSchedulerState(state);
  await appendSchedulerAudit({ action: "manual" });
  return state;
}

export type { SchedulerMode };
