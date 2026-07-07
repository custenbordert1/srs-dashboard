import type { AuthSession } from "@/lib/auth/types";
import { loadAutopilotState, saveAutopilotState } from "@/lib/p154-controlled-production-autopilot-activation/autopilot-store";
import { isP154ControlledProductionAutopilotEnabled } from "@/lib/p154-controlled-production-autopilot-activation/execute-controlled-production-autopilot";
import {
  pauseContinuousAutonomousRecruitingRunner,
  resumeContinuousAutonomousRecruitingRunner,
} from "@/lib/p154-continuous-autonomous-recruiting-runner/continuous-runner-service";
import { runAutonomousRecruitingCycle } from "@/lib/p154-continuous-autonomous-recruiting-runner/run-autonomous-recruiting-cycle";
import { buildP155OperationsDashboard } from "@/lib/p155-autopilot-operations-dashboard/build-operations-dashboard";
import type { P155ControlAction, P155ControlResult } from "@/lib/p155-autopilot-operations-dashboard/types";

export async function executeP155AutopilotControl(input: {
  session: AuthSession;
  action: P155ControlAction;
  confirmLive?: boolean;
}): Promise<P155ControlResult> {
  const built = await buildP155OperationsDashboard();
  const dashboard = built.dashboard;

  if (input.action === "refresh") {
    return {
      ok: true,
      action: input.action,
      message: "Status refreshed.",
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
      pausedReason: "Paused from P155 operations dashboard.",
    });
    return {
      ok: true,
      action: input.action,
      message: "Autopilot paused. Continuous daemon will not run until resumed.",
      dryRun: true,
      dashboard: (await buildP155OperationsDashboard()).dashboard,
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
      message: "Autopilot resumed. State updated — continuous daemon still requires P154_CONTINUOUS_ENABLED=true on host.",
      dryRun: true,
      dashboard: (await buildP155OperationsDashboard()).dashboard,
    };
  }

  const enabled = isP154ControlledProductionAutopilotEnabled();
  const dryRun = input.action === "dry_cycle" || !enabled || input.confirmLive !== true;

  if (input.action === "live_cycle" && !enabled) {
    return {
      ok: false,
      action: input.action,
      message:
        "Live cycle blocked — set P154_CONTROLLED_PRODUCTION_AUTOPILOT_ENABLED=true on the server before running a capped live cycle.",
      dryRun: true,
      dashboard,
    };
  }

  if (input.action === "live_cycle" && !input.confirmLive) {
    return {
      ok: false,
      action: input.action,
      message: "Live cycle requires confirmLive: true in the request body.",
      dryRun: true,
      dashboard,
    };
  }

  const cycleReport = await runAutonomousRecruitingCycle({
    session: input.session,
    dryRun,
    mode: "manual",
    userId: input.session.userId,
  });

  return {
    ok: cycleReport.error === null && cycleReport.metrics.errors === 0,
    action: input.action,
    message: dryRun
      ? `Dry cycle complete — evaluated ${cycleReport.metrics.candidatesEvaluated}, sent ${cycleReport.metrics.sent}.`
      : `Live cycle complete — sent ${cycleReport.metrics.sent} (capped).`,
    dryRun,
    dashboard: (await buildP155OperationsDashboard()).dashboard,
    cycleReport,
  };
}
