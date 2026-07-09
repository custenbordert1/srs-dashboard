import type { AuthSession } from "@/lib/auth/types";
import { loadAutopilotState, saveAutopilotState } from "@/lib/p154-controlled-production-autopilot-activation/autopilot-store";
import { isP154ControlledProductionAutopilotEnabled } from "@/lib/p154-controlled-production-autopilot-activation/execute-controlled-production-autopilot";
import {
  pauseContinuousAutonomousRecruitingRunner,
  resumeContinuousAutonomousRecruitingRunner,
} from "@/lib/p154-continuous-autonomous-recruiting-runner/continuous-runner-service";
import { runAutonomousRecruitingCycle } from "@/lib/p154-continuous-autonomous-recruiting-runner/run-autonomous-recruiting-cycle";
import { stopP1547Runner } from "@/lib/p154-continuous-autonomous-recruiting-runner/runner-store";
import { stopP1544ContinuousProcessing } from "@/lib/p154-full-candidate-backfill-continuous-processing/continuous-runner";
import { buildP159OperationsControlCenter } from "@/lib/p159-operations-control-center/build-operations-control-center";
import {
  getP154MaxPaperworkSendsPerCycle,
  isP154ContinuousEnabled,
} from "@/lib/p154-continuous-autonomous-recruiting-runner/runner-config";
import type { P159ControlAction, P159ControlResult } from "@/lib/p159-operations-control-center/types";
import { resolveP169EnvConfig } from "@/lib/p169-autonomous-recruiting-orchestrator/orchestrator-config";
import {
  evaluateSendCycleGates,
  resolveGateProfileForP159LiveCycleAsync,
} from "@/lib/p179-operator-controlled-send-gate-profile";
import {
  resolveSendQueueForGateProfile,
  type OperatorSendQueueScope,
} from "@/lib/p181-scoped-operator-paperwork-queue";

export async function executeP159OperationsControl(input: {
  session: AuthSession;
  action: P159ControlAction;
  confirmLive?: boolean;
  candidateIds?: string[];
  sendQueueScope?: OperatorSendQueueScope;
}): Promise<P159ControlResult> {
  const built = await buildP159OperationsControlCenter();
  const dashboard = built.dashboard;

  if (input.action === "refresh") {
    return {
      ok: true,
      action: input.action,
      message: "Operations control center refreshed.",
      dryRun: true,
      dashboard,
    };
  }

  if (input.action === "pause") {
    await pauseContinuousAutonomousRecruitingRunner();
    const autopilot = await loadAutopilotState();
    await saveAutopilotState({
      ...autopilot,
      paused: true,
      autopilotStatus: "paused",
      pausedReason: "Paused from P159 operations control center.",
    });
    return {
      ok: true,
      action: input.action,
      message: "Runner paused. Continuous daemon will not schedule cycles until resumed.",
      dryRun: true,
      dashboard: (await buildP159OperationsControlCenter()).dashboard,
    };
  }

  if (input.action === "resume") {
    await resumeContinuousAutonomousRecruitingRunner();
    const autopilot = await loadAutopilotState();
    await saveAutopilotState({
      ...autopilot,
      paused: false,
      autopilotStatus: isP154ControlledProductionAutopilotEnabled() ? "active" : "stopped",
      pausedReason: null,
    });
    return {
      ok: true,
      action: input.action,
      message: isP154ContinuousEnabled()
        ? "Runner resumed. Daemon still requires host process p154.7-continuous-runner --daemon."
        : "Runner state resumed. Continuous mode remains disabled on host.",
      dryRun: true,
      dashboard: (await buildP159OperationsControlCenter()).dashboard,
    };
  }

  if (input.action === "emergency_stop") {
    await Promise.all([stopP1547Runner(), stopP1544ContinuousProcessing()]);
    const autopilot = await loadAutopilotState();
    await saveAutopilotState({
      ...autopilot,
      paused: true,
      autopilotStatus: "paused",
      pausedReason: "Emergency stop from P159 operations control center.",
    });
    return {
      ok: true,
      action: input.action,
      message:
        "Emergency stop complete — runner stopped, locks cleared, autopilot paused. Continuous mode was not enabled.",
      dryRun: true,
      dashboard: (await buildP159OperationsControlCenter()).dashboard,
    };
  }

  const enabled = isP154ControlledProductionAutopilotEnabled();
  const dryRun = input.action === "dry_cycle" || !enabled || input.confirmLive !== true;
  const maxSends = getP154MaxPaperworkSendsPerCycle();

  const gateProfile =
    input.action === "live_cycle"
      ? await resolveGateProfileForP159LiveCycleAsync({
          confirmLive: input.confirmLive,
          sessionRole: input.session.role,
        })
      : "autonomous";

  const p169Config = resolveP169EnvConfig();
  const cycleGates =
    input.action === "live_cycle"
      ? await evaluateSendCycleGates({
          profile: gateProfile,
          readinessThreshold: p169Config.readinessThreshold,
        })
      : null;

  if (input.action === "live_cycle" && !input.confirmLive) {
    return {
      ok: false,
      action: input.action,
      message: `Live cycle requires confirmLive: true. Capped at ${maxSends} paperwork sends per cycle.`,
      dryRun: true,
      dashboard,
    };
  }

  if (input.action === "live_cycle" && cycleGates && !cycleGates.pass) {
    return {
      ok: false,
      action: input.action,
      message: `Live cycle blocked (${gateProfile} profile) — ${cycleGates.blockingFactors.join("; ")}`,
      dryRun: true,
      dashboard,
    };
  }

  if (input.action === "live_cycle" && !enabled && gateProfile === "autonomous") {
    return {
      ok: false,
      action: input.action,
      message: `Live cycle blocked — set ${dashboard.liveCycleGates.envFlagRequired}=true on the server. Send cap: ${maxSends}/cycle.`,
      dryRun: true,
      dashboard,
    };
  }

  const sendQueue = resolveSendQueueForGateProfile({
    gateProfile,
    candidateIds: input.candidateIds,
    sendQueueScope: input.sendQueueScope,
  });

  const cycleReport = await runAutonomousRecruitingCycle({
    session: input.session,
    dryRun,
    mode: "manual",
    userId: input.session.userId,
    sendQueue,
  });

  return {
    ok: cycleReport.error === null && cycleReport.metrics.errors === 0,
    action: input.action,
    message: dryRun
      ? `Dry cycle complete — evaluated ${cycleReport.metrics.candidatesEvaluated}, sent ${cycleReport.metrics.sent}.`
      : `Live cycle complete — sent ${cycleReport.metrics.sent} (cap ${maxSends}).`,
    dryRun,
    dashboard: (await buildP159OperationsControlCenter()).dashboard,
    cycleReport,
  };
}
