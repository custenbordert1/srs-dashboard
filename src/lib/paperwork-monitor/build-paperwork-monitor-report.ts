import type {
  PaperworkMonitorCandidateResult,
  PaperworkMonitorMetrics,
  PaperworkMonitorMode,
  PaperworkMonitorReport,
  PaperworkMonitorState,
} from "@/lib/paperwork-monitor/types";
import { P107_DEFAULT_MODE, P107_SOURCE_PHASE } from "@/lib/paperwork-monitor/types";
import { monitorAuditPath, monitorStatePath } from "@/lib/paperwork-monitor/monitor-store";

function startOfTodayMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function buildPaperworkMonitorMetrics(input: {
  candidates: PaperworkMonitorCandidateResult[];
  state: PaperworkMonitorState;
  syncedThisCycle: number;
  errorsThisCycle: number;
  deferredThisCycle?: number;
  projectedGetRequests?: number;
  budgetLimit?: number;
}): PaperworkMonitorMetrics {
  const todayStart = startOfTodayMs();
  const tracking = Object.values(input.state.candidateTracking);

  const sentMs: number[] = [];
  const viewMs: number[] = [];
  const signMs: number[] = [];
  const viewToSignMs: number[] = [];

  for (const t of tracking) {
    if (t.viewedAt && t.signedAt) {
      const v = Date.parse(t.viewedAt);
      const s = Date.parse(t.signedAt);
      if (Number.isFinite(v) && Number.isFinite(s) && s >= v) viewToSignMs.push(s - v);
    }
  }

  const awaiting = input.candidates.filter((c) => c.dropboxStatus === "awaiting_signature").length;
  const viewed = input.candidates.filter((c) => c.dropboxStatus === "viewed").length;
  const signedToday = input.candidates.filter(
    (c) => c.signedAt && Date.parse(c.signedAt) >= todayStart,
  ).length;
  const completed = tracking.filter((t) => t.onboardingStatus === "ready_for_mel" || t.onboardingStatus === "completed").length;
  const readyForOnboarding = tracking.filter(
    (t) => t.workflowStatus === "Signed" || t.onboardingStatus === "completed",
  ).length;

  const avg = (arr: number[]) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null);

  const totalWithOutcome = tracking.filter((t) => t.signedAt || t.lastDropboxStatus === "declined").length;
  const signedCount = tracking.filter((t) => t.signedAt).length;
  const completionRate = totalWithOutcome > 0 ? Math.round((signedCount / tracking.length) * 100) / 100 : null;

  return {
    awaitingSignature: awaiting,
    viewed,
    signedToday,
    completed,
    expired: input.candidates.filter((c) => c.dropboxStatus === "expired").length,
    declined: input.candidates.filter((c) => c.dropboxStatus === "declined").length,
    needsReminder: input.state.textQueue.length + input.state.emailQueue.length,
    needsRecruiter: input.state.recruiterQueue.length,
    readyForOnboarding,
    averageTimeToViewMs: avg(viewMs),
    averageTimeToSignMs: avg(signMs),
    averageViewToSignMs: avg(viewToSignMs),
    completionRate,
    textQueueCount: input.state.textQueue.length,
    emailQueueCount: input.state.emailQueue.length,
    recruiterQueueCount: input.state.recruiterQueue.length,
    needsAttentionCount: input.state.needsAttention.length,
    activePackets: input.candidates.length,
    syncedThisCycle: input.syncedThisCycle,
    errorsThisCycle: input.errorsThisCycle,
    deferredThisCycle: input.deferredThisCycle ?? input.state.deferredReconciliationQueue?.length ?? 0,
    projectedGetRequests: input.projectedGetRequests ?? 0,
    budgetLimit: input.budgetLimit ?? 0,
  };
}

export function buildPaperworkMonitorReport(input: {
  mode?: PaperworkMonitorMode;
  state: PaperworkMonitorState;
  candidates: PaperworkMonitorCandidateResult[];
  syncedThisCycle: number;
  errorsThisCycle: number;
  deferredThisCycle?: number;
  projectedGetRequests?: number;
  budgetLimit?: number;
  overlapPrevented?: boolean;
}): PaperworkMonitorReport {
  const mode = input.mode ?? P107_DEFAULT_MODE;
  const metrics = buildPaperworkMonitorMetrics({
    candidates: input.candidates,
    state: input.state,
    syncedThisCycle: input.syncedThisCycle,
    errorsThisCycle: input.errorsThisCycle,
    deferredThisCycle: input.deferredThisCycle,
    projectedGetRequests: input.projectedGetRequests,
    budgetLimit: input.budgetLimit,
  });

  const nextScheduledRunAt =
    input.state.scheduleEnabled && input.state.lastSuccessfulRunAt
      ? new Date(Date.parse(input.state.lastSuccessfulRunAt) + input.state.scheduleIntervalMs).toISOString()
      : input.state.scheduleEnabled
        ? new Date(Date.now() + input.state.scheduleIntervalMs).toISOString()
        : null;

  return {
    sourcePhase: P107_SOURCE_PHASE,
    generatedAt: new Date().toISOString(),
    sectionTitle: "Paperwork Monitor",
    mode,
    state: input.state,
    metrics,
    candidates: input.candidates,
    artifactPaths: {
      monitorState: monitorStatePath(),
      monitorAudit: monitorAuditPath(),
      workflowAudit: ".data/candidate-workflow-audit.jsonl",
    },
    runnerHealth: {
      healthy: !input.state.lastError,
      overlapPrevented: input.overlapPrevented ?? false,
      lastError: input.state.lastError,
      averageRunTimeMs: input.state.averageRunDurationMs,
    },
    nextScheduledRunAt,
  };
}
