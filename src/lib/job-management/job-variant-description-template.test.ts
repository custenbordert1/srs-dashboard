import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildLocationSpecificIntro,
  dedupeOfferSections,
  SRS_1099_CONTRACTOR_LINE,
} from "@/lib/job-management/job-variant-description-template";

describe("job-variant-description-template", () => {
  it("builds city-specific intro", () => {
    assert.equal(
      buildLocationSpecificIntro("Tampa", "FL"),
      "Retail merchandising support in the Tampa, FL area.",
    );
  });

  it("removes duplicate offer headers", () => {
    const lines = dedupeOfferSections([
      "Benefits",
      "- PTO",
      "What We Offer",
      "- Gear",
      "Benefits",
      "- Duplicate",
    ]);
    const text = lines.join("\n");
    assert.ok(!text.includes("Duplicate"));
  });

  it("includes SRS compliance strings", () => {
    assert.match(SRS_1099_CONTRACTOR_LINE, /1099/);
  });
});
