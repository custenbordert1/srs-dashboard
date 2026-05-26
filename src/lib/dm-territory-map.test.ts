import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DISTRICT_MANAGERS,
  DM_TERRITORY_MAP,
  getAssignedStatesForDm,
  getDmForState,
} from "@/lib/dm-territory-map";

const EXPECTED: Record<string, string[]> = {
  "Amy Harp": ["CO", "KS", "MO", "NE", "OK", "TX"],
  "Mindie Rodriguez": ["OH", "PA", "VA", "WV"],
  "Erin Boatright": ["AL", "FL", "GA", "LA", "MS", "NC", "SC"],
  "Lori VandeWiele": ["AR", "IA", "IN", "KY", "MN", "ND", "SD", "TN", "WI"],
  "Melissa O'Connor": ["CT", "DC", "DE", "MA", "MD", "ME", "NH", "NJ", "NY", "RI", "VT"],
  "Shelly Debellis": ["AK", "AZ", "CA", "HI", "ID", "MT", "NM", "NV", "UT", "WY"],
  "Trista Thomas": ["IL", "MI", "OR", "WA"],
};

describe("dm-territory-map", () => {
  it("lists all district managers", () => {
    assert.equal(DISTRICT_MANAGERS.length, 7);
    for (const name of Object.keys(EXPECTED)) {
      assert.ok(DISTRICT_MANAGERS.includes(name as (typeof DISTRICT_MANAGERS)[number]));
    }
  });

  it("maps each state to the correct DM", () => {
    for (const [dm, states] of Object.entries(EXPECTED)) {
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
