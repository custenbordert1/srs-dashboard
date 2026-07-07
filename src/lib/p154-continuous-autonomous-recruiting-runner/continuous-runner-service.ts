import type { AuthSession } from "@/lib/auth/types";
import {
  getP154IntervalMs,
  isP154ContinuousEnabled,
} from "@/lib/p154-continuous-autonomous-recruiting-runner/runner-config";
import { runAutonomousRecruitingCycle } from "@/lib/p154-continuous-autonomous-recruiting-runner/run-autonomous-recruiting-cycle";
import {
  loadP1547RunnerState,
  markP1547RunnerStarted,
  resetP1547RunnerLock,
  saveP1547RunnerState,
  stopP1547Runner,
} from "@/lib/p154-continuous-autonomous-recruiting-runner/runner-store";
import type { P1547CycleReport } from "@/lib/p154-continuous-autonomous-recruiting-runner/types";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function startContinuousAutonomousRecruitingRunner(input: {
  session: AuthSession;
  dryRun?: boolean;
  userId?: string;
  maxCycles?: number;
  skipSleep?: boolean;
}): Promise<P1547CycleReport[]> {
  if (!isP154ContinuousEnabled() && input.maxCycles === undefined) {
    throw new Error(
      "P154_CONTINUOUS_ENABLED is not true — set P154_CONTINUOUS_ENABLED=true to start continuous execution.",
    );
  }

  await markP1547RunnerStarted();
  const state = await loadP1547RunnerState();
  state.schedulerMode = input.skipSleep ? "simulation" : "continuous";
  state.continuousEnabled = isP154ContinuousEnabled();
  state.scheduleIntervalMs = getP154IntervalMs();
  await saveP1547RunnerState(state);

  const reports: P1547CycleReport[] = [];
  let cycles = 0;

  while (true) {
    const current = await loadP1547RunnerState();
    if (current.schedulerMode === "stopped" || current.schedulerMode === "paused") break;
    if (input.maxCycles !== undefined && cycles >= input.maxCycles) break;

    const report = await runAutonomousRecruitingCycle({
      session: input.session,
      dryRun: input.dryRun ?? true,
      mode: input.skipSleep ? "simulation" : "continuous",
      cycleNumber: cycles + 1,
      fullBackfill: input.skipSleep ? false : cycles === 0,
      userId: input.userId,
    });
    reports.push(report);

    cycles += 1;
    const after = await loadP1547RunnerState();
    after.nextRun = new Date(Date.now() + after.scheduleIntervalMs).toISOString();
    after.currentStatus = input.skipSleep ? "idle" : "idle";
    await saveP1547RunnerState(after);

    const next = await loadP1547RunnerState();
    if (next.schedulerMode === "stopped" || next.schedulerMode === "paused") break;
    if (input.maxCycles !== undefined && cycles >= input.maxCycles) break;

    if (!input.skipSleep) {
      await sleep(next.scheduleIntervalMs);
    }
  }

  return reports;
}

export async function pauseContinuousAutonomousRecruitingRunner(): Promise<void> {
  const state = await loadP1547RunnerState();
  state.schedulerMode = "paused";
  state.currentStatus = "paused";
  state.nextRun = null;
  await saveP1547RunnerState(state);
}

export async function resumeContinuousAutonomousRecruitingRunner(): Promise<void> {
  const state = await loadP1547RunnerState();
  state.schedulerMode = "continuous";
  state.currentStatus = "idle";
  state.continuousEnabled = isP154ContinuousEnabled();
  state.nextRun = new Date(Date.now() + state.scheduleIntervalMs).toISOString();
  await saveP1547RunnerState(state);
}

export { stopP1547Runner as stopContinuousAutonomousRecruitingRunner };

export async function simulateContinuousAutonomousRecruitingRunner(input: {
  session: AuthSession;
  cycles?: number;
  dryRun?: boolean;
  userId?: string;
}): Promise<P1547CycleReport[]> {
  await resetP1547RunnerLock();
  return startContinuousAutonomousRecruitingRunner({
    session: input.session,
    dryRun: input.dryRun ?? true,
    userId: input.userId,
    maxCycles: input.cycles ?? 3,
    skipSleep: true,
  });
}
