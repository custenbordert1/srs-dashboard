/** Breezy Candidates tab sync instrumentation, pipeline dedup, and watchdog. */

export type BreezySyncPhase =
  | "preview"
  | "fast-tier"
  | "workflows"
  | "jobs"
  | "hydration-continuation";

export const BREEZY_SYNC_WATCHDOG_WARNING_MS = 10_000;
export const BREEZY_SYNC_WATCHDOG_DEGRADED_MS = 20_000;
export const BREEZY_SYNC_WATCHDOG_TIMEOUT_MS = 45_000;

export type BreezySyncWatchdogLevel = "ok" | "warning" | "degraded" | "timeout";

export type BreezySyncPhaseMetrics = {
  durationMs: number | null;
  candidateCount: number | null;
  workflowCount: number | null;
  cacheHit: boolean;
  liveHit: boolean;
  completed: boolean;
  skipped: boolean;
};

export type BreezySyncMetricsSnapshot = {
  runId: string | null;
  startedAt: string | null;
  endedAt: string | null;
  totalDurationMs: number | null;
  phases: Record<BreezySyncPhase, BreezySyncPhaseMetrics>;
  completedPhases: BreezySyncPhase[];
  apiRequestCount: number;
  timeoutCount: number;
  cacheHitCount: number;
  liveHitCount: number;
  lastTimeoutPhase: BreezySyncPhase | null;
  cacheRestored: boolean;
  liveSyncRunning: boolean;
  watchdogLevel: BreezySyncWatchdogLevel;
  watchdogMessage: string | null;
  lastSuccessfulSyncAt: string | null;
  candidateCount: number | null;
};

type PhaseEndMeta = {
  candidateCount?: number;
  workflowCount?: number;
  cacheHit?: boolean;
  liveHit?: boolean;
  skipped?: boolean;
  timedOut?: boolean;
};

type ActiveRun = {
  runId: string;
  startedAt: number;
  cacheRestored: boolean;
  activePhase: BreezySyncPhase | null;
  phaseStartedAt: number | null;
  phases: Record<BreezySyncPhase, BreezySyncPhaseMetrics>;
  completedPhases: BreezySyncPhase[];
  apiRequestCount: number;
  timeoutCount: number;
  cacheHitCount: number;
  liveHitCount: number;
  lastTimeoutPhase: BreezySyncPhase | null;
  watchdogLevel: BreezySyncWatchdogLevel;
  watchdogMessage: string | null;
  candidateCount: number | null;
  lastSuccessfulSyncAt: string | null;
};

const LOG_PREFIX = "[breezy-sync]";

const emptyPhase = (): BreezySyncPhaseMetrics => ({
  durationMs: null,
  candidateCount: null,
  workflowCount: null,
  cacheHit: false,
  liveHit: false,
  completed: false,
  skipped: false,
});

const emptyPhases = (): Record<BreezySyncPhase, BreezySyncPhaseMetrics> => ({
  preview: emptyPhase(),
  "fast-tier": emptyPhase(),
  workflows: emptyPhase(),
  jobs: emptyPhase(),
  "hydration-continuation": emptyPhase(),
});

let activeRun: ActiveRun | null = null;
let lastSnapshot: BreezySyncMetricsSnapshot;
let activePipeline: Promise<void> | null = null;
let hydrationContinuationInflight: Promise<void> | null = null;
let watchdogTimer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function buildIdleSnapshot(previous?: BreezySyncMetricsSnapshot): BreezySyncMetricsSnapshot {
  return {
    runId: null,
    startedAt: null,
    endedAt: null,
    totalDurationMs: null,
    phases: emptyPhases(),
    completedPhases: [],
    apiRequestCount: 0,
    timeoutCount: 0,
    cacheHitCount: 0,
    liveHitCount: 0,
    lastTimeoutPhase: previous?.lastTimeoutPhase ?? null,
    cacheRestored: false,
    liveSyncRunning: false,
    watchdogLevel: "ok",
    watchdogMessage: null,
    lastSuccessfulSyncAt: previous?.lastSuccessfulSyncAt ?? null,
    candidateCount: previous?.candidateCount ?? null,
  };
}

lastSnapshot = buildIdleSnapshot();

function logLine(parts: Record<string, string | number | boolean | undefined>): void {
  const body = Object.entries(parts)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${value}`)
    .join(" ");
  console.info(`${LOG_PREFIX} ${body}`);
}

function notifyListeners(): void {
  for (const listener of listeners) {
    listener();
  }
}

function publishSnapshot(ended = false): void {
  if (!activeRun) {
    lastSnapshot = {
      ...buildIdleSnapshot(lastSnapshot),
      endedAt: ended ? new Date().toISOString() : lastSnapshot.endedAt,
    };
    notifyListeners();
    return;
  }

  const now = Date.now();
  const totalDurationMs = now - activeRun.startedAt;
  lastSnapshot = {
    runId: activeRun.runId,
    startedAt: new Date(activeRun.startedAt).toISOString(),
    endedAt: ended ? new Date().toISOString() : null,
    totalDurationMs,
    phases: { ...activeRun.phases },
    completedPhases: [...activeRun.completedPhases],
    apiRequestCount: activeRun.apiRequestCount,
    timeoutCount: activeRun.timeoutCount,
    cacheHitCount: activeRun.cacheHitCount,
    liveHitCount: activeRun.liveHitCount,
    lastTimeoutPhase: activeRun.lastTimeoutPhase,
    cacheRestored: activeRun.cacheRestored,
    liveSyncRunning: !ended,
    watchdogLevel: activeRun.watchdogLevel,
    watchdogMessage: activeRun.watchdogMessage,
    lastSuccessfulSyncAt: activeRun.lastSuccessfulSyncAt,
    candidateCount: activeRun.candidateCount,
  };
  notifyListeners();
}

function stopWatchdogTimer(): void {
  if (watchdogTimer !== null) {
    clearInterval(watchdogTimer);
    watchdogTimer = null;
  }
}

function startWatchdogTimer(): void {
  stopWatchdogTimer();
  watchdogTimer = setInterval(() => {
    if (!activeRun) return;
    const totalMs = Date.now() - activeRun.startedAt;
    const phaseMs =
      activeRun.activePhase && activeRun.phaseStartedAt !== null
        ? Date.now() - activeRun.phaseStartedAt
        : 0;
    const elapsedMs = Math.max(totalMs, phaseMs);
    const { level, message } = evaluateSyncWatchdog(elapsedMs, activeRun.activePhase);
    if (level !== activeRun.watchdogLevel || message !== activeRun.watchdogMessage) {
      activeRun.watchdogLevel = level;
      activeRun.watchdogMessage = message;
      if (level === "timeout" && activeRun.activePhase) {
        activeRun.lastTimeoutPhase = activeRun.activePhase;
        activeRun.timeoutCount += 1;
        logLine({ timeout: true, phase: activeRun.activePhase, duration: elapsedMs });
      }
      publishSnapshot();
    }
  }, 1000);
}

export function evaluateSyncWatchdog(
  elapsedMs: number,
  phase: BreezySyncPhase | null,
): { level: BreezySyncWatchdogLevel; message: string | null } {
  if (elapsedMs >= BREEZY_SYNC_WATCHDOG_TIMEOUT_MS) {
    return {
      level: "timeout",
      message: phase
        ? `Using cached candidates while Breezy recovers (${phase} exceeded ${BREEZY_SYNC_WATCHDOG_TIMEOUT_MS / 1000}s).`
        : "Using cached candidates while Breezy recovers.",
    };
  }
  if (elapsedMs >= BREEZY_SYNC_WATCHDOG_DEGRADED_MS) {
    return {
      level: "degraded",
      message: "Using cached candidates while Breezy recovers.",
    };
  }
  if (elapsedMs >= BREEZY_SYNC_WATCHDOG_WARNING_MS) {
    return {
      level: "warning",
      message: "Live sync slower than expected — table stays on cached candidates.",
    };
  }
  return { level: "ok", message: null };
}

export function formatBreezySyncWatchdogBanner(snapshot: BreezySyncMetricsSnapshot): string | null {
  return snapshot.watchdogMessage;
}

export function subscribeBreezySyncMetrics(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getBreezySyncMetricsSnapshot(): BreezySyncMetricsSnapshot {
  return lastSnapshot;
}

export function isBreezySyncPipelineActive(): boolean {
  return activePipeline !== null;
}

export function isHydrationContinuationInflight(): boolean {
  return hydrationContinuationInflight !== null;
}

export function beginBreezySyncRun(options?: { cacheRestored?: boolean }): string {
  const runId = `sync-${Date.now()}`;
  activeRun = {
    runId,
    startedAt: Date.now(),
    cacheRestored: options?.cacheRestored ?? false,
    activePhase: null,
    phaseStartedAt: null,
    phases: emptyPhases(),
    completedPhases: [],
    apiRequestCount: 0,
    timeoutCount: 0,
    cacheHitCount: 0,
    liveHitCount: 0,
    lastTimeoutPhase: null,
    watchdogLevel: "ok",
    watchdogMessage: null,
    candidateCount: null,
    lastSuccessfulSyncAt: lastSnapshot.lastSuccessfulSyncAt,
  };
  logLine({ phase: "start", run: "total", cacheRestored: activeRun.cacheRestored });
  publishSnapshot();
  startWatchdogTimer();
  return runId;
}

export function endBreezySyncRun(candidateCount?: number): void {
  if (!activeRun) return;
  const duration = Date.now() - activeRun.startedAt;
  if (candidateCount !== undefined) {
    activeRun.candidateCount = candidateCount;
    activeRun.lastSuccessfulSyncAt = new Date().toISOString();
  }
  logLine({
    phase: "end",
    run: "total",
    duration,
    candidates: activeRun.candidateCount ?? undefined,
    apiRequests: activeRun.apiRequestCount,
    timeouts: activeRun.timeoutCount,
    cacheHits: activeRun.cacheHitCount,
    liveHits: activeRun.liveHitCount,
  });
  activeRun = null;
  stopWatchdogTimer();
  publishSnapshot(true);
}

export function beginBreezySyncPhase(phase: BreezySyncPhase): void {
  if (!activeRun) return;
  activeRun.activePhase = phase;
  activeRun.phaseStartedAt = Date.now();
  logLine({ phase: "start", name: phase });
  publishSnapshot();
}

export function endBreezySyncPhase(phase: BreezySyncPhase, meta: PhaseEndMeta = {}): void {
  if (!activeRun) return;
  const startedAt = activeRun.phaseStartedAt;
  const durationMs = startedAt !== null ? Date.now() - startedAt : null;
  const phaseMetrics: BreezySyncPhaseMetrics = {
    durationMs,
    candidateCount: meta.candidateCount ?? null,
    workflowCount: meta.workflowCount ?? null,
    cacheHit: meta.cacheHit ?? false,
    liveHit: meta.liveHit ?? false,
    completed: !meta.skipped,
    skipped: meta.skipped ?? false,
  };
  activeRun.phases[phase] = phaseMetrics;
  if (!meta.skipped) {
    activeRun.completedPhases.push(phase);
  }
  if (meta.cacheHit) activeRun.cacheHitCount += 1;
  if (meta.liveHit) activeRun.liveHitCount += 1;
  if (meta.timedOut) {
    activeRun.timeoutCount += 1;
    activeRun.lastTimeoutPhase = phase;
    logLine({ timeout: true, phase, duration: durationMs ?? undefined });
  }
  if (meta.candidateCount !== undefined) {
    activeRun.candidateCount = meta.candidateCount;
  }
  if (meta.workflowCount !== undefined && phase === "workflows") {
    logLine({ workflows: meta.workflowCount });
  }
  activeRun.activePhase = null;
  activeRun.phaseStartedAt = null;
  logLine({
    phase: "end",
    name: phase,
    duration: durationMs ?? undefined,
    candidates: meta.candidateCount,
    cacheHit: meta.cacheHit,
    liveHit: meta.liveHit,
    skipped: meta.skipped,
  });
  publishSnapshot();
}

export function recordBreezySyncApiRequest(options?: { cacheHit?: boolean; liveHit?: boolean }): void {
  if (!activeRun) return;
  activeRun.apiRequestCount += 1;
  if (options?.cacheHit) activeRun.cacheHitCount += 1;
  if (options?.liveHit) activeRun.liveHitCount += 1;
  publishSnapshot();
}

export function recordBreezySyncTimeout(phase: BreezySyncPhase): void {
  if (!activeRun) return;
  activeRun.timeoutCount += 1;
  activeRun.lastTimeoutPhase = phase;
  logLine({ timeout: true, phase });
  publishSnapshot();
}

/** One active background sync pipeline per browser tab. */
export function runBreezySyncPipeline(
  work: () => Promise<void>,
  options?: { force?: boolean; duplicateLabel?: string; cacheRestored?: boolean },
): Promise<void> {
  const force = options?.force ?? false;
  if (activePipeline) {
    logLine({ pipeline: "reuse", label: options?.duplicateLabel ?? "inflight", force });
    return activePipeline;
  }

  let pipelineRef: Promise<void> | null = null;
  pipelineRef = (async () => {
    const runId = beginBreezySyncRun({ cacheRestored: options?.cacheRestored ?? false });
    try {
      await work();
    } finally {
      endBreezySyncRun(lastSnapshot.candidateCount ?? undefined);
      logLine({ pipeline: "end", runId });
      if (activePipeline === pipelineRef) {
        activePipeline = null;
      }
    }
  })();

  activePipeline = pipelineRef;
  logLine({ pipeline: "start", force });
  return pipelineRef;
}

/** Prevent stacked hydration continuation rounds. */
export function runExclusiveHydrationContinuation(work: () => Promise<void>): Promise<void> {
  if (hydrationContinuationInflight) {
    logLine({ hydration: "reuse-inflight" });
    return hydrationContinuationInflight;
  }
  if (activePipeline) {
    logLine({ hydration: "defer-pipeline-active" });
  }
  const task = work();
  hydrationContinuationInflight = task.finally(() => {
    if (hydrationContinuationInflight === task) {
      hydrationContinuationInflight = null;
    }
  });
  return hydrationContinuationInflight;
}
