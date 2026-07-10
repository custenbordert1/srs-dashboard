import type { P184EngineConfig } from "@/lib/p184-autonomous-paperwork-send-engine/types";
import type { P185StorageHealth } from "@/lib/p185-production-paperwork-automation-runner/durableStorage";
import type {
  P185Alert,
  P185CircuitBreakerState,
  P185RunnerStateFile,
} from "@/lib/p185-production-paperwork-automation-runner/types";

export type P185LiveGateResult = {
  ready: boolean;
  blockers: string[];
};

export function evaluateP185LiveGates(input: {
  state: P185RunnerStateFile;
  p184Config: P184EngineConfig;
  storage: P185StorageHealth;
  dropboxConfigured: boolean;
  authConfigured: boolean;
  nowMs?: number;
}): P185LiveGateResult {
  const nowMs = input.nowMs ?? Date.now();
  const blockers: string[] = [];
  const { state, p184Config, storage } = input;

  if (p184Config.mode !== "live") blockers.push("P184 mode is not live.");
  if (!p184Config.enabled) blockers.push("P184 enabled is false.");
  const envEnabled =
    state.safety.productionAutomationEnabled ||
    process.env.P185_PRODUCTION_AUTOMATION_ENABLED === "1";
  if (!envEnabled) blockers.push("Production paperwork automation environment flag disabled.");
  if (!storage.durable || !storage.healthy) {
    blockers.push("Durable storage unavailable — live sends fail closed.");
  }
  if (!input.dropboxConfigured) blockers.push("Dropbox Sign integration not configured.");
  // Template validity is enforced inside P184 eligibility (templateKey on eligible rows).
  if (!input.authConfigured) blockers.push("Scheduler authentication not configured.");
  if (state.safety.killSwitch) blockers.push("Global kill switch is active.");
  if (state.safety.pauseUntil && Date.parse(state.safety.pauseUntil) > nowMs) {
    blockers.push(`Automation paused until ${state.safety.pauseUntil}.`);
  }
  if (state.circuit.open) {
    const cooldownOk =
      state.circuit.cooldownUntil && Date.parse(state.circuit.cooldownUntil) <= nowMs;
    if (!cooldownOk) blockers.push("Circuit breaker is open.");
  }
  if (!state.lastDryRunSuccessAt) {
    blockers.push("No successful recent dry-run validation.");
  } else if (
    nowMs - Date.parse(state.lastDryRunSuccessAt) >
    state.safety.requireRecentDryRunMs
  ) {
    blockers.push("Recent dry-run validation is stale.");
  }

  return { ready: blockers.length === 0, blockers };
}

export function openP185CircuitBreaker(
  state: P185RunnerStateFile,
  reason: string,
  nowMs: number,
): void {
  const cooldownMs = 15 * 60 * 1000;
  state.circuit = {
    open: true,
    openedAt: new Date(nowMs).toISOString(),
    failureCount: state.circuit.failureCount + 1,
    lastFailureAt: new Date(nowMs).toISOString(),
    cooldownUntil: new Date(nowMs + cooldownMs).toISOString(),
    reason,
  };
  state.runnerStatus = "circuit_open";
  pushAlert(state, {
    id: `circuit-${nowMs}`,
    severity: "critical",
    code: "circuit_breaker_open",
    message: reason,
    recommendedAction: "Investigate failures, then reset circuit breaker after cooldown.",
    at: new Date(nowMs).toISOString(),
    active: true,
  });
}

export function resetP185CircuitBreaker(state: P185RunnerStateFile, nowMs: number): void {
  state.circuit = {
    open: false,
    openedAt: null,
    failureCount: 0,
    lastFailureAt: null,
    cooldownUntil: null,
    reason: null,
  };
  if (state.runnerStatus === "circuit_open") state.runnerStatus = "idle";
  for (const alert of state.alerts) {
    if (alert.code === "circuit_breaker_open") alert.active = false;
  }
  pushAlert(state, {
    id: `circuit-reset-${nowMs}`,
    severity: "info",
    code: "circuit_breaker_reset",
    message: "Circuit breaker reset by operator.",
    recommendedAction: "Monitor next scheduled cycle.",
    at: new Date(nowMs).toISOString(),
    active: false,
  });
}

export function recordCycleFailure(
  state: P185RunnerStateFile,
  nowMs: number,
): P185CircuitBreakerState {
  state.circuit.failureCount += 1;
  state.circuit.lastFailureAt = new Date(nowMs).toISOString();
  if (state.circuit.failureCount >= state.safety.maxFailuresPerCycle) {
    openP185CircuitBreaker(
      state,
      `Failure threshold reached (${state.circuit.failureCount} failures).`,
      nowMs,
    );
  }
  return state.circuit;
}

export function pushAlert(state: P185RunnerStateFile, alert: P185Alert): void {
  const existing = state.alerts.find((a) => a.code === alert.code && a.active);
  if (existing && alert.active) {
    existing.message = alert.message;
    existing.at = alert.at;
    existing.recommendedAction = alert.recommendedAction;
    return;
  }
  state.alerts = [...state.alerts, alert].slice(-200);
}

export function evaluateP185Alerts(input: {
  state: P185RunnerStateFile;
  storageHealthy: boolean;
  dropboxHealthy: boolean;
  breezyHealthy: boolean;
  authConfigured: boolean;
  queueDepth: number;
  eligibleNow: number;
  nowMs?: number;
}): void {
  const nowMs = input.nowMs ?? Date.now();
  const { state } = input;
  const expected = state.safety.expectedCycleIntervalMs;

  if (
    state.lastAttemptedCycle &&
    nowMs - Date.parse(state.lastAttemptedCycle.finishedAt) > expected * 1.5
  ) {
    pushAlert(state, {
      id: `sched-miss-${nowMs}`,
      severity: "critical",
      code: "scheduler_stalled",
      message: "Scheduler has not run within the expected interval.",
      recommendedAction: "Verify Vercel Cron / company cron and CRON_SECRET.",
      at: new Date(nowMs).toISOString(),
      active: true,
    });
  }

  if (!input.storageHealthy) {
    pushAlert(state, {
      id: `storage-${nowMs}`,
      severity: "critical",
      code: "durable_storage_unavailable",
      message: "Durable storage unavailable.",
      recommendedAction: "Configure P185_DURABLE_DATA_DIR or mounted volume.",
      at: new Date(nowMs).toISOString(),
      active: true,
    });
  }

  if (!input.dropboxHealthy) {
    pushAlert(state, {
      id: `dbs-${nowMs}`,
      severity: "critical",
      code: "dropbox_sign_unavailable",
      message: "Dropbox Sign unavailable or unconfigured.",
      recommendedAction: "Restore Dropbox Sign credentials and re-run dry-run.",
      at: new Date(nowMs).toISOString(),
      active: true,
    });
  }

  if (state.lease && Date.parse(state.lease.expiresAt) < nowMs - 60_000) {
    pushAlert(state, {
      id: `lease-stuck-${nowMs}`,
      severity: "critical",
      code: "lease_stuck",
      message: "Lease stuck beyond expiration.",
      recommendedAction: "Next cycle should take over stale lease; investigate if persistent.",
      at: new Date(nowMs).toISOString(),
      active: true,
    });
  }

  if (state.circuit.open) {
    pushAlert(state, {
      id: `cb-${nowMs}`,
      severity: "critical",
      code: "circuit_breaker_open",
      message: state.circuit.reason ?? "Circuit breaker open.",
      recommendedAction: "Reset after cooldown once root cause is fixed.",
      at: new Date(nowMs).toISOString(),
      active: true,
    });
  }

  if (!input.breezyHealthy) {
    pushAlert(state, {
      id: `breezy-${nowMs}`,
      severity: "critical",
      code: "candidate_source_failures",
      message: "Repeated or current candidate-source (Breezy) failure.",
      recommendedAction: "Check Breezy API credentials and ingestion sync.",
      at: new Date(nowMs).toISOString(),
      active: true,
    });
  }

  const threshold = state.safety.unresolvedEnvelopeAlertMs;
  for (const env of state.envelopes) {
    if (
      env.state === "sent_unverified" &&
      nowMs - Date.parse(env.createdAt) > threshold
    ) {
      pushAlert(state, {
        id: `unresolved-${env.envelopeId}`,
        severity: "critical",
        code: "unresolved_send",
        message: `Unresolved send older than threshold (${env.envelopeId}).`,
        recommendedAction: "Run reconcile-only; do not resend.",
        at: new Date(nowMs).toISOString(),
        active: true,
      });
      break;
    }
  }

  const envLive =
    state.safety.productionAutomationEnabled ||
    process.env.P185_PRODUCTION_AUTOMATION_ENABLED === "1";
  if (envLive && !state.lastDryRunSuccessAt) {
    pushAlert(state, {
      id: `nodry-${nowMs}`,
      severity: "critical",
      code: "live_without_dry_run",
      message: "Live automation enabled without successful recent dry run.",
      recommendedAction: "Run a dry-run cycle before enabling live sends.",
      at: new Date(nowMs).toISOString(),
      active: true,
    });
  }

  if (input.queueDepth > 500) {
    pushAlert(state, {
      id: `queue-${nowMs}`,
      severity: "critical",
      code: "queue_growth",
      message: `Queue depth ${input.queueDepth} exceeds threshold.`,
      recommendedAction: "Inspect rate limits, failures, and circuit breaker.",
      at: new Date(nowMs).toISOString(),
      active: true,
    });
  }

  if (
    input.eligibleNow > 0 &&
    !state.lastLiveSendAt &&
    state.metrics.sendsConfirmed === 0 &&
    envLive
  ) {
    pushAlert(state, {
      id: `noconfirm-${nowMs}`,
      severity: "warning",
      code: "no_confirmed_sends",
      message: "Eligible candidates present but no confirmed sends.",
      recommendedAction: "Verify live gates, Dropbox health, and reconciliation.",
      at: new Date(nowMs).toISOString(),
      active: true,
    });
  }

  if (!input.authConfigured) {
    pushAlert(state, {
      id: `auth-${nowMs}`,
      severity: "critical",
      code: "scheduler_auth_missing",
      message: "Scheduler authentication is not configured.",
      recommendedAction: "Set CRON_SECRET or P185_CRON_SECRET.",
      at: new Date(nowMs).toISOString(),
      active: true,
    });
  }
}
