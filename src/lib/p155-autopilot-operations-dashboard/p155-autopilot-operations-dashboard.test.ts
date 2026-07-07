import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isP154ContinuousEnabled } from "@/lib/p154-continuous-autonomous-recruiting-runner/runner-config";
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
});
