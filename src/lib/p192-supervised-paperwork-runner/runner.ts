import { randomUUID } from "node:crypto";
import {
  acquireP192ProcessLock,
  clearP192StopRequest,
  isP192StopRequested,
  releaseP192ProcessLock,
  writeP192Status,
} from "@/lib/p192-supervised-paperwork-runner/control";
import { runP192Cycle } from "@/lib/p192-supervised-paperwork-runner/cycle";
import { runP192Preflight } from "@/lib/p192-supervised-paperwork-runner/preflight";
import {
  applyP192ProductionDropboxEnv,
  enableP192LivePaperworkModes,
  restoreP192SafeModes,
  readP192DropboxTestMode,
} from "@/lib/p192-supervised-paperwork-runner/productionMode";
import {
  P192_INTERVAL_MS,
  P192_SOURCE_PHASE,
  type P192CycleSummary,
  type P192PreflightResult,
  type P192RunnerStatus,
} from "@/lib/p192-supervised-paperwork-runner/types";
import { loadP184EngineState } from "@/lib/p184-autonomous-paperwork-send-engine/store";
import { setP185StorageTestFlags } from "@/lib/p185-production-paperwork-automation-runner/durableStorage";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function baseStatus(partial: Partial<P192RunnerStatus>): P192RunnerStatus {
  return {
    phase: "stopped",
    sourcePhase: P192_SOURCE_PHASE,
    updatedAt: new Date().toISOString(),
    startedAt: null,
    pid: null,
    ownerId: null,
    leaseOwnerId: null,
    leaseExpiresAt: null,
    cycleCount: 0,
    lastCycle: null,
    nextCycleAt: null,
    p184Mode: "dry_run",
    testMode: null,
    productionModeConfirmed: false,
    storageHealthy: true,
    circuitOpen: false,
    killSwitch: false,
    stopRequested: false,
    pauseReason: null,
    ...partial,
  };
}

export type P192StartResult = {
  started: boolean;
  reason: string | null;
  preflight: P192PreflightResult;
  firstCycle: P192CycleSummary | null;
  ownerId: string | null;
};

/**
 * Start continuous supervised runner. Blocks until stop / pause abort.
 */
export async function startP192SupervisedRunner(input?: {
  skipSleep?: boolean;
  maxCycles?: number;
}): Promise<P192StartResult> {
  setP185StorageTestFlags({ forceDurable: true });
  applyP192ProductionDropboxEnv();

  const ownerId = `p192-${randomUUID().slice(0, 10)}`;
  const lock = await acquireP192ProcessLock(ownerId);
  if (!lock.ok) {
    const preflight = await runP192Preflight({ skipDryScan: true });
    return {
      started: false,
      reason: lock.reason,
      preflight,
      firstCycle: null,
      ownerId: null,
    };
  }

  await clearP192StopRequest();

  await writeP192Status(
    baseStatus({
      phase: "preflight",
      pid: process.pid,
      ownerId,
      startedAt: new Date().toISOString(),
    }),
  );

  const preflight = await runP192Preflight();
  if (!preflight.ok || !preflight.productionModeConfirmed) {
    await restoreP192SafeModes();
    await releaseP192ProcessLock(ownerId);
    await writeP192Status(
      baseStatus({
        phase: "aborted",
        pid: process.pid,
        ownerId,
        pauseReason: preflight.abortReasons.join("; "),
        testMode: preflight.testMode,
        productionModeConfirmed: false,
      }),
    );
    return {
      started: false,
      reason: preflight.abortReasons.join("; "),
      preflight,
      firstCycle: null,
      ownerId,
    };
  }

  await writeP192Status(
    baseStatus({
      phase: "dry_run_validation",
      pid: process.pid,
      ownerId,
      startedAt: new Date().toISOString(),
      productionModeConfirmed: true,
      testMode: preflight.testMode,
    }),
  );

  await enableP192LivePaperworkModes();

  let shuttingDown = false;
  const shutdown = async (reason: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    await writeP192Status(
      baseStatus({
        phase: "stopping",
        pid: process.pid,
        ownerId,
        pauseReason: reason,
        stopRequested: true,
      }),
    );
    const restored = await restoreP192SafeModes();
    await releaseP192ProcessLock(ownerId);
    await writeP192Status(
      baseStatus({
        phase: "stopped",
        pid: process.pid,
        ownerId,
        p184Mode: restored.p184Mode,
        testMode: restored.testMode,
        stopRequested: true,
        pauseReason: reason,
      }),
    );
  };

  const onSignal = () => {
    void requestStopAndShutdown("SIGINT/SIGTERM");
  };
  async function requestStopAndShutdown(reason: string) {
    const { requestP192Stop } = await import("@/lib/p192-supervised-paperwork-runner/control");
    await requestP192Stop();
    await shutdown(reason);
  }
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);

  let cycleNumber = 0;
  let firstCycle: P192CycleSummary | null = null;
  let lastCycle: P192CycleSummary | null = null;

  try {
    // Immediate first cycle
    while (true) {
      if (await isP192StopRequested()) {
        await shutdown("operator stop requested");
        break;
      }
      if (input?.maxCycles !== undefined && cycleNumber >= input.maxCycles) {
        await shutdown("maxCycles reached");
        break;
      }

      cycleNumber += 1;
      await writeP192Status(
        baseStatus({
          phase: "running",
          pid: process.pid,
          ownerId,
          startedAt: new Date().toISOString(),
          cycleCount: cycleNumber - 1,
          lastCycle,
          productionModeConfirmed: true,
          testMode: false,
          p184Mode: (await loadP184EngineState()).config.mode,
        }),
      );

      const result = await runP192Cycle({
        cycleNumber,
        ownerId,
      });
      lastCycle = result.summary;
      if (!firstCycle) {
        firstCycle = result.summary;
        try {
          const { mkdir, writeFile } = await import("node:fs/promises");
          const path = await import("node:path");
          const art = path.join(process.cwd(), "artifacts");
          await mkdir(art, { recursive: true });
          await writeFile(
            path.join(art, "p192-first-live-cycle.json"),
            `${JSON.stringify(
              {
                writtenAt: new Date().toISOString(),
                ownerId,
                firstCycle: result.summary,
              },
              null,
              2,
            )}\n`,
          );
        } catch {
          // non-fatal
        }
      }

      const p184 = await loadP184EngineState();
      await writeP192Status(
        baseStatus({
          phase: result.paused ? "paused" : "waiting",
          pid: process.pid,
          ownerId,
          startedAt: new Date().toISOString(),
          cycleCount: cycleNumber,
          lastCycle: result.summary,
          nextCycleAt: result.summary.nextCycleAt,
          p184Mode: p184.config.mode,
          testMode: readP192DropboxTestMode(),
          productionModeConfirmed: true,
          pauseReason: result.pauseReason,
          circuitOpen: result.summary.circuitStatus === "open",
          killSwitch: result.summary.killSwitch,
        }),
      );

      console.log(
        JSON.stringify(
          {
            cycle: result.summary.cycleNumber,
            at: result.summary.finishedAt,
            evaluated: result.summary.evaluated,
            eligible: result.summary.eligible,
            attempted: result.summary.attempted,
            confirmedSent: result.summary.confirmedSent,
            sentUnverified: result.summary.sentUnverified,
            failed: result.summary.failed,
            skipped: result.summary.skipped,
            duplicatesPrevented: result.summary.duplicatesPrevented,
            remainingEligible: result.summary.remainingEligible,
            p184Mode: result.summary.p184Mode,
            leaseStatus: result.summary.leaseStatus,
            circuitStatus: result.summary.circuitStatus,
            killSwitch: result.summary.killSwitch,
            nextCycleAt: result.summary.nextCycleAt,
            paused: result.paused,
            pauseReason: result.pauseReason,
          },
          null,
          2,
        ),
      );

      if (result.paused) {
        await shutdown(result.pauseReason ?? "paused");
        break;
      }

      if (await isP192StopRequested()) {
        await shutdown("operator stop requested");
        break;
      }
      if (input?.maxCycles !== undefined && cycleNumber >= input.maxCycles) {
        await shutdown("maxCycles reached");
        break;
      }

      if (!input?.skipSleep) {
        const wakeAt = Date.now() + P192_INTERVAL_MS;
        while (Date.now() < wakeAt) {
          if (await isP192StopRequested()) break;
          await sleep(Math.min(5_000, wakeAt - Date.now()));
        }
      }
    }
  } catch (err) {
    await shutdown(err instanceof Error ? err.message : String(err));
  } finally {
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
  }

  return {
    started: true,
    reason: null,
    preflight,
    firstCycle,
    ownerId,
  };
}

export async function runP192Once(): Promise<{
  preflight: P192PreflightResult;
  cycle: P192CycleSummary | null;
  restored: { p184Mode: string };
}> {
  applyP192ProductionDropboxEnv();
  setP185StorageTestFlags({ forceDurable: true });
  const preflight = await runP192Preflight();
  if (!preflight.ok) {
    const restored = await restoreP192SafeModes();
    return { preflight, cycle: null, restored: { p184Mode: restored.p184Mode } };
  }
  await enableP192LivePaperworkModes();
  const ownerId = `p192-once-${randomUUID().slice(0, 8)}`;
  try {
    const result = await runP192Cycle({ cycleNumber: 1, ownerId });
    return {
      preflight,
      cycle: result.summary,
      restored: { p184Mode: (await restoreP192SafeModes()).p184Mode },
    };
  } catch (err) {
    const restored = await restoreP192SafeModes();
    throw Object.assign(err instanceof Error ? err : new Error(String(err)), {
      restored,
    });
  }
}

export async function stopP192SupervisedRunner(): Promise<{
  stopRequested: true;
  restored: { p184Mode: string; testMode: boolean | null };
  status: P192RunnerStatus | null;
}> {
  const { requestP192Stop, readP192Status } = await import(
    "@/lib/p192-supervised-paperwork-runner/control"
  );
  await requestP192Stop();
  // Give running process a moment; also restore modes if no process holds lock
  await sleep(1500);
  const status = await readP192Status();
  const lockGone = !status || status.phase === "stopped" || status.phase === "aborted";
  const restored = await restoreP192SafeModes();
  if (lockGone && status?.ownerId) {
    await releaseP192ProcessLock(status.ownerId);
  }
  return {
    stopRequested: true,
    restored: { p184Mode: restored.p184Mode, testMode: restored.testMode },
    status: await readP192Status(),
  };
}
