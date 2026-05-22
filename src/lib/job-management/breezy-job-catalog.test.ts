import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { jobCatalogRowToDraftInput } from "@/lib/job-management/breezy-job-catalog";
import type { BreezyJobCatalogRow } from "@/lib/job-management/job-draft-types";

const sampleRow: BreezyJobCatalogRow = {
  breezyJobId: "breezy-99",
  title: "Merchandiser",
  city: "Plano, TX",
  usState: "",
  displayLocation: "Plano, TX",
  pipelineStatus: "published",
  applicantCount: 2,
  postedDate: "2026-01-01T00:00:00.000Z",
  source: "Breezy",
  description: "Role details",
  payRate: "$20/hr",
  department: "Retail",
};

describe("jobCatalogRowToDraftInput", () => {
  it("normalizes combined city/state and builds clone metadata", () => {
    const input = jobCatalogRowToDraftInput(sampleRow);
    assert.equal(input.clonedFromBreezyJobId, "breezy-99");
    assert.equal(input.city, "Plano");
    assert.equal(input.usState, "TX");
    assert.equal(input.payRate, "$20/hr");
    assert.match(input.title, /\(Draft\)$/);
    assert.equal(input.metadata.clonedFrom, "breezy-99");
  });
});
