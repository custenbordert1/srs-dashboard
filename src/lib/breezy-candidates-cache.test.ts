import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyCandidatesSuccess } from "@/lib/breezy-api";
import {
  pickRichestCandidatesSnapshot,
  shouldAcceptCandidatesCacheWrite,
} from "@/lib/breezy-candidates-cache";

function snapshot(
  overrides: Partial<BreezyCandidatesSuccess> & { candidates: BreezyCandidatesSuccess["candidates"] },
): BreezyCandidatesSuccess {
  return {
    ok: true,
    fetchedAt: "2026-05-22T12:00:00.000Z",
    companyId: "co-1",
    positionsScanned: 60,
    totalPositionsAvailable: 295,
    hydrationComplete: false,
    partial: true,
    ...overrides,
  };
}

describe("breezy-candidates-cache richness", () => {
  it("rejects preview tier overwriting a richer fast-tier snapshot", () => {
    const fast = snapshot({
      scanMode: "fast",
      candidates: Array.from({ length: 72 }, (_, index) => ({
        candidateId: `fast-${index}`,
      })) as BreezyCandidatesSuccess["candidates"],
      positionsScanned: 60,
    });
    const preview = snapshot({
      scanMode: "preview",
      candidates: [{ candidateId: "preview-1" } as BreezyCandidatesSuccess["candidates"][number]],
      positionsScanned: 18,
    });
    const decision = shouldAcceptCandidatesCacheWrite(preview, fast);
    assert.equal(decision.accepted, false);
    assert.equal(decision.writeRejectedDueToLowerRichness, true);
    assert.equal(decision.reason, "lower_candidate_count");
  });

  it("picks the richest snapshot across tiers", () => {
    const preview = snapshot({
      scanMode: "preview",
      candidates: [{ candidateId: "p-1" } as BreezyCandidatesSuccess["candidates"][number]],
    });
    const fast = snapshot({
      scanMode: "fast",
      candidates: Array.from({ length: 72 }, (_, index) => ({
        candidateId: `f-${index}`,
      })) as BreezyCandidatesSuccess["candidates"],
    });
    const best = pickRichestCandidatesSnapshot([preview, fast]);
    assert.equal(best?.candidates.length, 72);
    assert.equal(best?.scanMode, "fast");
  });

  it("rejects incremental full-tier batch with fewer rows than fast-tier snapshot", () => {
    const fast = snapshot({
      scanMode: "fast",
      candidates: Array.from({ length: 72 }, (_, index) => ({
        candidateId: `fast-${index}`,
      })) as BreezyCandidatesSuccess["candidates"],
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
        lastProgressAt: "2026-05-22T12:00:00.000Z",
        lastCandidateIncreaseAt: "2026-05-22T12:00:00.000Z",
        lastContinuationIncreaseAt: "2026-05-22T12:00:00.000Z",
        lastUpdatedAt: "2026-05-22T12:00:00.000Z",
        reclaimCount: 0,
        hydrationStalled: false,
      },
    });
    const incrementalFull = snapshot({
      scanMode: "full",
      candidates: Array.from({ length: 7 }, (_, index) => ({
        candidateId: `full-${index}`,
      })) as BreezyCandidatesSuccess["candidates"],
      positionsScanned: 90,
      hydrationJob: {
        ...fast.hydrationJob!,
        lastContinuationPoint: 90,
        hydrationPercent: 30,
      },
    });
    const decision = shouldAcceptCandidatesCacheWrite(incrementalFull, fast, {
      downgradeSource: "test:incremental_full_vs_fast",
    });
    assert.equal(decision.accepted, false);
    assert.equal(decision.reason, "lower_candidate_count");
    assert.equal(pickRichestCandidatesSnapshot([fast, incrementalFull])?.candidates.length, 72);
  });

  it("accepts richer hydration upgrades", () => {
    const partial = snapshot({
      scanMode: "fast",
      candidates: [{ candidateId: "c-1" } as BreezyCandidatesSuccess["candidates"][number]],
      positionsScanned: 18,
    });
    const richer = snapshot({
      scanMode: "full",
      candidates: Array.from({ length: 80 }, (_, index) => ({
        candidateId: `full-${index}`,
      })) as BreezyCandidatesSuccess["candidates"],
      positionsScanned: 120,
      hydrationComplete: true,
      partial: false,
    });
    const decision = shouldAcceptCandidatesCacheWrite(richer, partial);
    assert.equal(decision.accepted, true);
    assert.equal(decision.countDelta, 79);
  });
});
