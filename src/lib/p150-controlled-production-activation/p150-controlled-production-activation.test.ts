import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getP150MaxSendsPerCycle,
  isP150ControlledProductionActivationEnabled,
} from "@/lib/p150-controlled-production-activation/execute-controlled-production-activation";
import { P150_DEFAULT_MAX_SENDS } from "@/lib/p150-controlled-production-activation/types";

describe("P150 controlled production activation", () => {
  it("is disabled by default", () => {
    assert.equal(isP150ControlledProductionActivationEnabled({}), false);
    assert.equal(isP150ControlledProductionActivationEnabled({ P150_CONTROLLED_PRODUCTION_ACTIVATION_ENABLED: "false" }), false);
    assert.equal(isP150ControlledProductionActivationEnabled({ P150_CONTROLLED_PRODUCTION_ACTIVATION_ENABLED: "true" }), true);
  });

  it("defaults max sends to 10", () => {
    assert.equal(getP150MaxSendsPerCycle({}), P150_DEFAULT_MAX_SENDS);
    assert.equal(getP150MaxSendsPerCycle({ P150_MAX_SENDS_PER_CYCLE: "5" }), 5);
    assert.equal(getP150MaxSendsPerCycle({ P150_MAX_SENDS_PER_CYCLE: "0" }), P150_DEFAULT_MAX_SENDS);
    assert.equal(getP150MaxSendsPerCycle({ P150_MAX_SENDS_PER_CYCLE: "abc" }), P150_DEFAULT_MAX_SENDS);
  });
});
