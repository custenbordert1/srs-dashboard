import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeHydrationThroughput } from "@/lib/breezy-hydration-throughput";
import type { BreezyHydrationJobState } from "@/lib/breezy-candidates-hydration";

function baseState(overrides: Partial<BreezyHydrationJobState> = {}): BreezyHydrationJobState {
  return {
    hydrationRoundId: "round-1",
    companyId: "co-1",
    positionsScanned: 120,
    totalPositionsAvailable: 295,
    completedPositionIds: [],
    skippedPositionIds: [],
    queueRemaining: 175,
    hydrationPercent: 41,
    startedAt: "2026-05-22T12:00:00.000Z",
    lastSuccessfulHydrationAt: "2026-05-22T12:05:00.000Z",
    hydrationInProgress: true,
    hydrationOwnerId: "owner",
    hydrationHeartbeat: "2026-05-22T12:05:00.000Z",
    hydrationStartedAt: "2026-05-22T12:00:00.000Z",
    resumeCount: 1,
    restartCount: 0,
    lastContinuationPoint: 120,
    estimatedRemainingPositions: 175,
    candidateCountAtLastSuccess: 72,
    hydrationComplete: false,
    lastProgressAt: "2026-05-22T12:05:00.000Z",
    lastCandidateIncreaseAt: "2026-05-22T12:05:00.000Z",
    lastContinuationIncreaseAt: "2026-05-22T12:05:00.000Z",
    lastUpdatedAt: "2026-05-22T12:05:00.000Z",
    reclaimCount: 0,
    hydrationStalled: false,
    hydrationRoundsCompleted: 3,
    candidatesAddedLastRound: 8,
    positionsCompletedLastRound: 24,
    lastRoundDurationMs: 60_000,
    lastSuccessfulPositionId: "pos-120",
    consecutiveTimeouts: 0,
    rateLimitBackoffActive: false,
    expiresAt: Date.now() + 60_000,
    ...overrides,
  };
}

describe("breezy-hydration-throughput", () => {
  it("computes drain rate and ETA from last round", () => {
    const metrics = computeHydrationThroughput({ state: baseState() });
    assert.equal(metrics.candidatesAddedPerRound, 8);
    assert.equal(metrics.positionsCompletedPerMinute, 24);
    assert.equal(metrics.hydrationIdleReason, "active");
    assert.ok(metrics.estimatedTimeToCompleteMs && metrics.estimatedTimeToCompleteMs > 0);
  });

  it("marks rate limit idle reason when backoff is active", () => {
    const metrics = computeHydrationThroughput({
      state: baseState({ rateLimitBackoffActive: true }),
      rateLimitHit: true,
    });
    assert.equal(metrics.hydrationIdleReason, "rate_limited");
    assert.equal(metrics.rateLimitBackoffActive, true);
  });
});
