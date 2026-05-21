import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { JobDraft } from "@/lib/job-management/job-draft-types";
import {
  buildJobManagementRows,
  sortJobManagementRows,
} from "@/lib/job-management/job-management-rows";

const syncedAt = "2026-05-20T12:00:00.000Z";

describe("buildJobManagementRows", () => {
  it("hides breezy source row when an open local clone draft exists", () => {
    const breezyJobs = [
      {
        breezyJobId: "breezy-1",
        title: "Merchandiser",
        city: "Dallas, TX",
        usState: "",
        displayLocation: "Dallas, TX",
        pipelineStatus: "published",
        applicantCount: 3,
        postedDate: syncedAt,
        source: "Breezy",
      },
    ];
    const drafts: JobDraft[] = [
      {
        id: "draft-1",
        status: "draft",
        clonedFromBreezyJobId: "breezy-1",
        title: "Merchandiser (Draft)",
        description: "Edited body",
        city: "Dallas",
        usState: "TX",
        payRate: "",
        department: "",
        source: "SRS Dashboard",
        createdAt: syncedAt,
        updatedAt: syncedAt,
      },
    ];

    const rows = buildJobManagementRows(breezyJobs, drafts, syncedAt);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.kind, "local_draft");
    assert.equal(rows[0]?.city, "Dallas");
    assert.equal(rows[0]?.state, "TX");
  });
});

describe("sortJobManagementRows", () => {
  it("sorts by job title ascending", () => {
    const rows = buildJobManagementRows(
      [
        {
          breezyJobId: "a",
          title: "Zebra Role",
          city: "Austin",
          usState: "TX",
          displayLocation: "Austin, TX",
          pipelineStatus: "published",
          applicantCount: 1,
          postedDate: syncedAt,
          source: "Breezy",
        },
        {
          breezyJobId: "b",
          title: "Alpha Role",
          city: "Dallas",
          usState: "TX",
          displayLocation: "Dallas, TX",
          pipelineStatus: "published",
          applicantCount: 2,
          postedDate: syncedAt,
          source: "Breezy",
        },
      ],
      [],
      syncedAt,
    );
    const sorted = sortJobManagementRows(rows, "title", "asc");
    assert.equal(sorted[0]?.title, "Alpha Role");
    assert.equal(sorted[1]?.title, "Zebra Role");
  });
});
