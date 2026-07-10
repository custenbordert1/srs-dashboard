import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getP154BackfillSince,
  getP154IntervalMinutes,
  getP1544MaxAssignmentsPerCycle,
  getP1544MaxSendsPerCycle,
  isP154ContinuousEnabled,
} from "@/lib/p154-full-candidate-backfill-continuous-processing/config";
import { isP1544LockStale } from "@/lib/p154-full-candidate-backfill-continuous-processing/backfill-store";
import {
  P1544_DEFAULT_BACKFILL_SINCE,
  P1544_DEFAULT_INTERVAL_MINUTES,
  P1544_DEFAULT_MAX_ASSIGNMENTS,
  P1544_DEFAULT_MAX_SENDS,
  P1544_STALE_LOCK_MS,
} from "@/lib/p154-full-candidate-backfill-continuous-processing/types";

describe("P154.4 full candidate backfill continuous processing", () => {
  it("reads continuous mode defaults from env", () => {
    assert.equal(isP154ContinuousEnabled({}), false);
    assert.equal(isP154ContinuousEnabled({ P154_CONTINUOUS_ENABLED: "true" }), true);
    assert.equal(getP154IntervalMinutes({}), P1544_DEFAULT_INTERVAL_MINUTES);
    assert.equal(getP154IntervalMinutes({ P154_INTERVAL_MINUTES: "15" }), 15);
    assert.equal(getP154BackfillSince({}), P1544_DEFAULT_BACKFILL_SINCE);
    assert.equal(getP154BackfillSince({ P154_BACKFILL_SINCE: "2026-05-01" }), "2026-05-01");
  });

  it("uses production-safe cycle caps", () => {
    assert.equal(getP1544MaxAssignmentsPerCycle({}), P1544_DEFAULT_MAX_ASSIGNMENTS);
    assert.equal(getP1544MaxSendsPerCycle({}), P1544_DEFAULT_MAX_SENDS);
    assert.equal(getP1544MaxAssignmentsPerCycle({ P154_MAX_ASSIGNMENTS_PER_CYCLE: "12" }), 12);
    assert.equal(getP1544MaxSendsPerCycle({ P154_MAX_PAPERWORK_SENDS_PER_CYCLE: "5" }), 5);
  });

  it("treats stale processing locks as expired", () => {
    const fresh = {
      runId: "run-1",
      lockedAt: new Date().toISOString(),
      mode: "manual" as const,
    };
    const stale = {
      runId: "run-2",
      lockedAt: new Date(Date.now() - P1544_STALE_LOCK_MS - 1_000).toISOString(),
      mode: "manual" as const,
    };
    assert.equal(isP1544LockStale(fresh), false);
    assert.equal(isP1544LockStale(stale), true);
    assert.equal(isP1544LockStale(null), true);
  });
});
