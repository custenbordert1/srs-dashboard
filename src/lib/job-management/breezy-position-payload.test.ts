import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { JobDraft } from "@/lib/job-management/job-draft-types";
import {
  buildBreezyPositionPayload,
  normalizeDraftTitleForBreezy,
  validateJobDraftForBreezyPush,
  verifyBreezyPositionResponse,
  BREEZY_COUNTRY_CODE,
} from "@/lib/job-management/breezy-position-payload";

function baseDraft(overrides: Partial<JobDraft> = {}): JobDraft {
  return {
    id: "draft-1",
    status: "draft",
    title: "Retail Merchandiser (Draft)",
    description: "Edited description for Breezy.",
    city: "Dallas",
    usState: "TX",
    payRate: "$18/hr",
    department: "Field Ops",
    source: "SRS Dashboard",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("validateJobDraftForBreezyPush", () => {
  it("blocks push when city, state, or description is missing", () => {
    const result = validateJobDraftForBreezyPush(
      baseDraft({ city: "", usState: "", description: "" }),
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.errors.city);
      assert.ok(result.errors.usState);
      assert.ok(result.errors.description);
    }
  });

  it("splits combined city field before validating push", () => {
    const result = validateJobDraftForBreezyPush(
      baseDraft({ city: "Dallas, TX", usState: "", description: "Body" }),
    );
    assert.equal(result.ok, true);
  });

  it("accepts valid city and state", () => {
    const result = validateJobDraftForBreezyPush(baseDraft());
    assert.equal(result.ok, true);
  });

  it("rejects invalid non-US state abbreviations", () => {
    const result = validateJobDraftForBreezyPush(
      baseDraft({ city: "Toronto", usState: "ON", description: "Body" }),
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.errors.usState);
    }
  });
});

describe("buildBreezyPositionPayload", () => {
  it("maps edited draft fields into Breezy payload", () => {
    const built = buildBreezyPositionPayload(baseDraft());
    assert.equal(built.ok, true);
    if (!built.ok) return;

    assert.equal(built.breezyTitle, "Retail Merchandiser");
    assert.equal(built.payload.name, "Retail Merchandiser");
    assert.equal(built.payload.description, "Edited description for Breezy.");
    assert.equal(built.payload.type, "fullTime");

    const location = built.payload.location as Record<string, unknown>;
    assert.equal(location.country, BREEZY_COUNTRY_CODE);
    assert.equal(location.city, "Dallas");
    assert.equal(location.state, "TX");
    assert.equal(location.is_remote, false);

    const attrs = built.payload.custom_attributes as Array<{ name: string; value: string }>;
    assert.equal(attrs[0]?.value, "$18/hr");
  });

  it("normalizes full state names to codes", () => {
    const built = buildBreezyPositionPayload(baseDraft({ usState: "Texas" }));
    assert.equal(built.ok, true);
    if (!built.ok) return;
    const location = built.payload.location as Record<string, unknown>;
    assert.equal(location.state, "TX");
  });
});

describe("normalizeDraftTitleForBreezy", () => {
  it("removes trailing (Draft) suffix for posted title", () => {
    assert.equal(normalizeDraftTitleForBreezy("Role Name (Draft)"), "Role Name");
  });
});

describe("verifyBreezyPositionResponse", () => {
  it("flags location mismatches from Breezy create response", () => {
    const verification = verifyBreezyPositionResponse(
      "pos-123",
      {
        name: "Retail Merchandiser",
        location: { country: BREEZY_COUNTRY_CODE, city: "Houston", state: "TX" },
      },
      { name: "Retail Merchandiser", city: "Dallas", state: "TX" },
    );
    assert.equal(verification.ok, false);
    assert.ok(verification.mismatches.some((m) => m.includes("city")));
  });

  it("flags pay rate mismatches from custom_attributes", () => {
    const verification = verifyBreezyPositionResponse(
      "pos-456",
      {
        name: "Retail Merchandiser",
        location: { country: BREEZY_COUNTRY_CODE, city: "Dallas", state: "TX" },
        custom_attributes: [{ name: "Pay Rate", value: "$16/hr", secure: false }],
      },
      { name: "Retail Merchandiser", city: "Dallas", state: "TX", payRate: "$18/hr" },
    );
    assert.equal(verification.ok, false);
    assert.ok(verification.mismatches.some((m) => m.includes("pay rate")));
  });
});
