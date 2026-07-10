import { executeP1853BacklogCycle } from "@/lib/p185-3-controlled-live-paperwork-rollout/backlog";
import { executeP1853Canary } from "@/lib/p185-3-controlled-live-paperwork-rollout/canary";
import { buildP1853ReadinessReport } from "@/lib/p185-3-controlled-live-paperwork-rollout/readiness";
import { loadP1853State, saveP1853State } from "@/lib/p185-3-controlled-live-paperwork-rollout/store";
import { getP185StorageHealth } from "@/lib/p185-production-paperwork-automation-runner";
import { reconcileP185Envelopes } from "@/lib/p185-production-paperwork-automation-runner";
import { buildP185HealthReport } from "@/lib/p185-production-paperwork-automation-runner/health";

export type P1853OperatorAction =
  | "final_dry_run"
  | "start_canary"
  | "pause_rollout"
  | "resume_after_canary"
  | "release_backlog_cycle"
  | "kill_switch_on"
  | "kill_switch_off"
  | "reset_circuit"
  | "reconcile_envelopes"
  | "cancel_remaining_unsent";

const LIVE_IMPACTING: P1853OperatorAction[] = [
  "start_canary",
  "resume_after_canary",
  "release_backlog_cycle",
  "kill_switch_on",
  "kill_switch_off",
  "reset_circuit",
  "cancel_remaining_unsent",
];

export async function executeP1853OperatorAction(input: {
  action: P1853OperatorAction;
  byUserId: string;
  confirmed?: boolean;
}): Promise<{ ok: boolean; error?: string; result?: unknown }> {
  if (LIVE_IMPACTING.includes(input.action) && !input.confirmed) {
    return { ok: false, error: "Confirmation required for live-impacting control." };
  }

  const state = await loadP1853State();

  switch (input.action) {
    case "final_dry_run": {
      const readiness = await buildP1853ReadinessReport();
      return { ok: true, result: readiness };
    }
    case "start_canary": {
      const result = await executeP1853Canary({
        authorizeCanary: true,
        confirmed: true,
      });
      return { ok: result.executed || Boolean(result.skippedReason), result };
    }
    case "pause_rollout": {
      state.phase = "canary_paused";
      state.canary.paused = true;
      state.nextScheduledAction = `Paused by ${input.byUserId}`;
      await saveP1853State(state);
      return { ok: true, result: { phase: state.phase } };
    }
    case "resume_after_canary": {
      if (!state.canary.passed) {
        return { ok: false, error: "Cannot resume backlog — canary has not passed." };
      }
      // Do not auto-send remaining; only mark phase ready for scheduled release
      state.phase = "canary_passed";
      state.canary.paused = false;
      state.nextScheduledAction =
        "Canary verified — remaining backlog release requires separate authorized backlog cycles.";
      await saveP1853State(state);
      return { ok: true, result: { phase: state.phase } };
    }
    case "release_backlog_cycle": {
      const result = await executeP1853BacklogCycle({
        authorizeBacklog: true,
        confirmed: true,
      });
      return { ok: result.executed || Boolean(result.skippedReason), result };
    }
    case "kill_switch_on": {
      state.killSwitch = true;
      state.phase = "rollout_blocked";
      await saveP1853State(state);
      return { ok: true };
    }
    case "kill_switch_off": {
      state.killSwitch = false;
      if (state.phase === "rollout_blocked") state.phase = "awaiting_canary";
      await saveP1853State(state);
      return { ok: true };
    }
    case "reset_circuit": {
      state.circuitOpen = false;
      await saveP1853State(state);
      return { ok: true };
    }
    case "reconcile_envelopes": {
      const recon = await reconcileP185Envelopes();
      return { ok: true, result: recon };
    }
    case "cancel_remaining_unsent": {
      if (!state.cohort) return { ok: false, error: "No frozen cohort." };
      state.cohort = {
        ...state.cohort,
        members: state.cohort.members.map((m) =>
          m.blockedReason || state.canary.attempts.some((a) => a.candidateId === m.candidateId && a.ok)
            ? m
            : { ...m, blockedReason: `Canceled remaining by ${input.byUserId}`, removed: true },
        ),
      };
      state.backlog.remaining = 0;
      state.phase = "rollout_blocked";
      await saveP1853State(state);
      return { ok: true };
    }
    default:
      return { ok: false, error: "Unknown action." };
  }
}

export async function getP1853DashboardSnapshot(): Promise<Record<string, unknown>> {
  const state = await loadP1853State();
  const dry = state.lastDryRun;
  const storage = getP185StorageHealth();
  let dropboxHealthy = false;
  let schedulerHealth = "unknown";
  try {
    const health = await buildP185HealthReport({ breezyHealthy: true, breezyDetail: "n/a" });
    dropboxHealthy = health.dropboxSign.healthy;
    schedulerHealth = health.schedulerStatus;
  } catch {
    // health optional for snapshot
  }
  return {
    rolloutId: state.cohort?.rolloutId ?? null,
    approvedCohort: state.cohort?.approvedCount ?? 0,
    stillEligible: dry?.stillEligible ?? 0,
    canaryQueued: Math.max(0, 5 - state.canary.attempted),
    canarySent: state.canary.attempted,
    canaryConfirmed: state.canary.confirmed,
    remainingBacklog: state.backlog.remaining,
    currentCycle: state.canary.passed ? state.backlog.cycle : 0,
    nextScheduledCycle: state.nextScheduledAction,
    nextScheduledAction: state.nextScheduledAction,
    sentToday: state.totals.packetsSent,
    confirmedToday: state.totals.packetsConfirmed,
    sentUnverified: state.totals.sentUnverified,
    failed: state.totals.failed,
    blockedAfterApproval: state.totals.newlyBlocked,
    duplicatesPrevented: state.totals.duplicatesPrevented,
    circuitBreaker: state.circuitOpen ? "OPEN" : "Closed",
    killSwitch: state.killSwitch,
    storageHealth: storage.durable && storage.healthy ? "Durable" : storage.adapter,
    dropboxSignHealth: dropboxHealthy ? "Healthy" : "Unavailable",
    schedulerHealth,
    phase: state.phase,
  };
}
