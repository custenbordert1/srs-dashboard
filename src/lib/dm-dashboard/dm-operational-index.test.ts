import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import { buildDmOperationalIndex, parseCityLabelToKey } from "@/lib/dm-dashboard/build-dm-operational-index";
import type { DmPrioritizedAlert } from "@/lib/dm-dashboard/dm-alert-priority";

const referenceIso = "2026-05-26T12:00:00.000Z";

function job(overrides: Partial<BreezyJob> = {}): BreezyJob {
  return {
    jobId: "job-1",
    name: "Retail Merchandiser",
    city: "Dallas",
    state: "TX",
    zip: "",
    displayLocation: "Dallas, TX",
    locationSource: "location",
    status: "published",
    createdDate: "2026-04-01T00:00:00.000Z",
    updatedDate: "2026-04-01T00:00:00.000Z",
    payRate: "$18–22/hr",
    ...overrides,
  };
}

function candidate(overrides: Partial<BreezyCandidate> = {}): BreezyCandidate {
  return {
    candidateId: "c-1",
    positionId: "job-1",
    positionName: "Retail Merchandiser",
    firstName: "Sam",
    lastName: "Lee",
    email: "sam@example.com",
    stage: "interview",
    source: "Indeed",
    appliedDate: "2026-05-20T00:00:00.000Z",
    city: "Dallas",
    state: "TX",
    ...overrides,
  };
}

function alert(overrides: Partial<DmPrioritizedAlert> = {}): DmPrioritizedAlert {
  return {
    id: "alert-1",
    severity: "critical",
    category: "no-applicants-7d",
    title: "No applicants",
    detail: "Dry job",
    jobId: "job-1",
    priority: "critical",
    priorityScore: 420,
    recommendedAction: "Increase pay range",
    ageDays: 20,
    alertTypeLabel: "No recent applicants",
    ...overrides,
  };
}

describe("buildDmOperationalIndex", () => {
  it("indexes job operational metrics from snapshot data", () => {
    const index = buildDmOperationalIndex(
      [job()],
      [candidate()],
      [alert()],
      referenceIso,
      {
        "c-1": {
          candidateId: "c-1",
          workflowStatus: "Applied",
          assignedRecruiter: "Alex Recruiter",
          assignedDM: "",
          notes: [],
          history: [],
          recruitingActions: {},
          followUpDueAt: null,
          snoozedUntil: null,
        },
      },
    );
    const detail = index.jobsById["job-1"];
    assert.ok(detail);
    assert.equal(detail.applicantCount, 1);
    assert.equal(detail.interviewingCount, 1);
    assert.equal(detail.payRange, "$18–22/hr");
    assert.equal(detail.assignedRecruiter, "Alex Recruiter");
    assert.equal(detail.priority, "critical");
  });

  it("parses city chart labels into city keys", () => {
    assert.equal(parseCityLabelToKey("Dallas, TX"), "Dallas, TX");
  });
});
