import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyJob } from "@/lib/breezy-api";
import { DEFAULT_P84_FEATURE_FLAGS } from "@/lib/autonomous-paperwork-send-engine/feature-flags-store";
import { canLiveSendPaperwork } from "@/lib/autonomous-paperwork-send-engine/feature-flags-store";
import { buildBreezyJobPublishReview } from "@/lib/breezy-job-publish-review/build-job-publish-review";
import {
  buildDuplicateJobIndex,
  findDuplicateFindings,
} from "@/lib/breezy-job-publish-review/detect-duplicate-jobs";
import type { P84UnlockRecoveryPlan } from "@/lib/p84-unlock-preview/types";

function job(
  patch: Partial<BreezyJob> & Pick<BreezyJob, "jobId" | "name" | "status">,
): BreezyJob {
  return {
    city: "Dallas",
    state: "TX",
    zip: "75001",
    displayLocation: "Dallas, TX",
    locationSource: "location",
    createdDate: "2026-06-01",
    updatedDate: patch.updatedDate ?? "2026-06-15",
    ...patch,
  } as BreezyJob;
}

function plan(patch: Partial<P84UnlockRecoveryPlan> & Pick<P84UnlockRecoveryPlan, "candidateId" | "positionId">): P84UnlockRecoveryPlan {
  return {
    candidateName: "Alex Rivera",
    breezyCandidateId: patch.candidateId,
    positionName: "Field Merchandiser",
    dmTerritory: "TX",
    suggestedDm: "DM South",
    recommendedRecruiter: "Taylor",
    recruiterAssignmentReason: "test",
    currentWorkflowStage: "Applied",
    breezyStage: "Applied",
    requiredFixes: [],
    jobMustBePublished: true,
    recruiterAssignmentMissing: true,
    p83ShouldAdvance: true,
    expectedP84ResultAfterFixes: "eligible",
    unlockScenarios: {
      jobPublishOnly: false,
      recruiterAssignmentOnly: false,
      p83AdvancementOnly: false,
      allOperationalFixes: true,
    },
    group: "unlockable",
    grade: "A",
    questionnaireReady: true,
    ...patch,
  };
}

describe("breezy-job-publish-review (P91)", () => {
  it("never enables live paperwork sends", () => {
    assert.equal(DEFAULT_P84_FEATURE_FLAGS.liveSend, false);
    assert.equal(canLiveSendPaperwork(DEFAULT_P84_FEATURE_FLAGS), false);
  });

  it("detects duplicate published ads for same title and location", () => {
    const jobs = [
      job({ jobId: "new", name: "Merchandiser", status: "published", updatedDate: "2026-06-20" }),
      job({ jobId: "old", name: "Merchandiser", status: "published", updatedDate: "2026-06-01" }),
    ];
    const index = buildDuplicateJobIndex(jobs);
    const findings = findDuplicateFindings(index);
    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.recommendedKeepActiveJobId, "new");
    assert.deepEqual(findings[0]?.duplicateJobIds, ["old"]);
  });

  it("assigns exactly one recommendation per job", () => {
    const closed = job({ jobId: "p-closed", name: "Merchandiser", status: "closed", city: "Dallas", state: "TX" });
    const report = buildBreezyJobPublishReview({
      unlockablePlans: [plan({ candidateId: "c1", positionId: "p-closed" })],
      publishedJobs: [],
      closedJobs: [closed],
      archivedJobs: [],
    });
    assert.equal(report.entries.length, 1);
    assert.equal(report.entries[0]?.recommendedAction, "reactivate");
    assert.equal(report.entries[0]?.autoApproveBlocked, false);
  });

  it("blocks publish when duplicate active ad exists", () => {
    const published = job({ jobId: "active", name: "Merchandiser", status: "published" });
    const closed = job({ jobId: "closed", name: "Merchandiser", status: "closed" });
    const report = buildBreezyJobPublishReview({
      unlockablePlans: [plan({ candidateId: "c1", positionId: "closed" })],
      publishedJobs: [published],
      closedJobs: [closed],
      archivedJobs: [],
    });
    const entry = report.entries[0];
    assert.equal(entry?.recommendedAction, "keep_closed");
    assert.equal(entry?.duplicateActiveJobId, "active");
    assert.equal(entry?.autoApproveBlocked, true);
    assert.equal(report.metrics.duplicateConflict, 1);
  });

  it("does not auto-approve duplicate published jobs", () => {
    const jobs = [
      job({ jobId: "new", name: "Merchandiser", status: "published", updatedDate: "2026-06-20" }),
      job({ jobId: "old", name: "Merchandiser", status: "published", updatedDate: "2026-06-01" }),
    ];
    const report = buildBreezyJobPublishReview({
      unlockablePlans: [plan({ candidateId: "c1", positionId: "old" })],
      publishedJobs: jobs,
      closedJobs: [],
      archivedJobs: [],
    });
    assert.equal(report.entries[0]?.recommendedAction, "review");
    assert.equal(report.entries[0]?.autoApproveBlocked, true);
  });
});
