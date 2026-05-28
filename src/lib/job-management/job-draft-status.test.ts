import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { JobDraft } from "@/lib/job-management/job-draft-types";
import {
  isJobDraftPublished,
  isJobDraftPushable,
  normalizeJobDraftStatus,
} from "@/lib/job-management/job-draft-status";

function draft(status: JobDraft["status"], breezyJobId?: string): JobDraft {
  return {
    id: "d1",
    status,
    title: "Role",
    description: "Body",
    city: "Dallas",
    usState: "TX",
    payRate: "",
    department: "",
    source: "SRS",
    breezyJobId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe("job-draft-status", () => {
  it("maps legacy pushed to published", () => {
    assert.equal(normalizeJobDraftStatus("pushed"), "published");
  });

  it("detects published drafts with breezy id", () => {
    assert.equal(isJobDraftPublished(draft("published", "job-1")), true);
    assert.equal(isJobDraftPublished(draft("published")), false);
  });

  it("allows push for draft and push_failed only", () => {
    assert.equal(isJobDraftPushable(draft("draft")), true);
    assert.equal(isJobDraftPushable(draft("push_failed")), true);
    assert.equal(isJobDraftPushable(draft("pending_push")), false);
  });
});
