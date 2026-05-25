import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyCandidate } from "@/lib/breezy-api";
import { buildBaselineWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { buildPaperworkOperationsMetrics } from "@/lib/paperwork-operations-metrics";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";

function sample(id: string): BreezyCandidate {
  return {
    candidateId: id,
    firstName: "Pat",
    lastName: "Lee",
    email: "pat@example.com",
    phone: "",
    source: "Indeed",
    stage: "applied",
    appliedDate: "2026-05-20",
    createdDate: "2026-05-20",
    addedDate: "2026-05-20",
    updatedDate: "2026-05-20",
    addedDateSource: "creation_date",
    positionId: "pos-1",
    positionName: "Merchandiser",
    city: "Dallas",
    state: "TX",
    zipCode: "75001",
    resumeText: "",
  };
}

function workflow(
  id: string,
  patch: Partial<CandidateWorkflowRecord>,
): CandidateWorkflowRecord {
  const base = buildBaselineWorkflowRow(sample(id));
  return {
    ...base,
    candidateId: id,
    ...patch,
  } as CandidateWorkflowRecord;
}

describe("paperwork-operations-metrics", () => {
  const ref = Date.parse("2026-05-25T18:00:00.000Z");

  it("counts viewed-not-signed and pending over 24h", () => {
    const rows = [
      buildBaselineWorkflowRow(
        sample("v1"),
        workflow("v1", {
          workflowStatus: "Paperwork Sent",
          paperworkStatus: "viewed",
          paperworkViewedAt: "2026-05-25T12:00:00.000Z",
          paperworkViewCount: 1,
        }),
      ),
      buildBaselineWorkflowRow(
        sample("p1"),
        workflow("p1", {
          workflowStatus: "Paperwork Sent",
          paperworkStatus: "sent",
          signatureRequestId: "sig-1",
          paperworkSentAt: "2026-05-23T12:00:00.000Z",
        }),
      ),
    ];
    const metrics = buildPaperworkOperationsMetrics(rows, ref);
    assert.equal(metrics.viewedNotSigned, 1);
    assert.equal(metrics.pendingOver24h, 1);
    assert.equal(metrics.resendCandidates, 1);
  });
});
