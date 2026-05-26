import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeJobLocationFields } from "@/lib/job-management/normalize-job-location-fields";

describe("normalizeJobLocationFields", () => {
  it("splits city and state when city contains a comma", () => {
    const result = normalizeJobLocationFields("Dallas, TX", "");
    assert.equal(result.city, "Dallas");
    assert.equal(result.usState, "TX");
    assert.equal(result.displayLocation, "Dallas, TX");
    assert.equal(result.wasSplit, true);
  });

  it("keeps city-only values separate from state field", () => {
    const result = normalizeJobLocationFields("Houston", "TX");
    assert.equal(result.city, "Houston");
    assert.equal(result.usState, "TX");
    assert.equal(result.displayLocation, "Houston, TX");
    assert.equal(result.wasSplit, false);
  });

  it("trims stray commas from city input", () => {
    const result = normalizeJobLocationFields("  Austin , ", "TX");
    assert.equal(result.city, "Austin");
    assert.equal(result.displayLocation, "Austin, TX");
  });

  it("flags invalid non-US states", () => {
    const result = normalizeJobLocationFields("Chicago", "Ontario");
    assert.equal(result.stateInvalid, true);
    assert.equal(result.usState, "");
  });
});
