import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyP215RootCause,
  classifyP215TitleKind,
  compareP215AgainstP214,
} from "@/lib/p215-position-resolution-audit/classify";
import { auditP215PositionMetadata } from "@/lib/p215-position-resolution-audit/metadata-audit";
import type { P215RootCauseEvidence } from "@/lib/p215-position-resolution-audit/types";

function evidence(overrides: Partial<P215RootCauseEvidence> = {}): P215RootCauseEvidence {
  return {
    attachedToPosition: true,
    hasPositionId: true,
    lookupSucceeded: true,
    positionFound: true,
    locationCity: "Columbus",
    locationState: "OH",
    titleKind: "flexible",
    ...overrides,
  };
}

describe("P215 title-kind heuristics", () => {
  it("detects flexible postings", () => {
    assert.equal(
      classifyP215TitleKind("Retail Merchandiser (Flexible, Project-Based Work)"),
      "flexible",
    );
    assert.equal(classifyP215TitleKind("As Needed Merchandiser"), "flexible");
  });

  it("detects national postings", () => {
    assert.equal(classifyP215TitleKind("National Retail Merchandiser"), "national");
    assert.equal(classifyP215TitleKind("Merchandiser — Nationwide"), "national");
    assert.equal(classifyP215TitleKind("Remote Merchandising Support"), "national");
  });

  it("detects geo-titled postings", () => {
    assert.equal(
      classifyP215TitleKind("Experienced Retail Merchandiser – LAWTON, OK"),
      "geo_titled",
    );
    assert.equal(classifyP215TitleKind("Store Merchandiser, N Little Rock, AR"), "geo_titled");
  });

  it("falls back to generic for titles without location or flexibility markers", () => {
    assert.equal(classifyP215TitleKind("Merchandiser - Experienced"), "generic");
    assert.equal(classifyP215TitleKind(""), "generic");
  });
});

describe("P215 root-cause classification (exactly one category)", () => {
  it("classifies POSITION_LOCATION_PRESENT when the resolved position has city+state", () => {
    assert.equal(classifyP215RootCause(evidence()), "POSITION_LOCATION_PRESENT");
  });

  it("classifies CANDIDATE_NOT_ATTACHED_TO_POSITION before anything else", () => {
    assert.equal(
      classifyP215RootCause(evidence({ attachedToPosition: false, hasPositionId: false })),
      "CANDIDATE_NOT_ATTACHED_TO_POSITION",
    );
  });

  it("classifies POSITION_ID_MISSING when attached but without an id", () => {
    assert.equal(
      classifyP215RootCause(evidence({ hasPositionId: false })),
      "POSITION_ID_MISSING",
    );
  });

  it("classifies POSITION_LOOKUP_FAILED on API failure", () => {
    assert.equal(
      classifyP215RootCause(evidence({ lookupSucceeded: false })),
      "POSITION_LOOKUP_FAILED",
    );
  });

  it("classifies POSITION_LOOKUP_FAILED when the position no longer exists (deleted/archived)", () => {
    assert.equal(
      classifyP215RootCause(evidence({ positionFound: false })),
      "POSITION_LOOKUP_FAILED",
    );
  });

  it("classifies LEGITIMATE_FLEXIBLE_POSTING only when location is truly empty", () => {
    assert.equal(
      classifyP215RootCause(evidence({ locationCity: "", locationState: "" })),
      "LEGITIMATE_FLEXIBLE_POSTING",
    );
  });

  it("classifies LEGITIMATE_NATIONAL_POSTING for empty-location national titles", () => {
    assert.equal(
      classifyP215RootCause(
        evidence({ locationCity: "", locationState: "", titleKind: "national" }),
      ),
      "LEGITIMATE_NATIONAL_POSTING",
    );
  });

  it("classifies POSITION_LOCATION_EMPTY for empty-location generic or geo-titled postings", () => {
    assert.equal(
      classifyP215RootCause(
        evidence({ locationCity: "", locationState: "", titleKind: "generic" }),
      ),
      "POSITION_LOCATION_EMPTY",
    );
    assert.equal(
      classifyP215RootCause(
        evidence({ locationCity: "", locationState: "", titleKind: "geo_titled" }),
      ),
      "POSITION_LOCATION_EMPTY",
    );
  });

  it("a partially filled location (city only) does not count as present", () => {
    assert.equal(
      classifyP215RootCause(evidence({ locationState: "" })),
      "LEGITIMATE_FLEXIBLE_POSTING",
    );
  });
});

describe("P215 comparison against P214", () => {
  it("marks P214 wrong when Position.Location was present all along", () => {
    const r = compareP215AgainstP214({
      rootCause: "POSITION_LOCATION_PRESENT",
      p214Blocker: "NON_GEOGRAPHIC_POSTING",
      locationCity: "Columbus",
      locationState: "OH",
    });
    assert.equal(r.p214Correct, false);
    assert.match(r.explanation, /parsed the position title instead of resolving Position\.Location/);
    assert.match(r.explanation, /Columbus, OH/);
  });

  it("marks P214 correct for genuinely empty locations", () => {
    for (const rootCause of [
      "POSITION_LOCATION_EMPTY",
      "LEGITIMATE_NATIONAL_POSTING",
      "LEGITIMATE_FLEXIBLE_POSTING",
    ] as const) {
      const r = compareP215AgainstP214({
        rootCause,
        p214Blocker: "NON_GEOGRAPHIC_POSTING",
        locationCity: "",
        locationState: "",
      });
      assert.equal(r.p214Correct, true, rootCause);
    }
  });

  it("marks P214 unverified when the position lookup failed", () => {
    const r = compareP215AgainstP214({
      rootCause: "POSITION_LOOKUP_FAILED",
      p214Blocker: "MISSING_JOB_LOCATION",
      locationCity: "",
      locationState: "",
    });
    assert.equal(r.p214Correct, false);
    assert.match(r.explanation, /lookup failed/i);
  });

  it("marks P214 correct when there is no position to resolve", () => {
    for (const rootCause of ["POSITION_ID_MISSING", "CANDIDATE_NOT_ATTACHED_TO_POSITION"] as const) {
      const r = compareP215AgainstP214({
        rootCause,
        p214Blocker: "MISSING_JOB_LOCATION",
        locationCity: "",
        locationState: "",
      });
      assert.equal(r.p214Correct, true, rootCause);
    }
  });

  it("marks UNKNOWN root causes as unverifiable", () => {
    const r = compareP215AgainstP214({
      rootCause: "UNKNOWN",
      p214Blocker: "NON_GEOGRAPHIC_POSTING",
      locationCity: "",
      locationState: "",
    });
    assert.equal(r.p214Correct, false);
  });
});

describe("P215 position metadata audit", () => {
  const positions = [
    { jobId: "1", name: "Merchandiser – Columbus, OH", city: "Columbus", state: "OH" },
    { jobId: "2", name: "Retail Merchandiser (Flexible, Project-Based Work)", city: "Kansas City", state: "MO" },
    { jobId: "3", name: "National Merchandiser", city: "", state: "" },
    { jobId: "4", name: "Merchandiser - Experienced", city: "Killeen", state: "" },
    { jobId: "5", name: "Store Reset Crew", city: "", state: "TX" },
  ];

  it("counts totals and valid locations", () => {
    const s = auditP215PositionMetadata(positions);
    assert.equal(s.totalPositions, 5);
    assert.equal(s.withValidLocation, 2);
    assert.equal(s.withoutLocation, 3);
  });

  it("counts missing city and missing state independently", () => {
    const s = auditP215PositionMetadata(positions);
    assert.equal(s.missingCity, 2);
    assert.equal(s.missingState, 2);
  });

  it("counts flexible and national postings by title", () => {
    const s = auditP215PositionMetadata(positions);
    assert.equal(s.flexiblePostings, 1);
    assert.equal(s.nationalPostings, 1);
  });

  it("handles an empty position list", () => {
    const s = auditP215PositionMetadata([]);
    assert.equal(s.totalPositions, 0);
    assert.equal(s.withValidLocation, 0);
    assert.equal(s.withoutLocation, 0);
  });

  it("treats whitespace-only city/state as missing", () => {
    const s = auditP215PositionMetadata([
      { jobId: "x", name: "Merchandiser", city: "  ", state: " " },
    ]);
    assert.equal(s.withValidLocation, 0);
    assert.equal(s.missingCity, 1);
    assert.equal(s.missingState, 1);
  });
});
