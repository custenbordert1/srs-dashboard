import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyJob } from "@/lib/breezy-api";
import type { BreezyPositionFetchResult } from "@/lib/breezy-api";
import { DEFAULT_P84_FEATURE_FLAGS } from "@/lib/autonomous-paperwork-send-engine/feature-flags-store";
import { canLiveSendPaperwork } from "@/lib/autonomous-paperwork-send-engine/feature-flags-store";
import { buildBreezyJobStatusReconciliation } from "@/lib/breezy-job-status-reconciliation/build-job-status-reconciliation";
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

function liveFound(jobRecord: BreezyJob): BreezyPositionFetchResult {
  return {
    ok: true,
    found: true,
    job: jobRecord,
    positionId: jobRecord.jobId,
    fetchedAt: "2026-06-30T00:00:00.000Z",
    companyId: "co-1",
  };
}

function liveNotFound(positionId: string): BreezyPositionFetchResult {
  return {
    ok: true,
    found: false,
    positionId,
    fetchedAt: "2026-06-30T00:00:00.000Z",
    companyId: "co-1",
  };
}

describe("breezy-job-status-reconciliation (P92)", () => {
  it("never enables live paperwork sends", () => {
    assert.equal(DEFAULT_P84_FEATURE_FLAGS.liveSend, false);
    assert.equal(canLiveSendPaperwork(DEFAULT_P84_FEATURE_FLAGS), false);
  });

  it("assigns exactly one resolved status and recommendation per job", () => {
    const closed = job({ jobId: "p-closed", name: "Merchandiser", status: "closed" });
    const liveByPositionId = new Map([["p-closed", liveFound(closed)]]);
    const report = buildBreezyJobStatusReconciliation({
      unlockablePlans: [plan({ candidateId: "c1", positionId: "p-closed" })],
      publishedJobs: [],
      closedJobs: [closed],
      archivedJobs: [],
      draftJobs: [],
      liveByPositionId,
      liveFetchStats: { found: 1, notFound: 0, fetchErrors: 0 },
    });

    assert.equal(report.entries.length, 1);
    assert.equal(report.entries[0]?.resolvedStatus, "closed");
    assert.equal(report.entries[0]?.recommendation, "safe_to_reactivate");
    assert.equal(report.manualActionList.length, 1);
    assert.equal(report.manualActionList[0]?.candidatesUnlocked, 1);
  });

  it("marks missing live positions as deleted/not_found", () => {
    const liveByPositionId = new Map([["missing", liveNotFound("missing")]]);
    const report = buildBreezyJobStatusReconciliation({
      unlockablePlans: [plan({ candidateId: "c1", positionId: "missing", positionName: "Ghost Job" })],
      publishedJobs: [],
      closedJobs: [],
      archivedJobs: [],
      draftJobs: [],
      liveByPositionId,
      liveFetchStats: { found: 0, notFound: 1, fetchErrors: 0 },
    });

    assert.equal(report.entries[0]?.resolvedStatus, "deleted_not_found");
    assert.equal(report.entries[0]?.recommendation, "missing_deleted_job");
    assert.equal(report.metrics.missingDeletedJob, 1);
  });

  it("recommends safe publish for live draft jobs", () => {
    const draftJob = job({ jobId: "p-draft", name: "Merchandiser", status: "draft" });
    const liveByPositionId = new Map([["p-draft", liveFound(draftJob)]]);
    const report = buildBreezyJobStatusReconciliation({
      unlockablePlans: [plan({ candidateId: "c1", positionId: "p-draft" })],
      publishedJobs: [],
      closedJobs: [],
      archivedJobs: [],
      draftJobs: [draftJob],
      liveByPositionId,
      liveFetchStats: { found: 1, notFound: 0, fetchErrors: 0 },
    });

    assert.equal(report.entries[0]?.resolvedStatus, "unpublished");
    assert.equal(report.entries[0]?.recommendation, "safe_to_publish");
  });

  it("flags duplicate conflict when active published ad exists", () => {
    const published = job({ jobId: "active", name: "Merchandiser", status: "published" });
    const closed = job({ jobId: "closed", name: "Merchandiser", status: "closed" });
    const liveByPositionId = new Map([["closed", liveFound(closed)]]);
    const report = buildBreezyJobStatusReconciliation({
      unlockablePlans: [plan({ candidateId: "c1", positionId: "closed" })],
      publishedJobs: [published],
      closedJobs: [closed],
      archivedJobs: [],
      draftJobs: [],
      liveByPositionId,
      liveFetchStats: { found: 1, notFound: 0, fetchErrors: 0 },
    });

    const entry = report.entries[0];
    assert.equal(entry?.resolvedStatus, "duplicate_active_exists");
    assert.equal(entry?.recommendation, "keep_closed");
    assert.equal(entry?.duplicateActiveJobId, "active");
    assert.equal(entry?.autoApproveBlocked, true);
  });

  it("requires human review when published but candidates remain blocked", () => {
    const published = job({ jobId: "pub", name: "Merchandiser", status: "published" });
    const liveByPositionId = new Map([["pub", liveFound(published)]]);
    const report = buildBreezyJobStatusReconciliation({
      unlockablePlans: [plan({ candidateId: "c1", positionId: "pub" })],
      publishedJobs: [published],
      closedJobs: [],
      archivedJobs: [],
      draftJobs: [],
      liveByPositionId,
      liveFetchStats: { found: 1, notFound: 0, fetchErrors: 0 },
    });

    assert.equal(report.entries[0]?.resolvedStatus, "published");
    assert.equal(report.entries[0]?.recommendation, "human_review");
  });
});
