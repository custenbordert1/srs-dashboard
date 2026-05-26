import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BREEZY_COUNTRY_CODE,
  formatUsDisplayLocation,
  resolveUsStateCode,
  sanitizeCityValue,
} from "@/lib/job-management/us-location-rules";

describe("BREEZY_COUNTRY_CODE", () => {
  it("is always US for SRS payloads", () => {
    assert.equal(BREEZY_COUNTRY_CODE, "US");
  });
});

describe("sanitizeCityValue", () => {
  it("trims commas and extra spaces from city", () => {
    assert.equal(sanitizeCityValue("  Dallas ,  "), "Dallas");
    assert.equal(sanitizeCityValue(",Austin,"), "Austin");
  });
});

describe("resolveUsStateCode", () => {
  it("normalizes full state names to 2-letter codes", () => {
    assert.deepEqual(resolveUsStateCode("Texas"), { code: "TX", invalid: false });
  });

  it("rejects non-US state values", () => {
    assert.deepEqual(resolveUsStateCode("Ontario"), { code: "", invalid: true });
    assert.deepEqual(resolveUsStateCode("ZZ"), { code: "", invalid: true });
  });
});

describe("formatUsDisplayLocation", () => {
  it("formats as City, ST", () => {
    assert.equal(formatUsDisplayLocation("Dallas", "TX"), "Dallas, TX");
  });
});
