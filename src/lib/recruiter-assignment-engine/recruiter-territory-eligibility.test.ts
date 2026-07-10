import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CANONICAL_RECRUITER_ROSTER,
  getTerritoryEligibleRecruiters,
  mergeRecruiterRoster,
  stableRecruiterTieBreak,
} from "@/lib/recruiter-assignment-engine/recruiter-territory-eligibility";

describe("recruiter-territory-eligibility", () => {
  it("maps OH to Mindie Rodriguez recruiter pool", () => {
    const eligible = getTerritoryEligibleRecruiters({
      territoryState: "OH",
      rosterRecruiters: mergeRecruiterRoster(["Taylor"]),
    });
    assert.deepEqual(eligible, ["Taylor", "Alex"]);
  });

  it("maps TX to Amy Harp recruiter pool", () => {
    const eligible = getTerritoryEligibleRecruiters({
      territoryState: "TX",
      rosterRecruiters: mergeRecruiterRoster(["Taylor"]),
    });
    assert.deepEqual(eligible, ["Jordan", "Morgan"]);
  });

  it("distributes tie-breaks across eligible recruiters", () => {
    const picks = new Set(
      ["c-1", "c-2", "c-3", "c-4", "c-5", "c-6"].map((id) =>
        stableRecruiterTieBreak(["Taylor", "Alex"], id),
      ),
    );
    assert.equal(picks.size >= 2, true);
  });

  it("merges canonical recruiters into roster", () => {
    const merged = mergeRecruiterRoster(["Taylor"]);
    for (const recruiter of CANONICAL_RECRUITER_ROSTER) {
      assert.equal(merged.includes(recruiter), true);
    }
  });
});
