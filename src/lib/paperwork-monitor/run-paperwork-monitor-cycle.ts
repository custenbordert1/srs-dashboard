import { buildPaperworkMonitorReport } from "@/lib/paperwork-monitor/build-paperwork-monitor-report";
import {
  appendMonitorAudit,
  loadMonitorState,
  releaseMonitorLock,
  saveMonitorState,
  tryAcquireMonitorLock,
} from "@/lib/paperwork-monitor/monitor-store";
import { reconcilePaperworkCandidate } from "@/lib/paperwork-monitor/reconcile-paperwork-candidate";
import { applyReminderToState, evaluateReminders } from "@/lib/paperwork-monitor/reminder-engine";
import { selectActivePaperworkPackets } from "@/lib/paperwork-monitor/select-active-packets";
import {
  P107_DEFAULT_MODE,
  type PaperworkMonitorCycleResult,
  type PaperworkMonitorMode,
} from "@/lib/paperwork-monitor/types";

export async function runPaperworkMonitorCycle(input?: {
  mode?: PaperworkMonitorMode;
  candidateIds?: string[];
  byUserId?: string;
}): Promise<PaperworkMonitorCycleResult> {
  const mode = input?.mode ?? P107_DEFAULT_MODE;
  const dryRun = mode === "dryRun";
  const warnings: string[] = [
    "P107 — Dropbox Sign live poll; no paperwork resend.",
    dryRun ? "dryRun — no state writes." : "Live sync — workflow and onboarding updated.",
    "Reminders queued only — not sent automatically.",
  ];

  const lock = await tryAcquireMonitorLock({ mode });
  if (!lock.acquired) {
    const state = await loadMonitorState();
    return {
      ok: true,
      skippedOverlap: true,
      mode,
      report: buildPaperworkMonitorReport({
        mode,
        state,
        candidates: [],
        syncedThisCycle: 0,
        errorsThisCycle: 0,
        overlapPrevented: true,
      }),
      warnings: [...warnings, "Skipped — previous monitor run still executing."],
    };
  }

  const started = Date.now();
  let success = true;
  let error: string | null = null;
  let syncedThisCycle = 0;
  let errorsThisCycle = 0;
  const candidates: import("@/lib/paperwork-monitor/types").PaperworkMonitorCandidateResult[] = [];

  try {
    let state = await loadMonitorState();
    const packets = await selectActivePaperworkPackets({ candidateIds: input?.candidateIds });

    for (const packet of packets) {
      const existing = state.candidateTracking[packet.candidateId] ?? null;
      const { result, tracking } = await reconcilePaperworkCandidate({
        packet,
        existingTracking: existing,
        dryRun,
        byUserId: input?.byUserId ?? "p107-monitor",
      });

      if (result.error) errorsThisCycle += 1;
      if (result.synced) syncedThisCycle += 1;

      let updatedTracking = tracking;
      if (!dryRun) {
        state.candidateTracking = { ...state.candidateTracking, [packet.candidateId]: tracking };

        const reminder = evaluateReminders({ tracking });
        if (reminder) {
          state = applyReminderToState({ state, tracking, reminder });
          updatedTracking = state.candidateTracking[packet.candidateId] ?? tracking;
          result.reminderGenerated = reminder.channel;
          timelinePush(result, "Reminder Generated");
          await appendMonitorAudit({
            action: "reminder_queued",
            candidateId: packet.candidateId,
            channel: reminder.channel,
            reason: reminder.reason,
          });
        }
      }

      candidates.push({ ...result, timeline: result.timeline });
      void updatedTracking;
    }

    if (!dryRun) {
      await saveMonitorState(state);
    }

    const durationMs = Date.now() - started;
    const finalState = await releaseMonitorLock({
      runId: lock.runId,
      success,
      error,
      durationMs,
    });

    await appendMonitorAudit({
      action: "cycle_complete",
      mode,
      runId: lock.runId,
      packetCount: packets.length,
      syncedThisCycle,
      errorsThisCycle,
      durationMs,
    });

    return {
      ok: success,
      skippedOverlap: false,
      mode,
      report: buildPaperworkMonitorReport({
        mode,
        state: dryRun ? state : finalState,
        candidates,
        syncedThisCycle,
        errorsThisCycle,
      }),
      warnings,
    };
  } catch (caught) {
    success = false;
    error = caught instanceof Error ? caught.message : String(caught);
    const durationMs = Date.now() - started;
    const finalState = await releaseMonitorLock({
      runId: lock.runId,
      success: false,
      error,
      durationMs,
    });
    await appendMonitorAudit({ action: "cycle_failed", mode, error, durationMs });
    return {
      ok: false,
      skippedOverlap: false,
      mode,
      report: buildPaperworkMonitorReport({
        mode,
        state: finalState,
        candidates,
        syncedThisCycle,
        errorsThisCycle,
      }),
      warnings: [...warnings, error],
    };
  }
}

function timelinePush(
  result: import("@/lib/paperwork-monitor/types").PaperworkMonitorCandidateResult,
  step: string,
): void {
  if (!result.timeline.includes(step)) result.timeline.push(step);
}

export async function startPaperworkMonitor(input?: { intervalMs?: number }) {
  const state = await loadMonitorState();
  state.scheduleEnabled = true;
  state.runnerStatus = "idle";
  if (input?.intervalMs) state.scheduleIntervalMs = input.intervalMs;
  await saveMonitorState(state);
  await appendMonitorAudit({ action: "start", intervalMs: state.scheduleIntervalMs });
  return state;
}

export async function stopPaperworkMonitor() {
  const state = await loadMonitorState();
  state.scheduleEnabled = false;
  state.runnerStatus = state.processingLock ? "running" : "stopped";
  await saveMonitorState(state);
  await appendMonitorAudit({ action: "stop" });
  return state;
}

export async function buildPaperworkMonitorSnapshot() {
  const state = await loadMonitorState();
  const packets = await selectActivePaperworkPackets();
  return buildPaperworkMonitorReport({
    state,
    candidates: packets.map((p) => ({
      candidateId: p.candidateId,
      candidateName: p.candidateName,
      signatureRequestId: p.signatureRequestId,
      dropboxStatus: state.candidateTracking[p.candidateId]?.lastDropboxStatus ?? "awaiting_signature",
      paperworkStatus: p.workflow.paperworkStatus,
      workflowStatus: p.workflow.workflowStatus,
      onboardingStatus: p.onboarding?.status ?? null,
      viewedAt: p.workflow.paperworkViewedAt,
      signedAt: p.workflow.paperworkSignedAt,
      synced: false,
      stateChanged: false,
      reminderGenerated: null,
      error: null,
      timeline: ["Paperwork Sent"],
    })),
    syncedThisCycle: 0,
    errorsThisCycle: 0,
  });
}
