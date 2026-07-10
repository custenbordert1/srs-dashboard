import { loadPaperworkAutomationAuditLog } from "@/lib/p145-controlled-paperwork-automation/paperwork-automation-audit-store";
import { getCandidateWorkflowBundle } from "@/lib/candidate-workflow-store";
import { loadP1547RunnerState } from "@/lib/p154-continuous-autonomous-recruiting-runner/runner-store";
import type { P1547AutopilotStatusResponse } from "@/lib/p154-continuous-autonomous-recruiting-runner/types";

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

async function countSignedToday(): Promise<number> {
  const bundle = await getCandidateWorkflowBundle();
  const start = Date.parse(`${todayKey()}T00:00:00.000Z`);
  return Object.values(bundle.workflows).filter(
    (r) =>
      r.paperworkStatus === "signed" &&
      r.paperworkSignedAt &&
      Date.parse(r.paperworkSignedAt) >= start,
  ).length;
}

async function countSentTodayFromAudit(): Promise<number> {
  const audit = await loadPaperworkAutomationAuditLog();
  const start = Date.parse(`${todayKey()}T00:00:00.000Z`);
  return audit.filter(
    (e) => e.sendResult === "sent" && e.executed === true && Date.parse(e.at) >= start,
  ).length;
}

export async function buildP1547AutopilotStatus(): Promise<P1547AutopilotStatusResponse> {
  const state = await loadP1547RunnerState();
  const lastCycle = state.recentCycles[0] ?? null;
  const uptimeMs =
    state.serverStartTime === null ? null : Date.now() - Date.parse(state.serverStartTime);
  const todaysSends = Math.max(state.dailyMetrics.sent, await countSentTodayFromAudit());
  const todaysSignatures = Math.max(state.dailyMetrics.signaturesCompleted, await countSignedToday());

  return {
    ok: state.currentStatus !== "error",
    runnerStatus: state.currentStatus,
    continuousEnabled: state.continuousEnabled,
    lastCycle,
    nextCycleAt: state.nextRun,
    currentQueue: state.queueRemaining,
    todaysSends,
    todaysSignatures,
    errors: state.errors,
    uptimeMs,
    serverStartTime: state.serverStartTime,
    state,
  };
}
