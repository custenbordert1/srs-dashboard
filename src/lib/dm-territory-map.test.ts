import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DM_TERRITORY_ASSIGNMENTS } from "@/lib/dm-portal/dm-territory-assignments";
import {
  DISTRICT_MANAGERS,
  DM_TERRITORY_MAP,
  getAssignedStatesForDm,
  getDmForState,
} from "@/lib/dm-territory-map";

describe("dm-territory-map", () => {
  it("lists all district managers", () => {
    assert.equal(DISTRICT_MANAGERS.length, 7);
    for (const name of Object.keys(DM_TERRITORY_ASSIGNMENTS)) {
      assert.ok(DISTRICT_MANAGERS.includes(name as (typeof DISTRICT_MANAGERS)[number]));
    }
  });

  it("maps each state to the correct DM", () => {
    for (const [dm, states] of Object.entries(DM_TERRITORY_ASSIGNMENTS)) {
      for (const state of states) {
        assert.equal(getDmForState(state), dm);
        assert.ok(getAssignedStatesForDm(dm).includes(state));
      }
    }
  });

  it("has no duplicate state assignments", () => {
    const seen = new Set<string>();
    for (const state of Object.keys(DM_TERRITORY_MAP)) {
      assert.ok(!seen.has(state), `duplicate state key ${state}`);
      seen.add(state);
    }
  });
});
