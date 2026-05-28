import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { JobDraft } from "@/lib/job-management/job-draft-types";
import { reconcileJobDraftWithCatalog } from "@/lib/job-management/job-draft-reconcile";

const syncedAt = "2026-05-28T12:00:00.000Z";

function baseDraft(overrides: Partial<JobDraft> = {}): JobDraft {
  return {
    id: "draft-1",
    status: "pending_push",
    title: "Retail Merchandiser",
    description: "Body",
    city: "Dallas",
    usState: "TX",
    payRate: "",
    department: "",
    source: "SRS Dashboard",
    breezyJobId: "breezy-new",
    createdAt: syncedAt,
    updatedAt: syncedAt,
    ...overrides,
  };
}

describe("reconcileJobDraftWithCatalog", () => {
  it("recovers pending_push when Breezy catalog contains the job", () => {
    const outcome = reconcileJobDraftWithCatalog(
      baseDraft(),
      [
        {
          breezyJobId: "breezy-new",
          title: "Retail Merchandiser",
          city: "Dallas",
          usState: "TX",
          displayLocation: "Dallas, TX",
          pipelineStatus: "published",
          applicantCount: 0,
          postedDate: syncedAt,
          source: "Breezy",
        },
      ],
      syncedAt,
    );
    assert.equal(outcome.changed, true);
    assert.equal(outcome.draft.status, "published");
    assert.equal(outcome.reason, "recovered_published");
  });

  it("normalizes legacy pushed status to published", () => {
    const legacy = { ...baseDraft({ breezyJobId: undefined }), status: "pushed" as string };
    const outcome = reconcileJobDraftWithCatalog(legacy as JobDraft, [], syncedAt);
    assert.equal(outcome.draft.status, "published");
  });
});
