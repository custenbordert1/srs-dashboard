import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyCandidate } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { emptyRecruitingActions } from "@/lib/candidate-recruiting-actions";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import {
  computeRecruiterAgingBucket,
  isNoResponseCandidate,
  matchesRecruiterQuickFilter,
} from "@/lib/recruiter-action-queue-filters";

const REF = Date.parse("2026-05-21T12:00:00.000Z");

function sample(id: string): BreezyCandidate {
  return {
    candidateId: id,
    firstName: "Pat",
    lastName: "Lee",
    email: "pat@example.com",
    phone: "",
    source: "Indeed",
    stage: "applied",
    appliedDate: "2026-05-10",
    createdDate: "2026-05-10",
    addedDate: "2026-05-10",
    updatedDate: "2026-05-10",
    addedDateSource: "creation_date",
    positionId: "pos-1",
    positionName: "Merchandiser",
    city: "Dallas",
    state: "TX",
    zipCode: "75001",
    resumeText: "",
  };
}

function wf(id: string, patch: Partial<CandidateWorkflowRecord>): CandidateWorkflowRecord {
  const base = buildScoredWorkflowRow(sample(id));
  return {
    candidateId: id,
    workflowStatus: patch.workflowStatus ?? base.workflowStatus,
    notes: patch.notes ?? [],
    assignedRecruiter: patch.assignedRecruiter ?? "Taylor",
    assignedDM: patch.assignedDM ?? "Unassigned",
    lastActionAt: patch.lastActionAt ?? null,
    nextActionNeeded: patch.nextActionNeeded ?? base.nextActionNeeded,
    history: patch.history ?? [],
    recruitingActions: patch.recruitingActions ?? emptyRecruitingActions(),
    followUpDueAt: patch.followUpDueAt ?? null,
    snoozedUntil: patch.snoozedUntil ?? null,
    updatedAt: patch.updatedAt ?? "2026-05-12T00:00:00.000Z",
  };
}

describe("recruiter-action-queue-filters", () => {
  it("maps inactivity to aging buckets", () => {
    const fresh = buildScoredWorkflowRow(
      sample("fresh"),
      wf("fresh", { lastActionAt: "2026-05-21T08:00:00.000Z" }),
    );
    const day3 = buildScoredWorkflowRow(
      sample("d3"),
      wf("d3", { lastActionAt: "2026-05-18T08:00:00.000Z" }),
    );
    const week = buildScoredWorkflowRow(
      sample("w"),
      wf("w", { lastActionAt: "2026-05-01T08:00:00.000Z" }),
    );
    assert.equal(computeRecruiterAgingBucket(fresh, REF), "fresh");
    assert.equal(computeRecruiterAgingBucket(day3, REF), "3d");
    assert.equal(computeRecruiterAgingBucket(week, REF), "7d+");
  });

  it("flags no-response for follow-up or 24h+ inactivity", () => {
    const flagged = buildScoredWorkflowRow(
      sample("fu"),
      wf("fu", {
        recruitingActions: {
          ...emptyRecruitingActions(),
          needsFollowUp: true,
          updatedAt: new Date(REF).toISOString(),
        },
      }),
    );
    const stale = buildScoredWorkflowRow(
      sample("stale"),
      wf("stale", { lastActionAt: "2026-05-19T00:00:00.000Z", workflowStatus: "Needs Review" }),
    );
    assert.equal(isNoResponseCandidate(flagged, REF), true);
    assert.equal(isNoResponseCandidate(stale, REF), true);
  });

  it("matches paperwork and interview quick filters", () => {
    const paperwork = buildScoredWorkflowRow(
      sample("pw"),
      wf("pw", { workflowStatus: "Paperwork Sent" }),
    );
    const interview = buildScoredWorkflowRow(
      sample("iv"),
      wf("iv", {
        recruitingActions: {
          ...emptyRecruitingActions(),
          recommendInterview: true,
          updatedAt: new Date(REF).toISOString(),
        },
      }),
    );
    assert.equal(matchesRecruiterQuickFilter(paperwork, "paperwork-pending", "Taylor", REF), true);
    assert.equal(matchesRecruiterQuickFilter(interview, "interview-needed", "Taylor", REF), true);
    assert.equal(matchesRecruiterQuickFilter(paperwork, "ready-mel", "Taylor", REF), false);
  });

  it("matches overdue and unassigned queue tabs", () => {
    const overdue = buildScoredWorkflowRow(
      sample("od"),
      wf("od", {
        followUpDueAt: "2026-05-19T00:00:00.000Z",
        recruitingActions: {
          ...emptyRecruitingActions(),
          needsFollowUp: true,
          updatedAt: new Date(REF).toISOString(),
        },
      }),
    );
    const unassigned = buildScoredWorkflowRow(
      sample("ua"),
      wf("ua", { assignedRecruiter: "Unassigned" }),
    );
    assert.equal(matchesRecruiterQuickFilter(overdue, "overdue", "Taylor", REF), true);
    assert.equal(matchesRecruiterQuickFilter(unassigned, "unassigned", "Taylor", REF), true);
  });
});
