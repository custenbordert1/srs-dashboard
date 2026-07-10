import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getP154BackfillLookbackDays,
  getP154IntervalMinutes,
  getP154MaxAssignmentsPerCycle,
  getP154MaxPaperworkSendsPerCycle,
  isP154ContinuousEnabled,
  isP154StopOnError,
} from "@/lib/p154-continuous-autonomous-recruiting-runner/runner-config";
import { isP1547LockStale } from "@/lib/p154-continuous-autonomous-recruiting-runner/runner-store";
import {
  P1547_DEFAULT_BACKFILL_LOOKBACK_DAYS,
  P1547_DEFAULT_INTERVAL_MINUTES,
  P1547_DEFAULT_MAX_ASSIGNMENTS,
  P1547_DEFAULT_MAX_SENDS,
  P1547_STALE_LOCK_MS,
} from "@/lib/p154-continuous-autonomous-recruiting-runner/types";

describe("P154.7 continuous autonomous recruiting runner", () => {
  it("defaults continuous mode to disabled", () => {
    assert.equal(isP154ContinuousEnabled({}), false);
    assert.equal(isP154ContinuousEnabled({ P154_CONTINUOUS_ENABLED: "true" }), true);
    assert.equal(isP154ContinuousEnabled({ P154_CONTINUOUS_ENABLED: "false" }), false);
  });

  it("reads interval and cycle caps from env", () => {
    assert.equal(getP154IntervalMinutes({}), P1547_DEFAULT_INTERVAL_MINUTES);
    assert.equal(getP154IntervalMinutes({ P154_INTERVAL_MINUTES: "15" }), 15);
    assert.equal(getP154MaxAssignmentsPerCycle({}), P1547_DEFAULT_MAX_ASSIGNMENTS);
    assert.equal(getP154MaxPaperworkSendsPerCycle({}), P1547_DEFAULT_MAX_SENDS);
    assert.equal(getP154MaxAssignmentsPerCycle({ P154_MAX_ASSIGNMENTS_PER_CYCLE: "12" }), 12);
    assert.equal(getP154MaxPaperworkSendsPerCycle({ P154_MAX_PAPERWORK_SENDS_PER_CYCLE: "5" }), 5);
  });

  it("computes backfill lookback and stop-on-error defaults", () => {
    assert.equal(getP154BackfillLookbackDays({}), P1547_DEFAULT_BACKFILL_LOOKBACK_DAYS);
    assert.equal(getP154BackfillLookbackDays({ P154_BACKFILL_LOOKBACK_DAYS: "30" }), 30);
    assert.equal(isP154StopOnError({}), true);
    assert.equal(isP154StopOnError({ P154_STOP_ON_ERROR: "false" }), false);
  });

  it("treats stale P154.7 locks as expired", () => {
    const fresh = {
      runId: "run-1",
      lockedAt: new Date().toISOString(),
      mode: "manual" as const,
    };
    const stale = {
      runId: "run-2",
      lockedAt: new Date(Date.now() - P1547_STALE_LOCK_MS - 1_000).toISOString(),
      mode: "manual" as const,
    };
    assert.equal(isP1547LockStale(fresh), false);
    assert.equal(isP1547LockStale(stale), true);
    assert.equal(isP1547LockStale(null), true);
  });
});

// Keep artifact writer importable in CI without executing main.
export async function writeP1547TestArtifact(payload: Record<string, unknown>): Promise<void> {
  await mkdir("artifacts", { recursive: true });
  await writeFile(
    path.join("artifacts", "p154.7-continuous-runner.test-payload.json"),
    `${JSON.stringify(payload, null, 2)}\n`,
    "utf8",
  );
}
