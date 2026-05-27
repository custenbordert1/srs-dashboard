import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  beginHydrationSession,
  getHydrationJobState,
  recordHydrationBatchProgress,
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
    assert.equal(attached.attachedToExisting, true);
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
