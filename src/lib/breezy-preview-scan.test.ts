import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyJob } from "@/lib/breezy-api";
import { sortPublishedJobsForPreviewScan } from "@/lib/breezy-api";

function job(id: string, candidateCount?: number, updatedDate = "2026-05-20"): BreezyJob {
  return {
    jobId: id,
    name: id,
    city: "Dallas",
    state: "TX",
    zip: "",
    displayLocation: "Dallas, TX",
    locationSource: "location",
    status: "published",
    createdDate: "2026-05-01",
    updatedDate,
    candidateCount,
  };
}

describe("sortPublishedJobsForPreviewScan", () => {
  it("prefers positions with known candidate counts", () => {
    const ordered = sortPublishedJobsForPreviewScan([
      job("empty-recent", 0, "2026-05-22"),
      job("has-applicants", 12, "2026-05-10"),
      job("also-empty", 0, "2026-05-21"),
    ]);
    assert.equal(ordered[0]?.jobId, "has-applicants");
  });

  it("falls back to recent updates when counts tie", () => {
    const ordered = sortPublishedJobsForPreviewScan([
      job("older", 5, "2026-05-10"),
      job("newer", 5, "2026-05-22"),
    ]);
    assert.equal(ordered[0]?.jobId, "newer");
  });

  it("scans unknown applicant counts before known-empty jobs", () => {
    const ordered = sortPublishedJobsForPreviewScan([
      job("empty-recent", 0, "2026-05-22"),
      job("unknown", undefined, "2026-05-21"),
      job("has-applicants", 3, "2026-05-01"),
    ]);
    assert.equal(ordered[0]?.jobId, "has-applicants");
    assert.equal(ordered[1]?.jobId, "unknown");
    assert.equal(ordered[2]?.jobId, "empty-recent");
  });
});
