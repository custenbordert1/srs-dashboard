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
