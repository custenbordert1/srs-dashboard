import {
  getP154IntervalMs,
  isP154ContinuousEnabled,
} from "@/lib/p154-full-candidate-backfill-continuous-processing/config";
import {
  loadP1544State,
  saveP1544State,
} from "@/lib/p154-full-candidate-backfill-continuous-processing/backfill-store";
import { executeP1544BackfillContinuousCycle } from "@/lib/p154-full-candidate-backfill-continuous-processing/execute-backfill-cycle";
import type { AuthSession } from "@/lib/auth/types";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function startP1544ContinuousProcessing(input: {
  session: AuthSession;
  dryRun?: boolean;
  userId?: string;
  maxCycles?: number;
}): Promise<void> {
  const state = await loadP1544State();
  state.continuousEnabled = isP154ContinuousEnabled();
  state.scheduleIntervalMs = getP154IntervalMs();
  state.schedulerMode = "continuous";
  state.nextScheduledRunAt = new Date(Date.now() + state.scheduleIntervalMs).toISOString();
  await saveP1544State(state);

  let cycles = 0;
  while (true) {
    const current = await loadP1544State();
    if (current.schedulerMode === "stopped" || current.schedulerMode === "paused") break;
    if (input.maxCycles !== undefined && cycles >= input.maxCycles) break;

    await executeP1544BackfillContinuousCycle({
      session: input.session,
      dryRun: input.dryRun ?? true,
      mode: "continuous",
      fullBackfill: cycles === 0,
      userId: input.userId,
    });

    cycles += 1;
    const after = await loadP1544State();
    after.nextScheduledRunAt = new Date(Date.now() + after.scheduleIntervalMs).toISOString();
    await saveP1544State(after);

    const next = await loadP1544State();
    if (next.schedulerMode === "stopped" || next.schedulerMode === "paused") break;
    if (input.maxCycles !== undefined && cycles >= input.maxCycles) break;

    await sleep(next.scheduleIntervalMs);
  }
}

export async function stopP1544ContinuousProcessing(): Promise<void> {
  const state = await loadP1544State();
  state.schedulerMode = "stopped";
  state.continuousEnabled = false;
  state.nextScheduledRunAt = null;
  await saveP1544State(state);
}

export async function pauseP1544ContinuousProcessing(): Promise<void> {
  const state = await loadP1544State();
  state.schedulerMode = "paused";
  state.nextScheduledRunAt = null;
  await saveP1544State(state);
}

export async function resumeP1544ContinuousProcessing(): Promise<void> {
  const state = await loadP1544State();
  state.schedulerMode = "continuous";
  state.continuousEnabled = true;
  state.nextScheduledRunAt = new Date(Date.now() + state.scheduleIntervalMs).toISOString();
  await saveP1544State(state);
}
