import { isP154ContinuousEnabled } from "@/lib/p154-continuous-autonomous-recruiting-runner/runner-config";
import { gatherP167SchedulerContext } from "@/lib/p167-intelligent-production-scheduler/gather-scheduler-context";
import type { SendGateProfile } from "@/lib/p179-operator-controlled-send-gate-profile/types";

export function resolveGateProfileForP159LiveCycle(input: {
  confirmLive?: boolean;
  sessionRole: string;
  continuousModeEnabled?: boolean;
  daemonActive?: boolean;
}): SendGateProfile {
  const continuous =
    input.continuousModeEnabled ?? isP154ContinuousEnabled();
  const isExecutiveOrOperator =
    input.sessionRole === "executive" || input.sessionRole === "operator";

  if (
    input.confirmLive === true &&
    isExecutiveOrOperator &&
    !continuous &&
    input.daemonActive !== true
  ) {
    return "operator";
  }

  return "autonomous";
}

export async function resolveGateProfileForP159LiveCycleAsync(input: {
  confirmLive?: boolean;
  sessionRole: string;
}): Promise<SendGateProfile> {
  const ctx = await gatherP167SchedulerContext();
  return resolveGateProfileForP159LiveCycle({
    confirmLive: input.confirmLive,
    sessionRole: input.sessionRole,
    continuousModeEnabled: ctx.continuousModeEnabled,
    daemonActive: ctx.daemonActive,
  });
}
