import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildApplicantCountByBreezyJobId,
} from "@/lib/job-management/job-applicant-counts-core";
import { enrichCatalogRowsWithApplicantCounts } from "@/lib/job-management/job-applicant-counts";
import type { BreezyJobCatalogRow } from "@/lib/job-management/job-draft-types";

function job(id: string, friendlyId?: string) {
  return { jobId: id, friendlyId };
}

function candidate(positionId: string, candidateId: string, positionName?: string) {
  return {
    candidateId,
    email: `${candidateId}@example.com`,
    positionId,
    positionName,
  };
}

function catalogRow(breezyJobId: string, applicantCount: number | null): BreezyJobCatalogRow {
  return {
    breezyJobId,
    title: `Role ${breezyJobId}`,
    city: "Dallas",
    usState: "TX",
    displayLocation: "Dallas, TX",
    pipelineStatus: "published",
    applicantCount,
    postedDate: "2026-05-01",
    source: "Breezy",
  };
}

describe("buildApplicantCountByBreezyJobId", () => {
  it("counts unique candidates per job, resolves friendlyId, and matches position name", () => {
    const jobs = [
      { jobId: "mongo-1", friendlyId: "friendly-1", name: "Merchandiser Dallas" },
      { jobId: "mongo-2", name: "Retail Associate" },
    ];
    const candidates = [
      candidate("friendly-1", "c-1"),
      candidate("friendly-1", "c-2"),
      candidate("mongo-2", "c-3"),
      candidate("friendly-1", "c-1"),
      candidate("unknown-id", "c-4", "Retail Associate"),
    ];
    const counts = buildApplicantCountByBreezyJobId(candidates, jobs);
    assert.equal(counts.get("mongo-1"), 2);
    assert.equal(counts.get("mongo-2"), 2);
  });
});

describe("enrichCatalogRowsWithApplicantCounts", () => {
  it("leaves rows unchanged when no candidate cache is available", () => {
    const rows = [catalogRow("job-a", null), catalogRow("job-b", 2)];
    const result = enrichCatalogRowsWithApplicantCounts(rows, [
      {
        jobId: "job-a",
        name: "A",
        city: "Dallas",
        state: "TX",
        displayLocation: "Dallas, TX",
        status: "published",
        createdDate: "2026-05-01",
        updatedDate: "2026-05-02",
        source: "Breezy",
      },
      {
        jobId: "job-b",
        name: "B",
        city: "Dallas",
        state: "TX",
        displayLocation: "Dallas, TX",
        status: "published",
        createdDate: "2026-05-01",
        updatedDate: "2026-05-02",
        source: "Breezy",
      },
    ]);
    assert.equal(result.source, "breezy_list");
    assert.equal(result.jobs[0]?.applicantCount, null);
    assert.equal(result.jobs[1]?.applicantCount, 2);
  });
});
