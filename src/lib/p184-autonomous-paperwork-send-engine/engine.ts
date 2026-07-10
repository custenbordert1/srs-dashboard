import type { BreezyJob } from "@/lib/breezy-api";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import { appendP184AuditEvent } from "@/lib/p184-autonomous-paperwork-send-engine/audit";
import { evaluateP184Eligibility } from "@/lib/p184-autonomous-paperwork-send-engine/evaluator";
import {
  canAcquireSendSlot,
  evaluateP184RateLimit,
} from "@/lib/p184-autonomous-paperwork-send-engine/rateLimiter";
import { buildP184ValidationReport } from "@/lib/p184-autonomous-paperwork-send-engine/report";
import { sendP184Paperwork, type P184SenderDeps } from "@/lib/p184-autonomous-paperwork-send-engine/sender";
import {
  loadP184EngineState,
  saveP184EngineState,
} from "@/lib/p184-autonomous-paperwork-send-engine/store";
import type {
  P184CycleResult,
  P184DashboardMetrics,
  P184EngineConfig,
  P184EngineMode,
  P184QueueItem,
  P184QueuePriority,
  P184SendResult,
} from "@/lib/p184-autonomous-paperwork-send-engine/types";
import { P184_RETRY_BACKOFF_MS } from "@/lib/p184-autonomous-paperwork-send-engine/types";
import type { P184VerifiedOnboardingJob } from "@/lib/p184-autonomous-paperwork-send-engine/evaluator";

function applicationAgeMs(row: ScoredCandidateWorkflowRow, nowMs: number): number {
  const applied = row.appliedDate || row.createdDate || row.addedDate || row.updatedDate;
  if (!applied) return 0;
  const ms = Date.parse(applied);
  return Number.isFinite(ms) ? Math.max(0, nowMs - ms) : 0;
}

function candidateDisplayName(row: ScoredCandidateWorkflowRow): string {
  const full = `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim();
  return full || row.email || row.candidateId;
}

export function computeP184Priority(input: {
  row: ScoredCandidateWorkflowRow;
  config: P184EngineConfig;
  nowMs?: number;
}): P184QueuePriority {
  const nowMs = input.nowMs ?? Date.now();
  const ageMs = applicationAgeMs(input.row, nowMs);
  const agingScore = Math.min(100, Math.round(ageMs / (24 * 60 * 60 * 1000)));
  const positionId = input.row.positionId?.trim() ?? "";
  const demandScore = input.config.highDemandPositionIds.includes(positionId) ? 40 : 0;
  const executivePriority = input.config.executivePriorityJobIds.includes(positionId) ? 50 : 0;
  const composite = agingScore * 2 + demandScore + executivePriority + Math.min(30, Math.round(ageMs / (12 * 60 * 60 * 1000)));
  return {
    agingScore,
    demandScore,
    applicationAgeMs: ageMs,
    executivePriority,
    composite,
  };
}

export function sortP184Queue(items: P184QueueItem[]): P184QueueItem[] {
  return [...items].sort((a, b) => {
    if (b.priority.composite !== a.priority.composite) {
      return b.priority.composite - a.priority.composite;
    }
    if (b.priority.agingScore !== a.priority.agingScore) {
      return b.priority.agingScore - a.priority.agingScore;
    }
    if (b.priority.demandScore !== a.priority.demandScore) {
      return b.priority.demandScore - a.priority.demandScore;
    }
    if (b.priority.applicationAgeMs !== a.priority.applicationAgeMs) {
      return b.priority.applicationAgeMs - a.priority.applicationAgeMs;
    }
    if (b.priority.executivePriority !== a.priority.executivePriority) {
      return b.priority.executivePriority - a.priority.executivePriority;
    }
    return a.enqueuedAt.localeCompare(b.enqueuedAt);
  });
}

function nextRetryAt(retryCount: number, nowMs: number): string | null {
  const delay = P184_RETRY_BACKOFF_MS[Math.min(retryCount, P184_RETRY_BACKOFF_MS.length - 1)];
  if (delay == null) return null;
  return new Date(nowMs + delay).toISOString();
}

function startOfUtcDay(nowMs: number): number {
  const d = new Date(nowMs);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function buildP184DashboardMetrics(input: {
  config: P184EngineConfig;
  queue: P184QueueItem[];
  sendTimestamps: string[];
  eligibleNow: number;
  nowMs?: number;
}): P184DashboardMetrics {
  const nowMs = input.nowMs ?? Date.now();
  const dayStart = startOfUtcDay(nowMs);
  const queued = input.queue.filter((q) => q.status === "queued" || q.status === "failed_transient").length;
  const sending = input.queue.filter((q) => q.status === "sending").length;
  const completedToday = input.queue.filter(
    (q) => q.status === "sent" && q.sentAt && Date.parse(q.sentAt) >= dayStart,
  ).length;
  const failedToday = input.queue.filter(
    (q) =>
      (q.status === "failed_transient" || q.status === "failed_permanent") &&
      Date.parse(q.updatedAt) >= dayStart,
  ).length;
  const retries = input.queue.reduce((sum, q) => sum + q.retryCount, 0);
  const sentDurations = input.queue
    .filter((q) => q.status === "sent" && typeof q.durationMs === "number")
    .map((q) => q.durationMs!);
  const averageSendTimeMs =
    sentDurations.length > 0
      ? Math.round(sentDurations.reduce((a, b) => a + b, 0) / sentDurations.length)
      : null;
  const sentTotal = input.queue.filter((q) => q.status === "sent").length;
  const failedTotal = input.queue.filter(
    (q) => q.status === "failed_transient" || q.status === "failed_permanent",
  ).length;
  const denom = sentTotal + failedTotal;
  const successPct = denom === 0 ? 100 : Math.round((sentTotal / denom) * 100);
  const rateLimitStatus = evaluateP184RateLimit({
    config: input.config.rateLimits,
    sendTimestamps: input.sendTimestamps,
    inFlight: sending,
    nowMs,
  });

  return {
    eligibleNow: input.eligibleNow,
    queued,
    sending,
    completedToday,
    failedToday,
    retries,
    rateLimitStatus,
    averageSendTimeMs,
    successPct,
    queueDepth: queued + sending,
    mode: input.config.mode,
    enabled: input.config.enabled,
  };
}

export async function runP184AutonomousPaperworkSendEngine(input: {
  candidates: ScoredCandidateWorkflowRow[];
  onboardingByCandidateId: Map<string, CandidateOnboardingRecord>;
  jobsByPositionId: Map<string, BreezyJob>;
  mode?: P184EngineMode;
  maxSends?: number;
  byUserId?: string;
  deps?: P184SenderDeps;
  nowMs?: number;
  /** Optional P185.1 per-candidate verified onboarding job overrides. */
  verifiedOnboardingJobByCandidateId?: Map<string, P184VerifiedOnboardingJob>;
}): Promise<P184CycleResult> {
  const started = Date.now();
  const nowMs = input.nowMs ?? started;
  const nowIso = new Date(nowMs).toISOString();
  const state = await loadP184EngineState();
  const mode = input.mode ?? state.config.mode;
  const config: P184EngineConfig = { ...state.config, mode };
  const completedKeys = new Set(state.completedIdempotencyKeys);
  const results: P184SendResult[] = [];

  const eligibleRows: Array<{
    row: ScoredCandidateWorkflowRow;
    eligibility: ReturnType<typeof evaluateP184Eligibility>;
    priority: P184QueuePriority;
  }> = [];
  const rejected: P184CycleResult["report"]["rejected"] = [];

  for (const row of input.candidates) {
    const eligibility = evaluateP184Eligibility({
      row,
      onboarding: input.onboardingByCandidateId.get(row.candidateId) ?? null,
      job: row.positionId ? input.jobsByPositionId.get(row.positionId) : null,
      config,
      queueItems: state.queue,
      completedIdempotencyKeys: completedKeys,
      nowMs,
      verifiedOnboardingJob: input.verifiedOnboardingJobByCandidateId?.get(row.candidateId) ?? null,
    });

    if (!eligibility.eligible) {
      rejected.push({
        candidateId: row.candidateId,
        candidateName: candidateDisplayName(row),
        reasons: eligibility.rejectionReasons,
      });
      await appendP184AuditEvent({
        candidateId: row.candidateId,
        candidateName: candidateDisplayName(row),
        jobId: row.positionId ?? null,
        jobName: row.positionId ? input.jobsByPositionId.get(row.positionId)?.name ?? null : null,
        templateKey: eligibility.templateKey,
        envelopeId: null,
        status: "rejected",
        latencyMs: null,
        failureReason: eligibility.rejectionReasons.join("; "),
        retryCount: 0,
        mode,
        idempotencyKey: eligibility.idempotencyKey,
        simulated: mode === "dry_run",
      });
      continue;
    }

    eligibleRows.push({
      row,
      eligibility,
      priority: computeP184Priority({ row, config, nowMs }),
    });
  }

  eligibleRows.sort((a, b) => b.priority.composite - a.priority.composite);

  const queueItems: P184QueueItem[] = eligibleRows.map(({ row, eligibility, priority }) => {
    const existing = state.queue.find((q) => q.candidateId === row.candidateId);
    return {
      candidateId: row.candidateId,
      candidateName: candidateDisplayName(row),
      candidateEmail: (row.email ?? row.onboardingContactEmail ?? "").trim().toLowerCase(),
      positionId: row.positionId ?? null,
      jobName: row.positionId ? input.jobsByPositionId.get(row.positionId)?.name ?? null : null,
      templateKey: eligibility.templateKey!,
      idempotencyKey: eligibility.idempotencyKey,
      status: existing?.status === "failed_transient" ? "queued" : "queued",
      priority,
      enqueuedAt: existing?.enqueuedAt ?? nowIso,
      updatedAt: nowIso,
      retryCount: existing?.retryCount ?? 0,
      nextAttemptAt: existing?.nextAttemptAt ?? nowIso,
      lastError: null,
      permanentFailure: false,
      envelopeId: existing?.envelopeId ?? null,
      sentAt: existing?.sentAt ?? null,
      durationMs: existing?.durationMs ?? null,
    };
  });

  // Preserve non-eligible historical queue items (sent/failed) for metrics + restart survival.
  const eligibleIds = new Set(queueItems.map((q) => q.candidateId));
  const retained = state.queue.filter(
    (q) =>
      !eligibleIds.has(q.candidateId) &&
      (q.status === "sent" ||
        q.status === "failed_permanent" ||
        q.status === "failed_transient" ||
        q.status === "sending"),
  );
  state.queue = sortP184Queue([...retained, ...queueItems]);
  await saveP184EngineState(state);

  const report = buildP184ValidationReport({
    mode,
    candidates: input.candidates,
    eligible: eligibleRows.map(({ row, eligibility, priority }) => ({
      candidateId: row.candidateId,
      candidateName: candidateDisplayName(row),
      priority,
      idempotencyKey: eligibility.idempotencyKey,
    })),
    rejected,
    queueOrder: sortP184Queue(queueItems).map((q) => q.candidateId),
    rateLimitStatus: evaluateP184RateLimit({
      config: config.rateLimits,
      sendTimestamps: state.sendTimestamps,
      inFlight: state.queue.filter((q) => q.status === "sending").length,
      nowMs,
    }),
    maxSendsPerCycle: input.maxSends ?? config.maxSendsPerCycle,
  });

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let retriesScheduled = 0;
  let rateLimited = false;
  const maxSends = input.maxSends ?? config.maxSendsPerCycle;

  if (!config.enabled && mode === "live") {
    const metrics = buildP184DashboardMetrics({
      config,
      queue: state.queue,
      sendTimestamps: state.sendTimestamps,
      eligibleNow: eligibleRows.length,
      nowMs,
    });
    return {
      mode,
      evaluated: input.candidates.length,
      eligible: eligibleRows.length,
      queued: queueItems.length,
      sent: 0,
      failed: 0,
      skipped: eligibleRows.length,
      retriesScheduled: 0,
      rateLimited: false,
      durationMs: Date.now() - started,
      results: [],
      report: {
        ...report,
        warnings: [
          ...report.warnings,
          "Engine disabled — live sends blocked. Enable via config or use dry_run.",
        ],
      },
      metrics,
    };
  }

  const readyToSend = sortP184Queue(
    state.queue.filter((q) => {
      if (q.status !== "queued" && q.status !== "failed_transient") return false;
      if (q.nextAttemptAt && Date.parse(q.nextAttemptAt) > nowMs) return false;
      return true;
    }),
  );

  for (const item of readyToSend) {
    if (sent + failed >= maxSends) break;

    const rateStatus = evaluateP184RateLimit({
      config: config.rateLimits,
      sendTimestamps: state.sendTimestamps,
      inFlight: state.queue.filter((q) => q.status === "sending").length,
      nowMs: Date.now(),
    });
    if (!canAcquireSendSlot(rateStatus)) {
      rateLimited = true;
      await appendP184AuditEvent({
        candidateId: item.candidateId,
        candidateName: item.candidateName,
        jobId: item.positionId,
        jobName: item.jobName,
        templateKey: item.templateKey,
        envelopeId: null,
        status: "rate_limited",
        latencyMs: null,
        failureReason: `Rate limited: ${rateStatus.limitedBy.join(", ")}`,
        retryCount: item.retryCount,
        mode,
        idempotencyKey: item.idempotencyKey,
        simulated: mode === "dry_run",
      });
      skipped += 1;
      continue;
    }

    if (completedKeys.has(item.idempotencyKey)) {
      skipped += 1;
      continue;
    }

    item.status = "sending";
    item.updatedAt = new Date().toISOString();
    await saveP184EngineState(state);

    const sendResult = await sendP184Paperwork({
      item,
      mode,
      byUserId: input.byUserId,
      deps: input.deps,
    });
    results.push(sendResult);

    const idx = state.queue.findIndex((q) => q.candidateId === item.candidateId);
    const target = idx >= 0 ? state.queue[idx]! : item;

    if (sendResult.ok) {
      target.status = "sent";
      target.envelopeId = sendResult.envelopeId;
      target.sentAt = sendResult.sentAt;
      target.durationMs = sendResult.durationMs;
      target.lastError = null;
      target.updatedAt = new Date().toISOString();
      state.sendTimestamps.push(sendResult.sentAt ?? new Date().toISOString());
      if (!state.completedIdempotencyKeys.includes(item.idempotencyKey)) {
        state.completedIdempotencyKeys.push(item.idempotencyKey);
      }
      completedKeys.add(item.idempotencyKey);
      sent += 1;
    } else if (sendResult.transient && target.retryCount < config.maxRetries) {
      target.status = "failed_transient";
      target.retryCount += 1;
      target.nextAttemptAt = nextRetryAt(target.retryCount - 1, Date.now());
      target.lastError = sendResult.error;
      target.permanentFailure = false;
      target.updatedAt = new Date().toISOString();
      sendResult.retryScheduled = true;
      retriesScheduled += 1;
      failed += 1;
    } else {
      target.status = "failed_permanent";
      target.permanentFailure = true;
      target.lastError = sendResult.error;
      target.updatedAt = new Date().toISOString();
      failed += 1;
    }

    if (idx < 0) state.queue.push(target);
    await saveP184EngineState(state);

    await appendP184AuditEvent({
      candidateId: item.candidateId,
      candidateName: item.candidateName,
      jobId: item.positionId,
      jobName: item.jobName,
      templateKey: item.templateKey,
      envelopeId: sendResult.envelopeId,
      status: target.status,
      latencyMs: sendResult.durationMs,
      failureReason: sendResult.error,
      retryCount: target.retryCount,
      mode,
      idempotencyKey: item.idempotencyKey,
      simulated: sendResult.simulated,
    });
  }

  const metrics = buildP184DashboardMetrics({
    config,
    queue: state.queue,
    sendTimestamps: state.sendTimestamps,
    eligibleNow: eligibleRows.length,
    nowMs: Date.now(),
  });

  return {
    mode,
    evaluated: input.candidates.length,
    eligible: eligibleRows.length,
    queued: queueItems.length,
    sent,
    failed,
    skipped,
    retriesScheduled,
    rateLimited,
    durationMs: Date.now() - started,
    results,
    report,
    metrics,
  };
}
