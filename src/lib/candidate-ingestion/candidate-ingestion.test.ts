import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { emptyRecruitingActions } from "@/lib/candidate-recruiting-actions";
import type { BreezyCandidate } from "@/lib/breezy-api";
import { buildApplicantCaptureHealth } from "@/lib/candidate-ingestion/build-capture-metrics";
import {
  emptyIngestionStore,
  ingestionPositionCoveragePct,
  isIngestionStoreUsable,
  mergeIngestedCandidates,
} from "@/lib/candidate-ingestion/ingestion-store";

function mockCandidate(id: string, appliedDate: string): BreezyCandidate {
  return {
    candidateId: id,
    firstName: "Alex",
    lastName: "Rivera",
    email: "alex@example.com",
    phone: "555-0100",
    source: "Indeed",
    stage: "Applied",
    appliedDate,
    createdDate: appliedDate,
    addedDate: appliedDate,
    updatedDate: appliedDate,
    addedDateSource: "creation_date",
    positionName: "Merchandiser",
    positionId: "pos-1",
    city: "Atlanta",
    state: "GA",
    zipCode: "30301",
    hasResume: true,
    resumeText: "Retail merchandising",
  };
}

describe("candidate-ingestion", () => {
  it("merges candidates by id without dropping existing rows", () => {
    const store = emptyIngestionStore();
    const first = mergeIngestedCandidates(store, [mockCandidate("c-1", "2026-06-20T10:00:00.000Z")]);
    const second = mergeIngestedCandidates(first.store, [
      mockCandidate("c-1", "2026-06-20T10:00:00.000Z"),
      mockCandidate("c-2", "2026-06-21T10:00:00.000Z"),
    ]);
    assert.equal(Object.keys(first.store.candidates).length, 1);
    assert.equal(Object.keys(second.store.candidates).length, 2);
    assert.equal(second.newCount, 1);
  });

  it("computes position coverage from scanned ids", () => {
    const store = {
      ...emptyIngestionStore(),
      publishedPositionsTotal: 100,
      scannedPositionIds: Array.from({ length: 96 }, (_, i) => `pos-${i}`),
    };
    assert.equal(ingestionPositionCoveragePct(store), 96);
    assert.equal(isIngestionStoreUsable({ ...store, candidates: { "c-1": mockCandidate("c-1", "2026-06-01") } }), true);
  });

  it("builds capture health metrics for mtd applicants", () => {
    const store = mergeIngestedCandidates(emptyIngestionStore(), [
      mockCandidate("c-1", "2026-06-20T10:00:00.000Z"),
      mockCandidate("c-2", "2026-06-21T10:00:00.000Z"),
    ]).store;
    const health = buildApplicantCaptureHealth({
      store: {
        ...store,
        publishedPositionsTotal: 352,
        scannedPositionIds: Array.from({ length: 340 }, (_, i) => `pos-${i}`),
        cycleComplete: true,
      },
      workflows: {
        "c-1": {
          candidateId: "c-1",
          workflowStatus: "Applied",
          notes: [],
          assignedRecruiter: "Taylor",
          assignedDM: "Unassigned",
          lastActionAt: null,
          nextActionNeeded: "Review",
          history: [],
          recruitingActions: emptyRecruitingActions(),
          followUpDueAt: null,
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
          requiredAction: "Screen candidate",
          updatedAt: "2026-06-24T00:00:00.000Z",
        },
      },
      jobsByPositionId: new Map(),
      referenceBreezyMtd: 100,
      rangeStart: "2026-06-01",
      rangeEnd: "2026-06-30",
    });
    assert.equal(health.osApplicantsMtd, 2);
    assert.equal(health.captureRatePct, 2);
    assert.equal(health.missingWorkflowRecords, 1);
    assert.equal(health.positionCoveragePct, 97);
  });
});
