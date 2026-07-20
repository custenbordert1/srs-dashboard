import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  countAuthoritativeJobs,
  expectedDmForCityState,
  hasAuthoritativeGeoPosting,
  isAuthoritativeBreezyLocationSource,
  remainingTitleParsingForGeography,
  resolveAuthoritativePostingGeography,
  resolveP216Routing,
  P216_TITLE_PARSING_INVENTORY,
} from "@/lib/p216-position-location-authority";
import { getDmForState } from "@/lib/dm-territory-map";
import { evaluateP214Gates } from "@/lib/p214-unsent-test-batch/eligibility";

describe("P216 authoritative location sources", () => {
  it("accepts Position.Location sources as authoritative", () => {
    assert.equal(isAuthoritativeBreezyLocationSource("location.city+location.state"), true);
    assert.equal(isAuthoritativeBreezyLocationSource("location.name"), true);
    assert.equal(isAuthoritativeBreezyLocationSource("address"), true);
    assert.equal(isAuthoritativeBreezyLocationSource("top_level.city+region"), true);
    assert.equal(isAuthoritativeBreezyLocationSource("location_string"), true);
  });

  it("rejects job_name and missing as authoritative", () => {
    assert.equal(isAuthoritativeBreezyLocationSource("job_name"), false);
    assert.equal(isAuthoritativeBreezyLocationSource("missing"), false);
    assert.equal(isAuthoritativeBreezyLocationSource(null), false);
    assert.equal(isAuthoritativeBreezyLocationSource(""), false);
  });
});

describe("P216 resolveAuthoritativePostingGeography", () => {
  it("keeps city/state when source is Position.Location", () => {
    const g = resolveAuthoritativePostingGeography({
      positionId: "73048dbe5519",
      positionName: "Retail Merchandiser (Flexible, Project-Based Work)",
      city: "Columbus",
      state: "OH",
      locationSource: "location.city+location.state",
    });
    assert.equal(g.authoritative, true);
    assert.equal(g.city, "Columbus");
    assert.equal(g.state, "OH");
  });

  it("strips title-derived geography even when city/state were filled from the title", () => {
    const g = resolveAuthoritativePostingGeography({
      positionName: "Experienced Retail Merchandiser – LAWTON, OK",
      city: "LAWTON",
      state: "OK",
      locationSource: "job_name",
    });
    assert.equal(g.authoritative, false);
    assert.equal(g.city, "");
    assert.equal(g.state, "");
    assert.equal(g.locationSource, "job_name");
  });

  it("treats incomplete location as non-authoritative", () => {
    const g = resolveAuthoritativePostingGeography({
      city: "Columbus",
      state: "",
      locationSource: "location.city+location.state",
    });
    assert.equal(g.authoritative, false);
    assert.equal(g.city, "");
  });

  it("preserves position identity fields when geography is stripped", () => {
    const g = resolveAuthoritativePostingGeography({
      positionId: "abc",
      positionName: "Flexible Work",
      positionStatus: "closed",
      locationSource: "job_name",
      city: "X",
      state: "OH",
    });
    assert.equal(g.positionId, "abc");
    assert.equal(g.positionName, "Flexible Work");
    assert.equal(g.positionStatus, "closed");
  });
});

describe("P216 routing hierarchy (Position.Location → Home → DM)", () => {
  it("routes Columbus, OH → Mindie Rodriguez from Position.Location", () => {
    const r = resolveP216Routing(
      {
        city: "Columbus",
        state: "OH",
        locationSource: "location.city+location.state",
        homeState: "TX",
      },
      (s) => getDmForState(s),
    );
    assert.equal(r.posting.authoritative, true);
    assert.equal(r.routingState, "OH");
    assert.equal(r.expectedDm, "Mindie Rodriguez");
    assert.equal(r.usedHomeFallback, false);
  });

  it("routes Kansas City, MO → Amy Harp from Position.Location", () => {
    const r = resolveP216Routing(
      {
        city: "Kansas City",
        state: "MO",
        locationSource: "location.city+location.state",
        homeState: "OH",
      },
      (s) => getDmForState(s),
    );
    assert.equal(r.routingState, "MO");
    assert.equal(r.expectedDm, "Amy Harp");
  });

  it("falls back to candidate home state when Position.Location is absent", () => {
    const r = resolveP216Routing(
      {
        locationSource: "job_name",
        city: "Fake",
        state: "OK",
        homeState: "OH",
      },
      (s) => getDmForState(s),
    );
    assert.equal(r.posting.authoritative, false);
    assert.equal(r.usedHomeFallback, true);
    assert.equal(r.routingState, "OH");
    assert.equal(r.expectedDm, "Mindie Rodriguez");
  });

  it("does not invent a DM when neither posting nor home has a state", () => {
    const r = resolveP216Routing({ locationSource: "missing" }, (s) => getDmForState(s));
    assert.equal(r.routingState, "");
    assert.equal(r.expectedDm, "");
  });

  it("matches the P215 expected city→DM map", () => {
    assert.equal(expectedDmForCityState("Columbus", "OH"), "Mindie Rodriguez");
    assert.equal(expectedDmForCityState("Kansas City", "MO"), "Amy Harp");
    assert.equal(expectedDmForCityState("Nowhere", "ZZ"), null);
  });
});

describe("P216 geo-posting gate", () => {
  it("accepts authoritative Position.Location", () => {
    assert.equal(
      hasAuthoritativeGeoPosting({
        authoritative: true,
        city: "Columbus",
        state: "OH",
      }),
      true,
    );
  });

  it("rejects title-only geography", () => {
    assert.equal(
      hasAuthoritativeGeoPosting({
        authoritative: false,
        city: "",
        state: "",
      }),
      false,
    );
  });

  it("allows independent market verification override", () => {
    assert.equal(
      hasAuthoritativeGeoPosting({ authoritative: false, city: "", state: "" }, true),
      true,
    );
  });
});

describe("P216 × P214 gates — title no longer blocks geo when Position.Location present", () => {
  it("clears blocked_non_geographic_posting when Position.Location city/state are passed", () => {
    const r = evaluateP214Gates({
      nearestActiveWorkMiles: 5,
      hasActiveOpportunities: true,
      coverageKnown: true,
      assignedDm: "Mindie Rodriguez",
      expectedDm: "Mindie Rodriguez",
      jobCity: "Columbus",
      jobState: "OH",
    });
    assert.equal(r.eligible, true);
    assert.ok(!r.blockers.includes("blocked_non_geographic_posting"));
  });

  it("still blocks non-geographic when authoritative geography is empty", () => {
    const r = evaluateP214Gates({
      nearestActiveWorkMiles: 5,
      hasActiveOpportunities: true,
      coverageKnown: true,
      assignedDm: "Mindie Rodriguez",
      expectedDm: "Mindie Rodriguez",
      jobCity: "",
      jobState: "",
    });
    assert.equal(r.eligible, false);
    assert.ok(r.blockers.includes("blocked_non_geographic_posting"));
  });

  it("still blocks dm_unassigned even with correct Position.Location", () => {
    const r = evaluateP214Gates({
      nearestActiveWorkMiles: 5,
      hasActiveOpportunities: true,
      coverageKnown: true,
      assignedDm: "Unassigned",
      expectedDm: "Mindie Rodriguez",
      jobCity: "Columbus",
      jobState: "OH",
    });
    assert.equal(r.eligible, false);
    assert.ok(r.blockers.includes("blocked_dm_unassigned"));
    assert.ok(!r.blockers.includes("blocked_non_geographic_posting"));
  });

  it("still blocks wrong DM", () => {
    const r = evaluateP214Gates({
      nearestActiveWorkMiles: 5,
      hasActiveOpportunities: true,
      coverageKnown: true,
      assignedDm: "Amy Harp",
      expectedDm: "Mindie Rodriguez",
      jobCity: "Columbus",
      jobState: "OH",
    });
    assert.ok(r.blockers.includes("blocked_dm_wrong"));
  });

  it("still applies coverage tiers independently of posting geography", () => {
    const far = evaluateP214Gates({
      nearestActiveWorkMiles: 75,
      hasActiveOpportunities: true,
      coverageKnown: true,
      assignedDm: "Mindie Rodriguez",
      expectedDm: "Mindie Rodriguez",
      jobCity: "Columbus",
      jobState: "OH",
    });
    assert.ok(far.blockers.includes("blocked_over_60_miles"));
    assert.equal(far.tier, "out_of_range");
  });
});

describe("P216 title-parsing audit inventory", () => {
  it("lists known title-parsing sites", () => {
    assert.ok(P216_TITLE_PARSING_INVENTORY.length >= 5);
  });

  it("has no remaining must_not_drive_geography occurrences after P216 fixes", () => {
    assert.deepEqual(remainingTitleParsingForGeography(), []);
  });

  it("counts authoritative vs title-only jobs", () => {
    const s = countAuthoritativeJobs([
      { city: "Columbus", state: "OH", locationSource: "location.city+location.state" },
      { city: "LAWTON", state: "OK", locationSource: "job_name" },
      { city: "", state: "", locationSource: "missing" },
    ]);
    assert.equal(s.total, 3);
    assert.equal(s.authoritative, 1);
    assert.equal(s.titleOnly, 1);
    assert.equal(s.missing, 1);
  });
});

describe("P216 end-to-end resolution for the two P215 candidates", () => {
  it("John (Columbus) resolves Position.Location + expected DM correctly", () => {
    const r = resolveP216Routing(
      {
        positionId: "73048dbe5519",
        positionName: "Retail Merchandiser (Flexible, Project-Based Work)",
        city: "Columbus",
        state: "OH",
        locationSource: "location.city+location.state",
        homeCity: "Columbus",
        homeState: "OH",
      },
      (s) => getDmForState(s),
    );
    assert.equal(r.posting.authoritative, true);
    assert.equal(hasAuthoritativeGeoPosting(r.posting), true);
    assert.equal(r.expectedDm, "Mindie Rodriguez");
    assert.equal(expectedDmForCityState(r.posting.city, r.posting.state), "Mindie Rodriguez");
  });

  it("Kathy (Kansas City) resolves Position.Location + expected DM correctly", () => {
    const r = resolveP216Routing(
      {
        positionId: "f2ca3cdaeee8",
        positionName: "Retail Merchandiser (Flexible, Project-Based Work)",
        city: "Kansas City",
        state: "MO",
        locationSource: "location.city+location.state",
        homeCity: "Kansas City",
        homeState: "MO",
      },
      (s) => getDmForState(s),
    );
    assert.equal(r.posting.authoritative, true);
    assert.equal(r.expectedDm, "Amy Harp");
    assert.equal(expectedDmForCityState(r.posting.city, r.posting.state), "Amy Harp");
  });

  it("normalizeBreezyJobLocation no longer fills city/state from the title", async () => {
    const { normalizeBreezyJobLocation } = await import("@/lib/breezy-job-location");
    const loc = normalizeBreezyJobLocation({
      name: "Experienced Retail Merchandiser – LAWTON, OK",
      state: "published",
    });
    assert.equal(loc.locationSource, "job_name");
    assert.equal(loc.city, "");
    assert.equal(loc.state, "");
  });

  it("normalizeBreezyJobLocation still prefers Position.Location over the title", async () => {
    const { normalizeBreezyJobLocation } = await import("@/lib/breezy-job-location");
    const loc = normalizeBreezyJobLocation({
      name: "Retail Merchandiser (Flexible, Project-Based Work)",
      state: "closed",
      location: {
        city: "Columbus",
        state: { id: "OH", name: "Ohio" },
        name: "Columbus, OH",
      },
    });
    assert.equal(loc.locationSource, "location.city+location.state");
    assert.equal(loc.city, "Columbus");
    assert.equal(loc.state, "OH");
  });
});
