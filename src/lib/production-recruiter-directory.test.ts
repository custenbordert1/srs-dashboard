import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEMO_RECRUITER_NAMES,
  buildProductionRecruiterSelectorOptions,
  resolveActingRecruiter,
  scrubDemoRecruiters,
} from "@/lib/production-recruiter-directory";
import { DEFAULT_RECRUITER_ROSTER } from "@/lib/candidate-workflow-types";
import { mergeRecruiterRoster } from "@/lib/recruiter-assignment-engine/recruiter-territory-eligibility";

describe("P203.1 production recruiter directory", () => {
  it("excludes demo names from roster-only input", () => {
    const options = buildProductionRecruiterSelectorOptions({
      roster: [...DEMO_RECRUITER_NAMES, "Taylor", "Unassigned", "Recruiting Team", "Alex"],
    });
    for (const demo of DEMO_RECRUITER_NAMES) {
      assert.equal(options.includes(demo), false, `demo ${demo} must not appear`);
    }
    assert.deepEqual(options, ["Unassigned", "Recruiting Team", "Taylor"]);
  });

  it("keeps a former demo name only when listed in the production directory", () => {
    const options = buildProductionRecruiterSelectorOptions({
      directory: ["Alex"],
      roster: ["Alex", "Taylor"],
    });
    assert.equal(options.includes("Alex"), true);
    assert.equal(options.includes("Jordan"), false);
  });

  it("dedupes, sorts alphabetically after Unassigned, and keeps directory extras", () => {
    const options = buildProductionRecruiterSelectorOptions({
      directory: ["Zoe", "Taylor", "Ada"],
      roster: ["Taylor", "Ada", "Unassigned"],
    });
    assert.deepEqual(options, ["Unassigned", "Ada", "Recruiting Team", "Taylor", "Zoe"]);
  });

  it("omits Recruiting Team when disabled", () => {
    const options = buildProductionRecruiterSelectorOptions({
      roster: ["Taylor", "Recruiting Team"],
      includeRecruitingTeam: false,
    });
    assert.equal(options.includes("Recruiting Team"), false);
    assert.deepEqual(options, ["Unassigned", "Taylor"]);
  });

  it("excludes inactive recruiters", () => {
    const options = buildProductionRecruiterSelectorOptions({
      directory: ["Taylor", "Pat"],
      inactive: ["Pat"],
    });
    assert.equal(options.includes("Pat"), false);
  });

  it("DEFAULT_RECRUITER_ROSTER has no demo names", () => {
    for (const demo of DEMO_RECRUITER_NAMES) {
      assert.equal((DEFAULT_RECRUITER_ROSTER as readonly string[]).includes(demo), false);
    }
  });

  it("mergeRecruiterRoster no longer injects demos", () => {
    const merged = mergeRecruiterRoster(["Taylor"]);
    for (const demo of DEMO_RECRUITER_NAMES) {
      assert.equal(merged.includes(demo), false);
    }
    assert.equal(merged.includes("Taylor"), true);
    assert.equal(merged.includes("Unassigned"), true);
  });

  it("resolveActingRecruiter prefers session, then logged-in, then Taylor", () => {
    const recruiters = scrubDemoRecruiters(["Unassigned", "Taylor", "Recruiting Team", "Ada"]);
    assert.equal(
      resolveActingRecruiter({
        recruiters,
        sessionStored: "Ada",
        loggedInRecruiter: "Taylor",
      }),
      "Ada",
    );
    assert.equal(
      resolveActingRecruiter({
        recruiters,
        sessionStored: "Alex",
        loggedInRecruiter: "Recruiting Team",
      }),
      "Recruiting Team",
    );
    assert.equal(
      resolveActingRecruiter({
        recruiters,
        sessionStored: "Alex",
        loggedInRecruiter: null,
      }),
      "Taylor",
    );
  });
});
