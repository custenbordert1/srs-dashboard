import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { BreezyCandidate } from "@/lib/breezy-api";
import {
  FRESHNESS_RESCUE_STORE_AGE_MS,
  findCandidateInStore,
  matchesCandidateLookup,
  nextRescueRotationIndex,
  selectPositionsForFreshnessRescue,
  shouldRunFreshnessRescue,
} from "@/lib/candidate-ingestion/fresh-candidate-ingestion-rescue";
import { emptyIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";

function mockCandidate(id: string, email: string, appliedDate: string): BreezyCandidate {
  return {
    candidateId: id,
    firstName: "Taylor",
    lastName: "Custenborder",
    email,
    phone: "555-0100",
    source: "Indeed",
    stage: "Applied",
    appliedDate,
    createdDate: appliedDate,
    addedDate: appliedDate,
    updatedDate: appliedDate,
    addedDateSource: "creation_date",
    positionName: "Retail Display Merchandiser – West Chester, OH",
    positionId: "f8f9afaa12b8",
    city: "West Chester",
    state: "OH",
    hasResume: true,
    resumeText: "Retail merchandising experience",
    hasQuestionnaire: true,
  };
}

describe("fresh-candidate-ingestion-rescue", () => {
  it("requires store age >= 5 minutes unless force=true", () => {
    const young = {
      ...emptyIngestionStore(),
      lastChunkAt: new Date(Date.now() - 60_000).toISOString(),
      candidates: { c1: mockCandidate("c1", "a@example.com", "2026-07-06T10:00:00.000Z") },
    };
    assert.equal(shouldRunFreshnessRescue(young, { referenceMs: Date.now() }), false);

    const old = {
      ...emptyIngestionStore(),
      lastChunkAt: new Date(Date.now() - 6 * 60_000).toISOString(),
      candidates: { c1: mockCandidate("c1", "a@example.com", "2026-07-06T10:00:00.000Z") },
    };
    assert.equal(shouldRunFreshnessRescue(old, { referenceMs: Date.now() }), true);
    assert.equal(shouldRunFreshnessRescue(young, { force: true }), true);
  });

  it("selects scanned positions in current cycle with rotation", () => {
    const positionIds = Array.from({ length: 40 }, (_, i) => `pos-${i}`);
    const store = {
      ...emptyIngestionStore(),
      publishedPositionIds: positionIds,
      publishedPositionsTotal: positionIds.length,
      scannedPositionIds: positionIds.slice(0, 35),
      checkpointIndex: 35,
      rescueRotationIndex: 25,
      candidates: { c1: mockCandidate("c1", "a@example.com", "2026-07-06T10:00:00.000Z") },
    };
    const selected = selectPositionsForFreshnessRescue(store, { maxPositions: 5 });
    assert.equal(selected.length, 5);
    assert.equal(selected[0], "pos-25");
    assert.equal(selected[4], "pos-29");
    assert.equal(nextRescueRotationIndex(store, 5), 30);
  });

  it("matches candidate lookup by email and name", () => {
    const candidate = mockCandidate("705cdc0e7f30", "custenborder.taylor@gmail.com", "2026-07-06T19:47:35.990Z");
    const older = mockCandidate("09049d13f466", "custenborder.taylor@gmail.com", "2026-05-25T16:56:23.607Z");
    const store = {
      ...emptyIngestionStore(),
      candidates: { [candidate.candidateId]: candidate, [older.candidateId]: older },
    };
    assert.equal(
      matchesCandidateLookup(candidate, { email: "custenborder.taylor@gmail.com" }),
      true,
    );
    assert.equal(matchesCandidateLookup(candidate, { name: "taylor custenborder" }), true);
    assert.equal(findCandidateInStore(store, { email: "custenborder.taylor@gmail.com" })?.candidateId, "705cdc0e7f30");
  });
});
