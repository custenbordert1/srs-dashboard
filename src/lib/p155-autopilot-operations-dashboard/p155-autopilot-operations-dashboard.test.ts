import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isP154ContinuousEnabled } from "@/lib/p154-continuous-autonomous-recruiting-runner/runner-config";
import {
  P155_CLIENT_REQUEST_TIMEOUT_MS,
  P155_SERVER_CLASSIFICATION_TIMEOUT_MS,
} from "@/lib/p155-autopilot-operations-dashboard/constants";
import { withServerTimeout } from "@/lib/p155-autopilot-operations-dashboard/request-timeout";
import type { P155ControlAction } from "@/lib/p155-autopilot-operations-dashboard/types";

const CONTROL_ACTIONS: P155ControlAction[] = [
  "dry_cycle",
  "live_cycle",
  "pause",
  "resume",
  "refresh",
];

describe("P155 autopilot operations dashboard", () => {
  it("lists supported executive control actions", () => {
    assert.deepEqual(CONTROL_ACTIONS, [
      "dry_cycle",
      "live_cycle",
      "pause",
      "resume",
      "refresh",
    ]);
  });

  it("does not enable continuous daemon by default", () => {
    assert.equal(isP154ContinuousEnabled({}), false);
    assert.equal(isP154ContinuousEnabled({ P154_CONTINUOUS_ENABLED: "false" }), false);
  });

  it("requires explicit env for continuous mode", () => {
    assert.equal(isP154ContinuousEnabled({ P154_CONTINUOUS_ENABLED: "true" }), true);
  });

  it("uses 5 second client and 4 second server classification budgets", () => {
    assert.equal(P155_CLIENT_REQUEST_TIMEOUT_MS, 5_000);
    assert.equal(P155_SERVER_CLASSIFICATION_TIMEOUT_MS, 4_000);
  });

  it("withServerTimeout returns fallback when promise is slow", async () => {
    const result = await withServerTimeout({
      label: "test",
      promise: new Promise<string>((resolve) => setTimeout(() => resolve("late"), 50)),
      timeoutMs: 5,
      fallback: "fast",
    });
    assert.equal(result.value, "fast");
    assert.equal(result.timedOut, true);
  });
});
