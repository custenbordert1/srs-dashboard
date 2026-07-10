import type {
  P185CycleSummary,
  P185MetricsSnapshot,
  P185RunnerStateFile,
} from "@/lib/p185-production-paperwork-automation-runner/types";
import { emptyP185Metrics } from "@/lib/p185-production-paperwork-automation-runner/types";

export function buildP185Metrics(input: {
  state: P185RunnerStateFile;
  cycle?: Partial<P185CycleSummary> | null;
  remainingBudgetMs?: number | null;
  queueDepth?: number;
  retriesDue?: number;
}): P185MetricsSnapshot {
  const base = emptyP185Metrics();
  const unresolved = input.state.envelopes.filter(
    (e) => e.state === "sent_unverified" || e.state === "send_requested" || e.state === "unknown",
  ).length;
  return {
    ...base,
    ...input.state.metrics,
    queueDepth: input.queueDepth ?? input.state.metrics.queueDepth,
    candidatesEvaluated: input.cycle?.evaluated ?? input.state.metrics.candidatesEvaluated,
    eligibleCandidates: input.cycle?.eligible ?? input.state.metrics.eligibleCandidates,
    sendsAttempted: input.cycle?.sent ?? input.state.metrics.sendsAttempted,
    sendsConfirmed: input.cycle?.confirmed ?? input.state.metrics.sendsConfirmed,
    sendsFailed: input.cycle?.failed ?? input.state.metrics.sendsFailed,
    unresolvedEnvelopes: unresolved,
    retriesDue: input.retriesDue ?? input.state.metrics.retriesDue,
    cycleDurationMs: input.cycle?.durationMs ?? input.state.metrics.cycleDurationMs,
    remainingExecutionBudgetMs:
      input.remainingBudgetMs ?? input.state.metrics.remainingExecutionBudgetMs,
  };
}

export function todayConfirmedCount(state: P185RunnerStateFile, nowMs: number): number {
  const dayStart = Date.UTC(
    new Date(nowMs).getUTCFullYear(),
    new Date(nowMs).getUTCMonth(),
    new Date(nowMs).getUTCDate(),
  );
  return state.envelopes.filter(
    (e) =>
      (e.state === "confirmed_sent" || e.state === "viewed" || e.state === "signed") &&
      e.verifiedAt &&
      Date.parse(e.verifiedAt) >= dayStart,
  ).length;
}

export function todayFailedCount(state: P185RunnerStateFile, nowMs: number): number {
  const dayStart = Date.UTC(
    new Date(nowMs).getUTCFullYear(),
    new Date(nowMs).getUTCMonth(),
    new Date(nowMs).getUTCDate(),
  );
  return state.envelopes.filter(
    (e) => e.state === "failed" && Date.parse(e.updatedAt) >= dayStart,
  ).length;
}

export function todaySentUnverifiedCount(state: P185RunnerStateFile, nowMs: number): number {
  const dayStart = Date.UTC(
    new Date(nowMs).getUTCFullYear(),
    new Date(nowMs).getUTCMonth(),
    new Date(nowMs).getUTCDate(),
  );
  return state.envelopes.filter(
    (e) =>
      (e.state === "sent_unverified" || e.state === "confirmed_sent") &&
      Date.parse(e.createdAt) >= dayStart,
  ).length;
}
