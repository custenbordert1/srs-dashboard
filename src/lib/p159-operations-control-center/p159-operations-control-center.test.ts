import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { groupIntoSendBatches } from "@/lib/p159-operations-control-center/group-send-batches";
import {
  isP159DaemonRunning,
  resolveP159SystemMode,
} from "@/lib/p159-operations-control-center/build-recommendation";
import { buildP159SafetyChecks } from "@/lib/p159-operations-control-center/build-safety-checks";
import { isP154ContinuousEnabled } from "@/lib/p154-continuous-autonomous-recruiting-runner/runner-config";
import type { P159ControlAction } from "@/lib/p159-operations-control-center/types";

const CONTROL_ACTIONS: P159ControlAction[] = [
  "refresh",
  "dry_cycle",
  "live_cycle",
  "pause",
  "resume",
  "emergency_stop",
];

describe("P159 operations control center", () => {
  it("lists supported executive control actions", () => {
    assert.deepEqual(CONTROL_ACTIONS, [
      "refresh",
      "dry_cycle",
      "live_cycle",
      "pause",
      "resume",
      "emergency_stop",
    ]);
    assert.equal(CONTROL_ACTIONS.includes("enable_continuous" as P159ControlAction), false);
  });

  it("does not enable continuous daemon by default", () => {
    assert.equal(isP154ContinuousEnabled({}), false);
    assert.equal(isP154ContinuousEnabled({ P154_CONTINUOUS_ENABLED: "false" }), false);
  });

  it("resolves manual_only when continuous is off and not running", () => {
    assert.equal(
      resolveP159SystemMode({
        paused: false,
        continuousEnabled: false,
        schedulerMode: "stopped",
        currentStatus: "idle",
        daemonRunning: false,
        processingLockHeld: false,
        staleLockWarning: false,
        failures: 0,
        healthy: true,
        warnings: [],
      }),
      "manual_only",
    );
  });

  it("resolves paused before other modes", () => {
    assert.equal(
      resolveP159SystemMode({
        paused: true,
        continuousEnabled: true,
        schedulerMode: "continuous",
        currentStatus: "running",
        daemonRunning: true,
        processingLockHeld: true,
        staleLockWarning: false,
        failures: 0,
        healthy: true,
        warnings: [],
      }),
      "paused",
    );
  });

  it("detects daemon running only when continuous mode is fully active", () => {
    assert.equal(
      isP159DaemonRunning({
        continuousEnabled: true,
        schedulerMode: "continuous",
        currentStatus: "idle",
        serverStartTime: new Date().toISOString(),
      }),
      false,
    );
    assert.equal(
      isP159DaemonRunning(
        {
          continuousEnabled: true,
          schedulerMode: "continuous",
          currentStatus: "idle",
          serverStartTime: new Date().toISOString(),
        },
        { P154_CONTINUOUS_ENABLED: "true" },
      ),
      true,
    );
  });

  it("groups paperwork sends into batches by time gap", () => {
    const batches = groupIntoSendBatches([
      { at: "2026-07-07T12:00:00.000Z" },
      { at: "2026-07-07T12:00:05.000Z" },
      { at: "2026-07-07T12:02:00.000Z" },
    ]);
    assert.equal(batches.length, 2);
    assert.equal(batches[0].sendCount, 2);
    assert.equal(batches[1].sendCount, 1);
  });

  it("reports safety checks as active by default", () => {
    const safety = buildP159SafetyChecks();
    assert.equal(safety.duplicateProtectionActive, true);
    assert.equal(safety.breezyWriteProtectionActive, true);
    assert.equal(safety.capsActive, true);
    assert.equal(safety.stopOnErrorActive, true);
  });
});
