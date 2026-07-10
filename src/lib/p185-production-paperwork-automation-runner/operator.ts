import {
  loadP185RunnerState,
  saveP185RunnerState,
} from "@/lib/p185-production-paperwork-automation-runner/durableStorage";
import { pushAlert, resetP185CircuitBreaker } from "@/lib/p185-production-paperwork-automation-runner/safety";
import { runP185ProductionPaperworkAutomation } from "@/lib/p185-production-paperwork-automation-runner/runner";
import { reconcileP185Envelopes } from "@/lib/p185-production-paperwork-automation-runner/reconciliation";
import type { P185RunnerStateFile } from "@/lib/p185-production-paperwork-automation-runner/types";

export type P185OperatorAction =
  | "pause"
  | "resume"
  | "kill_switch_on"
  | "kill_switch_off"
  | "circuit_open"
  | "circuit_reset"
  | "dry_run_cycle"
  | "live_cycle"
  | "reconcile";

export type P185OperatorResult = {
  ok: boolean;
  action: P185OperatorAction;
  error?: string;
  state?: P185RunnerStateFile;
  run?: Awaited<ReturnType<typeof runP185ProductionPaperworkAutomation>>;
  reconciliation?: Awaited<ReturnType<typeof reconcileP185Envelopes>>;
};

async function auditControl(
  state: P185RunnerStateFile,
  action: P185OperatorAction,
  byUserId: string,
  confirmed: boolean,
): Promise<void> {
  pushAlert(state, {
    id: `op-${action}-${Date.now()}`,
    severity: action.includes("live") || action.includes("kill") ? "critical" : "info",
    code: `operator_${action}`,
    message: `Operator ${byUserId} requested ${action} (confirmed=${confirmed}).`,
    recommendedAction: "Review audit trail for live-impacting controls.",
    at: new Date().toISOString(),
    active: false,
  });
}

const LIVE_IMPACTING: P185OperatorAction[] = [
  "kill_switch_on",
  "kill_switch_off",
  "circuit_open",
  "circuit_reset",
  "live_cycle",
  "resume",
];

export async function executeP185OperatorAction(input: {
  action: P185OperatorAction;
  byUserId: string;
  confirmed?: boolean;
  pauseUntil?: string | null;
}): Promise<P185OperatorResult> {
  const confirmed = Boolean(input.confirmed);
  if (LIVE_IMPACTING.includes(input.action) && !confirmed) {
    return {
      ok: false,
      action: input.action,
      error: "Confirmation required for live-impacting control.",
    };
  }

  const state = await loadP185RunnerState();
  await auditControl(state, input.action, input.byUserId, confirmed);

  switch (input.action) {
    case "pause": {
      state.safety.pauseUntil =
        input.pauseUntil ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      state.runnerStatus = "paused";
      await saveP185RunnerState(state);
      return { ok: true, action: input.action, state: await loadP185RunnerState() };
    }
    case "resume": {
      state.safety.pauseUntil = null;
      if (!state.safety.killSwitch && !state.circuit.open) state.runnerStatus = "idle";
      await saveP185RunnerState(state);
      return { ok: true, action: input.action, state: await loadP185RunnerState() };
    }
    case "kill_switch_on": {
      state.safety.killSwitch = true;
      state.runnerStatus = "killed";
      pushAlert(state, {
        id: `kill-on-${Date.now()}`,
        severity: "critical",
        code: "kill_switch",
        message: "Global kill switch activated.",
        recommendedAction: "Clear kill switch only after investigation.",
        at: new Date().toISOString(),
        active: true,
      });
      await saveP185RunnerState(state);
      return { ok: true, action: input.action, state: await loadP185RunnerState() };
    }
    case "kill_switch_off": {
      state.safety.killSwitch = false;
      for (const a of state.alerts) if (a.code === "kill_switch") a.active = false;
      state.runnerStatus = state.circuit.open ? "circuit_open" : "idle";
      await saveP185RunnerState(state);
      return { ok: true, action: input.action, state: await loadP185RunnerState() };
    }
    case "circuit_open": {
      const { openP185CircuitBreaker } = await import(
        "@/lib/p185-production-paperwork-automation-runner/safety"
      );
      openP185CircuitBreaker(state, "Opened by operator.", Date.now());
      await saveP185RunnerState(state);
      return { ok: true, action: input.action, state: await loadP185RunnerState() };
    }
    case "circuit_reset": {
      resetP185CircuitBreaker(state, Date.now());
      await saveP185RunnerState(state);
      return { ok: true, action: input.action, state: await loadP185RunnerState() };
    }
    case "dry_run_cycle": {
      await saveP185RunnerState(state);
      const run = await runP185ProductionPaperworkAutomation({
        intent: "dry_run",
        byUserId: input.byUserId,
      });
      return { ok: true, action: input.action, run, state: await loadP185RunnerState() };
    }
    case "live_cycle": {
      await saveP185RunnerState(state);
      const run = await runP185ProductionPaperworkAutomation({
        intent: "live",
        byUserId: input.byUserId,
      });
      return { ok: true, action: input.action, run, state: await loadP185RunnerState() };
    }
    case "reconcile": {
      await saveP185RunnerState(state);
      const reconciliation = await reconcileP185Envelopes();
      return {
        ok: true,
        action: input.action,
        reconciliation,
        state: await loadP185RunnerState(),
      };
    }
    default:
      return { ok: false, action: input.action, error: "Unknown action." };
  }
}
