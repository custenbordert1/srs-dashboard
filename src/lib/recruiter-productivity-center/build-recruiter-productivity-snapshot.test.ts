import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyCandidate } from "@/lib/breezy-api";
import { emptyRecruitingActions } from "@/lib/candidate-recruiting-actions";
import type { CandidateWorkflowState } from "@/lib/candidate-workflow-types";
import {
  buildRecruiterProductivitySnapshot,
  computeRecruiterAgingBucket,
  computeRecruiterProductivityScore,
} from "@/lib/recruiter-productivity-center/build-recruiter-productivity-snapshot";

const fetchedAt = "2026-05-28T18:00:00.000Z";
const referenceMs = Date.parse(fetchedAt);

function candidate(
  id: string,
  state: string,
  appliedDate: string,
  stage = "Applied",
): BreezyCandidate {
  return {
    candidateId: id,
    firstName: "Test",
    lastName: id,
    email: `${id}@example.com`,
    phone: "",
    source: "",
    stage,
    appliedDate,
    createdDate: appliedDate,
    addedDate: appliedDate,
    updatedDate: appliedDate,
    addedDateSource: "",
    positionId: "p1",
    positionName: "Merchandiser",
    city: "Austin",
    state,
    zipCode: "",
    resumeText: "",
    hasResume: false,
  };
}

describe("recruiter productivity snapshot", () => {
  it("maps applied-date aging buckets for P9.2", () => {
    assert.equal(computeRecruiterAgingBucket("2026-05-28T10:00:00.000Z", referenceMs), "0-2");
    assert.equal(computeRecruiterAgingBucket("2026-05-24T10:00:00.000Z", referenceMs), "3-7");
    assert.equal(computeRecruiterAgingBucket("2026-05-20T10:00:00.000Z", referenceMs), "8-14");
    assert.equal(computeRecruiterAgingBucket("2026-05-14T10:00:00.000Z", referenceMs), "8-14");
    assert.equal(computeRecruiterAgingBucket("2026-04-01T10:00:00.000Z", referenceMs), "15+");
  });

  it("builds dashboard KPIs, scorecards, tasks, and territory filter", () => {
    const candidates = [
      candidate("c1", "TX", "2026-05-28T10:00:00.000Z"),
      candidate("c2", "CA", "2026-05-20T10:00:00.000Z"),
    ];
    const workflows: CandidateWorkflowState = {
      c1: {
        candidateId: "c1",
        workflowStatus: "Qualified",
        notes: [],
        assignedRecruiter: "Taylor",
        assignedDM: "Amy Harp",
        lastActionAt: "2026-05-28T12:00:00.000Z",
        nextActionNeeded: "",
        history: [
          {
            id: "h1",
            type: "note",
            message: "Initial outreach",
            createdAt: "2026-05-28T12:00:00.000Z",
          },
        ],
        recruitingActions: { ...emptyRecruitingActions(), needsFollowUp: true },
        followUpDueAt: "2026-05-27T12:00:00.000Z",
        snoozedUntil: null,
        signatureRequestId: null,
        paperworkTemplateKey: null,
        paperworkSentAt: null,
        paperworkViewedAt: null,
        paperworkViewCount: 0,
        paperworkSignedAt: null,
        paperworkStatus: "not_sent",
        paperworkError: null,
        onboardingContactEmail: null,
        directDepositStatus: "not_requested",
        directDepositRequestedAt: null,
        directDepositLastReminderAt: null,
        directDepositNotes: null,
        directDepositTriggeredByUserId: null,
        directDepositLastDeliveryMode: null,
        directDepositLastHrCopyIncluded: null,
        directDepositLastHrBccAddress: null,
        updatedAt: fetchedAt,
      },
    };

    const all = buildRecruiterProductivitySnapshot({
      candidates,
      workflows,
      fetchedAt,
    });
    assert.equal(all.dashboard.applicantsAssigned, 2);
    assert.equal(all.dashboard.newApplicantsToday, 1);
    assert.equal(all.dashboard.followUpsDue, 1);
    assert.ok(all.dailyTasks.some((task) => task.type === "follow-up"));

    const txOnly = buildRecruiterProductivitySnapshot({
      candidates,
      workflows,
      fetchedAt,
      filters: { territoryStates: ["TX"] },
    });
    assert.equal(txOnly.dashboard.applicantsAssigned, 1);
    assert.equal(txOnly.agingBuckets.find((b) => b.id === "0-2")?.count, 1);

    const taylorOnly = buildRecruiterProductivitySnapshot({
      candidates,
      workflows,
      fetchedAt,
      filters: { actingRecruiter: "Taylor", territoryStates: ["TX"] },
    });
    assert.equal(taylorOnly.dashboard.applicantsAssigned, 1);
    assert.equal(taylorOnly.scorecards[0]?.recruiter, "Taylor");
  });

  it("computes executive productivity score from scorecards", () => {
    const score = computeRecruiterProductivityScore([
      {
        recruiter: "A",
        assignedCount: 10,
        contactRatePercent: 80,
        paperworkConversionPercent: 50,
        hireConversionPercent: 20,
        avgTimeToFirstContactHours: 4,
        avgDaysToHire: 14,
      },
    ]);
    assert.ok(score > 0 && score <= 100);
  });
});
