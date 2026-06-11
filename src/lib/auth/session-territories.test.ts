import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { refreshSessionTerritories } from "@/lib/auth/session-territories";
import type { AuthSession } from "@/lib/auth/types";
import { getAssignedStatesForDm } from "@/lib/dm-territory-map";

describe("refreshSessionTerritories", () => {
  it("replaces stale territory states from canonical map", () => {
    const session: AuthSession = {
      userId: "dm-amy",
      email: "amy@test.com",
      name: "Amy Harp",
      role: "dm",
      dmName: "Amy Harp",
      territoryStates: ["ZZ"],
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    };
    const refreshed = refreshSessionTerritories(session);
    assert.deepEqual(refreshed.territoryStates, getAssignedStatesForDm("Amy Harp"));
    assert.equal(refreshed.territoryStates.includes("TX"), true);
    assert.equal(refreshed.territoryStates.includes("ZZ"), false);
  });

  it("leaves recruiter sessions unchanged", () => {
    const session: AuthSession = {
      userId: "recruiter",
      email: "r@test.com",
      name: "Recruiter",
      role: "recruiter",
      territoryStates: [],
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    };
    assert.equal(refreshSessionTerritories(session), session);
  });
});
