import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyJobCatalogRow } from "@/lib/job-management/job-draft-types";
import {
  assertVariantTitleDiversity,
  buildVariantDescription,
  generateJobAdVariants,
  hashJobDescription,
  isLockedDescriptionLine,
} from "@/lib/job-management/job-ad-variation-engine";
import { variantPushBlockReason } from "@/lib/job-management/job-variant-push-guard";
import { expandMetroCities } from "@/lib/job-management/job-metro-expansion";
import {
  canTransitionQueueStatus,
  filterVariantDrafts,
} from "@/lib/job-management/job-variant-queue";
import type { JobDraft } from "@/lib/job-management/job-draft-types";

function catalogRow(overrides: Partial<BreezyJobCatalogRow> = {}): BreezyJobCatalogRow {
  return {
    breezyJobId: "breezy-dallas-1",
    title: "Retail Merchandiser",
    city: "Dallas",
    usState: "TX",
    displayLocation: "Dallas, TX",
    pipelineStatus: "published",
    applicantCount: 4,
    postedDate: "2026-05-01T00:00:00.000Z",
    source: "Breezy HR API",
    description:
      "Support retail reset projects.\n- Stock shelves\n- Build displays\n- Travel locally\nPay: $18/hr",
    payRate: "$18/hr",
    department: "Field Ops",
    ...overrides,
  };
}

describe("job ad variation engine", () => {
  it("generates unique titles across variants", () => {
    const variants = generateJobAdVariants(catalogRow(), { variantCount: 5 });
    assert.equal(variants.length, 5);
    assert.equal(assertVariantTitleDiversity(variants), true);
  });

  it("preserves pay and department from source job", () => {
    const variants = generateJobAdVariants(catalogRow(), { variantCount: 3 });
    for (const variant of variants) {
      assert.equal(variant.payRate, "$18/hr");
      assert.equal(variant.department, "Field Ops");
      assert.ok(variant.description.includes("$18/hr"));
    }
  });

  it("maps Dallas template to metro cities with DM owner", () => {
    const cities = expandMetroCities("Dallas", "TX", 5);
    assert.ok(cities.includes("Fort Worth"));
    const variants = generateJobAdVariants(catalogRow(), { cityTargets: cities.slice(0, 3) });
    assert.equal(variants[0]?.dmOwner, "Amy Harp");
    assert.equal(variants[0]?.cityTarget, "Dallas");
  });

  it("preserves pay and contractor/compliance lines verbatim", () => {
    const base =
      "Independent contractor role.\n- Stock shelves\nPay: $18/hr\nEqual opportunity employer.";
    const description = buildVariantDescription({
      baseDescription: base,
      payRate: "$18/hr",
      cityTarget: "Dallas",
      usState: "TX",
      variantIndex: 1,
    });
    assert.ok(description.includes("Retail merchandising support in the Dallas, TX area."));
    assert.ok(description.includes("1099 independent contractor"));
    assert.ok(description.includes("as-needed gig scheduling"));
    assert.ok(description.includes("Pay: $18/hr"));
    assert.ok(description.includes("vary by client assignment"));
    assert.ok(isLockedDescriptionLine("Pay: $18/hr", "$18/hr"));
  });

  it("dedupes repeated Benefits sections from source description", () => {
    const base = [
      "Benefits",
      "- Health stipend",
      "What We Offer",
      "- Flexible schedule",
      "Benefits",
      "- Duplicate block",
    ].join("\n");
    const description = buildVariantDescription({
      baseDescription: base,
      payRate: "$19/hr",
      cityTarget: "Houston",
      usState: "TX",
      variantIndex: 0,
    });
    assert.ok(!description.includes("Duplicate block"));
    assert.ok(description.includes("$19/hr"));
  });

  it("produces stable description hashes", () => {
    const description = buildVariantDescription({
      baseDescription: "Line one\n- bullet",
      payRate: "$20/hr",
      cityTarget: "Plano",
      usState: "TX",
      variantIndex: 2,
    });
    assert.equal(hashJobDescription(description).length, 16);
  });
});

describe("job variant queue", () => {
  it("filters queue tabs and validates transitions", () => {
    const draft: JobDraft = {
      id: "d1",
      status: "draft",
      title: "Variant",
      description: "",
      city: "Dallas",
      usState: "TX",
      payRate: "$18/hr",
      department: "Field Ops",
      source: "SRS",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      variant: {
        variantGroupId: "g1",
        variantIndex: 0,
        sourceJobId: "src",
        generatedTitle: "Retail Merchandiser",
        generatedDescriptionHash: "abc",
        cityTarget: "Dallas",
        dmOwner: "Amy Harp",
        queueStatus: "pending",
      },
    };

    assert.equal(filterVariantDrafts([draft], "pending").length, 1);
    assert.equal(canTransitionQueueStatus("pending", "approved"), true);
    assert.equal(canTransitionQueueStatus("pending", "published"), false);

    const approved = { ...draft, variant: { ...draft.variant, queueStatus: "approved" as const } };
    const archived = { ...draft, variant: { ...draft.variant, queueStatus: "archived" as const } };
    assert.ok(variantPushBlockReason(draft));
    assert.ok(variantPushBlockReason(archived));
    assert.equal(variantPushBlockReason(approved), null);
  });
});
