import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyP199QueueFilterAndSort,
  confidenceForQueueRow,
  daysSinceApplied,
  matchesDaysSinceAppliedBucket,
  matchesP199QueueFilters,
  parseP199QueueFilterState,
  resolveSortFromHeader,
  type P199QueueCandidate,
  type P199QueueFilterState,
} from "@/lib/p199-candidate-queue-ux";

function row(partial: Partial<P199QueueCandidate> = {}): P199QueueCandidate {
  return {
    candidateId: "x",
    state: "OH",
    city: "Columbus",
    appliedDate: "2026-07-14T12:00:00.000Z",
    assignedRecruiter: "Taylor",
    aiNumericScore: 70,
    confidence: 70,
    nearbyJobCount: 1,
    distanceMiles: 20,
    ...partial,
  };
}

describe("p199-candidate-queue-ux", () => {
  it("computes days since applied and matches buckets", () => {
    const now = Date.parse("2026-07-14T18:00:00.000Z");
    assert.equal(daysSinceApplied("2026-07-14T10:00:00.000Z", now), 0);
    assert.equal(daysSinceApplied("2026-07-13T10:00:00.000Z", now), 1);
    assert.equal(matchesDaysSinceAppliedBucket("2026-07-14T10:00:00.000Z", "today", now), true);
    assert.equal(matchesDaysSinceAppliedBucket("2026-07-10T10:00:00.000Z", "3-5", now), true);
    assert.equal(matchesDaysSinceAppliedBucket("2026-07-01T10:00:00.000Z", "10+", now), true);
  });

  it("filters by multi-select state and days together", () => {
    const filters: Pick<P199QueueFilterState, "states" | "daysSinceApplied"> = {
      states: ["OH", "KY"],
      daysSinceApplied: "today",
    };
    const now = Date.parse("2026-07-14T18:00:00.000Z");
    assert.equal(
      matchesP199QueueFilters(row({ state: "OH", appliedDate: "2026-07-14T08:00:00.000Z" }), filters, now),
      true,
    );
    assert.equal(
      matchesP199QueueFilters(row({ state: "WV", appliedDate: "2026-07-14T08:00:00.000Z" }), filters, now),
      false,
    );
    assert.equal(
      matchesP199QueueFilters(row({ state: "OH", appliedDate: "2026-07-10T08:00:00.000Z" }), filters, now),
      false,
    );
  });

  it("sorts by newest / confidence / nearest", () => {
    const rows = [
      row({ candidateId: "a", appliedDate: "2026-07-01T00:00:00.000Z", confidence: 40, distanceMiles: 50 }),
      row({ candidateId: "b", appliedDate: "2026-07-12T00:00:00.000Z", confidence: 90, distanceMiles: 5 }),
      row({ candidateId: "c", appliedDate: "2026-07-10T00:00:00.000Z", confidence: 70, distanceMiles: 12 }),
    ];
    const newest = applyP199QueueFilterAndSort(rows, {
      states: [],
      daysSinceApplied: "all",
      sort: "newest_applied",
      headerColumn: null,
      headerDirection: "desc",
    });
    assert.deepEqual(
      newest.map((r) => r.candidateId),
      ["b", "c", "a"],
    );

    const byConfidence = applyP199QueueFilterAndSort(rows, {
      states: [],
      daysSinceApplied: "all",
      sort: "confidence",
      headerColumn: null,
      headerDirection: "desc",
    });
    assert.equal(byConfidence[0]?.candidateId, "b");

    const nearest = applyP199QueueFilterAndSort(rows, {
      states: [],
      daysSinceApplied: "all",
      sort: "nearest_jobs",
      headerColumn: null,
      headerDirection: "desc",
    });
    assert.equal(nearest[0]?.candidateId, "b");
  });

  it("maps header clicks to sort ids and parses session state", () => {
    assert.equal(resolveSortFromHeader("applied", "desc"), "newest_applied");
    assert.equal(resolveSortFromHeader("age", "asc"), "oldest_applied");
    assert.equal(resolveSortFromHeader("confidence", "desc"), "confidence");
    const parsed = parseP199QueueFilterState({
      states: ["oh", "ky"],
      daysSinceApplied: "3-5",
      sort: "highest_ai",
      headerColumn: "state",
      headerDirection: "asc",
    });
    assert.deepEqual(parsed.states, ["OH", "KY"]);
    assert.equal(parsed.daysSinceApplied, "3-5");
    assert.equal(parsed.sort, "highest_ai");
  });

  it("picks confidence from preferred fields", () => {
    assert.equal(
      confidenceForQueueRow({
        actionConfidence: 81,
        recruiterAssignmentConfidence: 50,
        aiNumericScore: 40,
      }),
      81,
    );
    assert.equal(confidenceForQueueRow({ aiNumericScore: 55 }), 55);
  });
});
