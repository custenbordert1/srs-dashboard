import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { JobManagementRow } from "@/lib/job-management/job-management-rows";
import {
  buildJobCommandCenterMetrics,
  buildJobCommandCenterPanelModel,
  buildJobCommandCenterPipeline,
  filterApplicantsForBreezyJob,
  type JobCommandCenterApplicantInput,
} from "@/lib/p257-job-command-center";

function applicant(
  partial: Partial<JobCommandCenterApplicantInput> &
    Pick<JobCommandCenterApplicantInput, "candidateId" | "positionId" | "workflowStatus">,
): JobCommandCenterApplicantInput {
  return {
    firstName: "Pat",
    lastName: partial.candidateId,
    email: `${partial.candidateId}@example.com`,
    city: "Dallas",
    state: "TX",
    ...partial,
  };
}

function breezyRow(overrides: Partial<JobManagementRow> = {}): JobManagementRow {
  return {
    rowId: "breezy:job-1",
    kind: "breezy",
    title: "Merchandiser Dallas",
    city: "Dallas",
    state: "TX",
    displayLocation: "Dallas, TX",
    status: "published",
    statusLabel: "Published",
    applicants: 3,
    postedDate: "2026-06-01T12:00:00.000Z",
    source: "Breezy",
    lastSynced: "2026-07-23T16:00:00.000Z",
    breezyJobId: "job-1",
    editable: false,
    canPush: false,
    canClone: true,
    canDelete: false,
    breezyJob: {
      breezyJobId: "job-1",
      title: "Merchandiser Dallas",
      city: "Dallas",
      usState: "TX",
      displayLocation: "Dallas, TX",
      pipelineStatus: "published",
      applicantCount: 3,
      postedDate: "2026-06-01T12:00:00.000Z",
      source: "Breezy",
      description: "Stock and reset shelves.",
    },
    ...overrides,
  };
}

describe("filterApplicantsForBreezyJob", () => {
  it("matches by positionId and position name fallback", () => {
    const matched = filterApplicantsForBreezyJob(
      [
        { candidateId: "a", email: "a@x.com", positionId: "job-1" },
        { candidateId: "b", email: "b@x.com", positionId: "other" },
        {
          candidateId: "c",
          email: "c@x.com",
          positionId: "unknown",
          positionName: "Merchandiser Dallas",
        },
      ],
      { jobId: "job-1", name: "Merchandiser Dallas" },
    );
    assert.deepEqual(
      matched.map((row) => row.candidateId),
      ["a", "c"],
    );
  });
});

describe("buildJobCommandCenterMetrics", () => {
  it("aggregates stage cards and average distance", () => {
    const applicants = [
      applicant({
        candidateId: "1",
        positionId: "job-1",
        workflowStatus: "Qualified",
        distanceMiles: 10,
      }),
      applicant({
        candidateId: "2",
        positionId: "job-1",
        workflowStatus: "Paperwork Needed",
        distanceMiles: 20,
      }),
      applicant({
        candidateId: "3",
        positionId: "job-1",
        workflowStatus: "Paperwork Sent",
        distanceMiles: 30,
      }),
      applicant({
        candidateId: "4",
        positionId: "job-1",
        workflowStatus: "Signed",
        city: "",
        state: "",
        distanceMiles: null,
      }),
      applicant({
        candidateId: "5",
        positionId: "job-1",
        workflowStatus: "Ready for MEL",
        distanceMiles: 40,
      }),
    ];

    const metrics = buildJobCommandCenterMetrics(applicants, { city: "Dallas", state: "TX" });
    assert.equal(metrics.applicants, 5);
    assert.equal(metrics.qualified, 1);
    assert.equal(metrics.paperworkNeeded, 1);
    assert.equal(metrics.paperworkSent, 1);
    assert.equal(metrics.signed, 1);
    assert.equal(metrics.readyForMel, 1);
    // Explicit distances 10/20/30/40 — applicant 4 has no location/distance sample.
    assert.equal(metrics.averageDistanceMiles, 25);
    assert.equal(metrics.distanceSampleSize, 4);
  });

  it("returns null average distance when no distances available", () => {
    const metrics = buildJobCommandCenterMetrics(
      [
        applicant({
          candidateId: "1",
          positionId: "job-1",
          workflowStatus: "Applied",
          city: "",
          state: "",
          distanceMiles: null,
        }),
      ],
      { city: "", state: "" },
    );
    assert.equal(metrics.averageDistanceMiles, null);
    assert.equal(metrics.distanceSampleSize, 0);
  });
});

describe("buildJobCommandCenterPipeline", () => {
  it("omits empty stages and preserves counts", () => {
    const pipeline = buildJobCommandCenterPipeline([
      applicant({ candidateId: "1", positionId: "job-1", workflowStatus: "Applied" }),
      applicant({ candidateId: "2", positionId: "job-1", workflowStatus: "Applied" }),
      applicant({ candidateId: "3", positionId: "job-1", workflowStatus: "Qualified" }),
    ]);
    assert.deepEqual(pipeline, [
      { status: "Applied", count: 2 },
      { status: "Qualified", count: 1 },
    ]);
  });
});

describe("buildJobCommandCenterPanelModel", () => {
  it("builds overview fields, metrics, applicants, and activity props", () => {
    const model = buildJobCommandCenterPanelModel({
      row: breezyRow(),
      applicants: [
        applicant({
          candidateId: "1",
          positionId: "job-1",
          workflowStatus: "Qualified",
          distanceMiles: 12,
          history: [
            {
              id: "h1",
              type: "status",
              message: "Moved to Qualified",
              createdAt: "2026-07-20T10:00:00.000Z",
            },
          ],
          paperworkSentAt: null,
        }),
        applicant({
          candidateId: "2",
          positionId: "job-1",
          workflowStatus: "Paperwork Sent",
          distanceMiles: 18,
          paperworkSentAt: "2026-07-21T10:00:00.000Z",
        }),
      ],
      options: { candidatesFromCache: true, workflowsLoaded: true },
    });

    assert.equal(model.overview.jobTitle, "Merchandiser Dallas");
    assert.equal(model.overview.project, "Merchandiser Dallas");
    assert.equal(model.overview.city, "Dallas");
    assert.equal(model.overview.state, "TX");
    assert.equal(model.overview.publishedOrDraft, "Published");
    assert.equal(model.overview.breezyJobId, "job-1");
    assert.equal(model.overview.applicantCount, 2);
    assert.match(model.overview.description, /Stock and reset/);
    assert.equal(model.metrics.qualified, 1);
    assert.equal(model.metrics.paperworkSent, 1);
    assert.equal(model.metrics.averageDistanceMiles, 15);
    assert.equal(model.applicants.length, 2);
    assert.ok(model.pipeline.some((bucket) => bucket.status === "Qualified" && bucket.count === 1));
    assert.ok(model.activity.some((item) => item.kind === "sync"));
    assert.ok(model.activity.some((item) => item.title === "Paperwork sent"));
    assert.ok(model.activity.some((item) => item.title === "Moved to Qualified"));
    assert.equal(model.source.workflowsLoaded, true);
    assert.ok(model.dataNotes.some((note) => /cached/i.test(note)));
  });

  it("notes empty pipeline for local drafts without breezy id", () => {
    const model = buildJobCommandCenterPanelModel({
      row: breezyRow({
        kind: "local_draft",
        breezyJobId: undefined,
        status: "draft",
        statusLabel: "Draft",
        applicants: null,
      }),
      applicants: [],
    });
    assert.equal(model.overview.publishedOrDraft, "Draft");
    assert.equal(model.overview.breezyJobId, null);
    assert.ok(model.dataNotes.some((note) => /no Breezy job ID/i.test(note)));
  });
});
