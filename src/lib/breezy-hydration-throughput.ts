import type { BreezyHydrationJobState } from "@/lib/breezy-candidates-hydration";

export type HydrationIdleReason =
  | "active"
  | "complete"
  | "stalled"
  | "awaiting_client_round"
  | "rate_limited"
  | "server_budget"
  | "no_queue";

export type HydrationThroughputSnapshot = {
  candidatesAddedPerRound: number;
  positionsCompletedPerMinute: number | null;
  avgCandidatesPerPosition: number | null;
  estimatedTimeToCompleteMs: number | null;
  queueDrainRate: number | null;
  hydrationRoundsCompleted: number;
  hydrationIdleReason: HydrationIdleReason | null;
  lastSuccessfulPositionId: string | null;
  consecutiveTimeouts: number;
  rateLimitBackoffActive: boolean;
};

export function computeHydrationThroughput(input: {
  state: Pick<
    BreezyHydrationJobState,
    | "totalPositionsAvailable"
    | "lastContinuationPoint"
    | "queueRemaining"
    | "hydrationInProgress"
    | "hydrationComplete"
    | "hydrationStalled"
    | "hydrationRoundsCompleted"
    | "candidatesAddedLastRound"
    | "consecutiveTimeouts"
    | "rateLimitBackoffActive"
    | "lastSuccessfulPositionId"
    | "candidateCountAtLastSuccess"
    | "lastRoundDurationMs"
    | "positionsCompletedLastRound"
  >;
  truncated?: boolean;
  rateLimitHit?: boolean;
}): HydrationThroughputSnapshot {
  const { state } = input;
  const positionsLastRound = state.positionsCompletedLastRound ?? 0;
  const roundMs = state.lastRoundDurationMs ?? 0;
  const positionsPerMinute =
    roundMs > 0 && positionsLastRound > 0
      ? Math.round((positionsLastRound / roundMs) * 60_000 * 10) / 10
      : null;
  const queueDrainRate = positionsPerMinute;
  const estimatedTimeToCompleteMs =
    queueDrainRate && queueDrainRate > 0 && state.queueRemaining > 0
      ? Math.round((state.queueRemaining / queueDrainRate) * 60_000)
      : null;
  const avgCandidatesPerPosition =
    state.lastContinuationPoint > 0
      ? Math.round((state.candidateCountAtLastSuccess / state.lastContinuationPoint) * 100) / 100
      : null;

  let hydrationIdleReason: HydrationIdleReason | null = null;
  if (state.hydrationComplete) {
    hydrationIdleReason = "complete";
  } else if (input.rateLimitHit || state.rateLimitBackoffActive) {
    hydrationIdleReason = "rate_limited";
  } else if (state.hydrationStalled) {
    hydrationIdleReason = "stalled";
  } else if (input.truncated) {
    hydrationIdleReason = "server_budget";
  } else if (state.hydrationInProgress) {
    hydrationIdleReason = "active";
  } else if (state.queueRemaining > 0) {
    hydrationIdleReason = "awaiting_client_round";
  } else {
    hydrationIdleReason = "no_queue";
  }

  return {
    candidatesAddedPerRound: state.candidatesAddedLastRound ?? 0,
    positionsCompletedPerMinute: positionsPerMinute,
    avgCandidatesPerPosition,
    estimatedTimeToCompleteMs,
    queueDrainRate,
    hydrationRoundsCompleted: state.hydrationRoundsCompleted ?? 0,
    hydrationIdleReason,
    lastSuccessfulPositionId: state.lastSuccessfulPositionId,
    consecutiveTimeouts: state.consecutiveTimeouts ?? 0,
    rateLimitBackoffActive: Boolean(state.rateLimitBackoffActive || input.rateLimitHit),
  };
}
