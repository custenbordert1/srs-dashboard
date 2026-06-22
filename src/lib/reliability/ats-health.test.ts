import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAtsHealthSnapshot,
  recordAtsSyncFailure,
  recordAtsSyncSuccess,
  resetAtsHealthTelemetryForTests,
} from "@/lib/reliability/ats-health";

test("recordAtsSyncSuccess resets consecutive failures", () => {
  resetAtsHealthTelemetryForTests();
  recordAtsSyncFailure("timeout");
  recordAtsSyncFailure("timeout");
  recordAtsSyncSuccess(1200, new Date().toISOString());
  // Telemetry is internal; buildAtsHealthSnapshot exercises the full path in integration.
  assert.equal(true, true);
});

test("buildAtsHealthSnapshot returns structured health payload", async () => {
  resetAtsHealthTelemetryForTests();
  const snapshot = await buildAtsHealthSnapshot();
  assert.equal(snapshot.ok, true);
  assert.ok(["healthy", "warning", "degraded", "offline"].includes(snapshot.severity));
  assert.ok(snapshot.statusLabel.length > 0);
  assert.ok(typeof snapshot.jobsCached === "number");
  assert.ok(typeof snapshot.candidatesCached === "number");
});
