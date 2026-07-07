import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getP154MaxAssignmentsPerCycle,
  getP154MaxSendsPerCycle,
  isP154ControlledProductionAutopilotEnabled,
} from "@/lib/p154-controlled-production-autopilot-activation/execute-controlled-production-autopilot";
import { defaultAutopilotEnabledFeatures } from "@/lib/p154-controlled-production-autopilot-activation/autopilot-store";
import {
  P154_DEFAULT_MAX_ASSIGNMENTS,
  P154_DEFAULT_MAX_SENDS,
} from "@/lib/p154-controlled-production-autopilot-activation/types";

describe("P154 controlled production autopilot", () => {
  it("reads P154 feature flag from env", () => {
    assert.equal(isP154ControlledProductionAutopilotEnabled({}), false);
    assert.equal(
      isP154ControlledProductionAutopilotEnabled({ P154_CONTROLLED_PRODUCTION_AUTOPILOT_ENABLED: "true" }),
      true,
    );
  });

  it("uses production-safe default limits", () => {
    assert.equal(getP154MaxAssignmentsPerCycle({}), P154_DEFAULT_MAX_ASSIGNMENTS);
    assert.equal(getP154MaxSendsPerCycle({}), P154_DEFAULT_MAX_SENDS);
    assert.equal(
      getP154MaxAssignmentsPerCycle({ P154_MAX_RECRUITER_ASSIGNMENTS_PER_CYCLE: "12" }),
      12,
    );
    assert.equal(getP154MaxSendsPerCycle({ P154_MAX_PAPERWORK_SENDS_PER_CYCLE: "3" }), 3);
  });

  it("enables all autopilot features by default", () => {
    const features = defaultAutopilotEnabledFeatures();
    assert.equal(features.p151RecruiterAssignment, true);
    assert.equal(features.p152ImmediatePaperwork, true);
    assert.equal(features.freshIngestionRescue, true);
    assert.equal(features.duplicatePrevention, true);
    assert.equal(features.webhookCompletionProcessing, true);
  });
});
