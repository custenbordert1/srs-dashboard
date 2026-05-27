import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyCandidatesSuccess } from "@/lib/breezy-api";
import {
  buildTableBackedCandidatesSnapshot,
  resolveAuthoritativeCandidatesDisplaySnapshot,
} from "@/lib/breezy-candidates-display";

function snapshot(
  count: number,
  scanMode: "preview" | "fast" | "full" = "fast",
): BreezyCandidatesSuccess {
  return {
    ok: true,
    companyId: "co-1",
    candidates: Array.from({ length: count }, (_, index) => ({
      candidateId: `c-${index}`,
    })) as BreezyCandidatesSuccess["candidates"],
    fetchedAt: "2026-05-27T12:00:00.000Z",
    scanMode,
    positionsScanned: count,
  };
}

describe("authoritative candidates display snapshot", () => {
  it("prefers high-water over poorer live preview payload", () => {
    const highWater = snapshot(72, "full");
    const livePreview = snapshot(1, "preview");
    const resolved = resolveAuthoritativeCandidatesDisplaySnapshot({
      tableRows: [],
      breezySnapshot: null,
      liveData: livePreview,
      recoverableSnapshot: highWater,
      highWaterSnapshot: highWater,
      startupSnapshot: null,
    });
    assert.equal(resolved?.candidates.length, 72);
  });

  it("uses table rows when committed count exceeds snapshot metadata", () => {
    const meta = snapshot(1, "preview");
    const rows = meta.candidates;
    const backed = buildTableBackedCandidatesSnapshot(
      Array.from({ length: 15 }, (_, index) => ({
        ...rows[0],
        candidateId: `row-${index}`,
      })) as BreezyCandidatesSuccess["candidates"],
      meta,
    );
    assert.equal(backed?.candidates.length, 15);
  });
});
