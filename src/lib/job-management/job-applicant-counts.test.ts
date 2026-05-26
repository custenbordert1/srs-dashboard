import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import {
  buildApplicantCountByBreezyJobId,
  enrichCatalogRowsWithApplicantCounts,
} from "@/lib/job-management/job-applicant-counts";
import type { BreezyJobCatalogRow } from "@/lib/job-management/job-draft-types";

function job(id: string, friendlyId?: string): BreezyJob {
  return {
    jobId: id,
    friendlyId,
    name: `Role ${id}`,
    city: "Dallas",
    state: "TX",
    displayLocation: "Dallas, TX",
    status: "published",
    createdDate: "2026-05-01",
    updatedDate: "2026-05-02",
    source: "Breezy",
  };
}

function candidate(positionId: string, candidateId: string): BreezyCandidate {
  return {
    candidateId,
    firstName: "A",
    lastName: "B",
    email: `${candidateId}@example.com`,
    phone: "",
    source: "",
    stage: "",
    appliedDate: "2026-05-01",
    createdDate: "2026-05-01",
    addedDate: "2026-05-01",
    updatedDate: "2026-05-01",
    addedDateSource: "creation_date",
    positionId,
    positionName: "Role",
    city: "Dallas",
    state: "TX",
    zipCode: "",
    resumeText: "",
    hasResume: false,
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
  it("counts unique candidates per job and resolves friendlyId", () => {
    const jobs = [job("mongo-1", "friendly-1"), job("mongo-2")];
    const candidates = [
      candidate("friendly-1", "c-1"),
      candidate("friendly-1", "c-2"),
      candidate("mongo-2", "c-3"),
      candidate("friendly-1", "c-1"),
    ];
    const counts = buildApplicantCountByBreezyJobId(candidates, jobs);
    assert.equal(counts.get("mongo-1"), 2);
    assert.equal(counts.get("mongo-2"), 1);
  });
});

describe("enrichCatalogRowsWithApplicantCounts", () => {
  it("leaves rows unchanged when no candidate cache is available", () => {
    const rows = [catalogRow("job-a", null), catalogRow("job-b", 2)];
    const result = enrichCatalogRowsWithApplicantCounts(rows, [job("job-a"), job("job-b")]);
    assert.equal(result.source, "breezy_list");
    assert.equal(result.jobs[0]?.applicantCount, null);
    assert.equal(result.jobs[1]?.applicantCount, 2);
  });
});
