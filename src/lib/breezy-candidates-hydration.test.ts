import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  beginHydrationSession,
  BREEZY_HYDRATION_HEARTBEAT_STALE_MS,
  BREEZY_HYDRATION_PROGRESS_STALE_MS,
  forceReleaseHydrationLock,
  getHydrationJobState,
  isHydrationJobStalled,
  prepareHydrationContinuation,
  recordHydrationBatchProgress,
  reclaimStalledHydrationJob,
  resetHydrationJobState,
} from "@/lib/breezy-candidates-hydration";
import { shouldAcceptCandidatesCacheWrite } from "@/lib/breezy-candidates-cache";
import type { BreezyCandidatesSuccess } from "@/lib/breezy-api";

describe("breezy-candidates-hydration", () => {
  it("resumes from last continuation point instead of restarting", () => {
    const companyId = "co-resume-test";
    resetHydrationJobState(companyId, "test_reset");
    beginHydrationSession({
      companyId,
      ownerId: "owner-a",
      totalPositionsAvailable: 295,
      seedContinuationPoint: 84,
      seedCandidateCount: 72,
    });
    recordHydrationBatchProgress({
      companyId,
      ownerId: "owner-a",
      scanMode: "full",
      totalPositionsAvailable: 295,
      absolutePositionsScanned: 84,
      completedPositionIds: ["p-1"],
      skippedPositionIds: [],
      candidateCount: 72,
      truncated: true,
    });

    const attached = beginHydrationSession({
      companyId,
      ownerId: "owner-b",
      totalPositionsAvailable: 295,
    });

    assert.equal(attached.resumeOffset, 84);
    assert.equal(attached.attachedToExisting, false);
    assert.equal(attached.resumedFromStale, false);
    const state = getHydrationJobState(companyId);
    assert.equal(state?.lastContinuationPoint, 84);
    assert.equal(state?.candidateCountAtLastSuccess, 72);
  });

  it("does not regress continuation on poorer batch metadata", () => {
    const companyId = "co-no-regress";
    resetHydrationJobState(companyId, "test_reset");
    beginHydrationSession({
      companyId,
      ownerId: "owner-a",
      totalPositionsAvailable: 295,
      seedContinuationPoint: 84,
      seedCandidateCount: 72,
    });
    recordHydrationBatchProgress({
      companyId,
      ownerId: "owner-a",
      scanMode: "full",
      totalPositionsAvailable: 295,
      absolutePositionsScanned: 84,
      completedPositionIds: [],
      skippedPositionIds: [],
      candidateCount: 72,
      truncated: false,
    });

    recordHydrationBatchProgress({
      companyId,
      ownerId: "owner-a",
      scanMode: "full",
      totalPositionsAvailable: 295,
      absolutePositionsScanned: 18,
      completedPositionIds: [],
      skippedPositionIds: [],
      candidateCount: 7,
      truncated: true,
    });

    assert.equal(getHydrationJobState(companyId)?.lastContinuationPoint, 84);
    assert.equal(getHydrationJobState(companyId)?.candidateCountAtLastSuccess, 72);
  });

  it("reclaims stalled hydration without resetting continuation point", () => {
    const companyId = "co-reclaim-test";
    resetHydrationJobState(companyId, "test_reset");
    beginHydrationSession({
      companyId,
      ownerId: "owner-dead",
      totalPositionsAvailable: 295,
      seedContinuationPoint: 84,
      seedCandidateCount: 72,
    });
    const state = getHydrationJobState(companyId);
    assert.ok(state);
    state!.hydrationHeartbeat = new Date(
      Date.now() - BREEZY_HYDRATION_HEARTBEAT_STALE_MS - 1_000,
    ).toISOString();
    state!.lastProgressAt = new Date(
      Date.now() - BREEZY_HYDRATION_PROGRESS_STALE_MS - 1_000,
    ).toISOString();
    assert.equal(isHydrationJobStalled(state!), true);

    const plan = prepareHydrationContinuation({
      companyId,
      ownerId: "owner-new",
      totalPositionsAvailable: 295,
      reclaimStale: true,
    });

    assert.equal(plan.reclaimed, true);
    assert.equal(plan.resumeOffset, 84);
    const reclaimed = getHydrationJobState(companyId);
    assert.equal(reclaimed?.hydrationOwnerId, "owner-new");
    assert.equal(reclaimed?.lastContinuationPoint, 84);
    assert.equal(reclaimed?.candidateCountAtLastSuccess, 72);
    assert.equal(reclaimed?.reclaimCount, 1);
    assert.equal(reclaimed?.hydrationInProgress, true);
  });

  it("force release clears lock but preserves continuation", () => {
    const companyId = "co-release-test";
    resetHydrationJobState(companyId, "test_reset");
    beginHydrationSession({
      companyId,
      ownerId: "owner-a",
      totalPositionsAvailable: 295,
      seedContinuationPoint: 60,
      seedCandidateCount: 7,
    });
    forceReleaseHydrationLock(companyId, "test_release");
    const state = getHydrationJobState(companyId);
    assert.equal(state?.hydrationInProgress, false);
    assert.equal(state?.hydrationOwnerId, null);
    assert.equal(state?.lastContinuationPoint, 60);
    assert.equal(state?.candidateCountAtLastSuccess, 7);
  });

  it("reclaimStalledHydrationJob transfers ownership and increments reclaim count", () => {
    const companyId = "co-reclaim-direct";
    resetHydrationJobState(companyId, "test_reset");
    beginHydrationSession({
      companyId,
      ownerId: "owner-old",
      totalPositionsAvailable: 295,
      seedContinuationPoint: 18,
      seedCandidateCount: 7,
    });
    forceReleaseHydrationLock(companyId, "simulated_stall");
    reclaimStalledHydrationJob(companyId, "owner-fresh", "manual_reclaim");
    const state = getHydrationJobState(companyId);
    assert.equal(state?.hydrationOwnerId, "owner-fresh");
    assert.equal(state?.lastContinuationPoint, 18);
    assert.equal(state?.reclaimCount, 1);
    assert.equal(state?.hydrationInProgress, true);
  });
});

describe("preview vs hydration cache writes", () => {
  it("preview tier cannot replace richer fast snapshot in cache policy", () => {
    const fast = {
      ok: true,
      candidates: Array.from({ length: 72 }, (_, index) => ({
        candidateId: `c-${index}`,
      })),
      fetchedAt: "2026-05-22T12:00:00.000Z",
      companyId: "co-1",
      scanMode: "fast",
      positionsScanned: 60,
      hydrationJob: {
        hydrationRoundId: "round-1",
        companyId: "co-1",
        positionsScanned: 84,
        totalPositionsAvailable: 295,
        queueRemaining: 211,
        hydrationPercent: 28,
        startedAt: "2026-05-22T12:00:00.000Z",
        lastSuccessfulHydrationAt: "2026-05-22T12:00:00.000Z",
        hydrationInProgress: true,
        hydrationOwnerId: "owner",
        hydrationHeartbeat: "2026-05-22T12:00:00.000Z",
        hydrationStartedAt: "2026-05-22T12:00:00.000Z",
        resumeCount: 1,
        restartCount: 0,
        lastContinuationPoint: 84,
        estimatedRemainingPositions: 211,
        candidateCountAtLastSuccess: 72,
        hydrationComplete: false,
        completedPositionCount: 84,
        skippedPositionCount: 0,
      },
    } as BreezyCandidatesSuccess;
    const preview = {
      ok: true,
      candidates: [{ candidateId: "p-1" } as BreezyCandidatesSuccess["candidates"][number]],
      fetchedAt: "2026-05-22T12:00:00.000Z",
      companyId: "co-1",
      scanMode: "preview",
      positionsScanned: 18,
    } as BreezyCandidatesSuccess;
    const decision = shouldAcceptCandidatesCacheWrite(preview, fast);
    assert.equal(decision.accepted, false);
  });
});
