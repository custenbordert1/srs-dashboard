import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { filterMelProjectsDataForSession } from "@/lib/auth/mel-projects-territory-filter";
import type { AuthSession } from "@/lib/auth/types";
import { getAssignedStatesForDm } from "@/lib/dm-territory-map";
import type { MelProjectsDataSuccess } from "@/lib/mel-projects-sheet";

function dmSession(dmName: string): AuthSession {
  return {
    userId: `dm-${dmName}`,
    email: "dm@test.com",
    name: dmName,
    role: "dm",
    dmName,
    territoryStates: getAssignedStatesForDm(dmName),
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  };
}

const sampleSheet: MelProjectsDataSuccess = {
  ok: true,
  headers: ["State", "Store", "Manager"],
  rows: [
    { State: "TX", Store: "A", Manager: "Amy Harp" },
    { State: "CA", Store: "B", Manager: "Shelly Debellis" },
  ],
  fetchedAt: new Date().toISOString(),
  csvUrl: "https://example.com",
};

describe("mel projects territory filter", () => {
  it("returns all rows for recruiter sessions", () => {
    const session: AuthSession = {
      userId: "recruiter",
      email: "r@test.com",
      name: "Recruiter",
      role: "recruiter",
      territoryStates: [],
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    };
    const filtered = filterMelProjectsDataForSession(sampleSheet, session);
    assert.equal(filtered.ok && filtered.rows.length, 2);
  });

  it("filters MEL rows to DM territory states", () => {
    const filtered = filterMelProjectsDataForSession(sampleSheet, dmSession("Amy Harp"));
    assert.ok(filtered.ok);
    assert.equal(filtered.rows.length, 1);
    assert.equal(filtered.rows[0]?.State, "TX");
  });
});
