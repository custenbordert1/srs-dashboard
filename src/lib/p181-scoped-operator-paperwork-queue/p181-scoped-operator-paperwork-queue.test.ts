import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyCandidate } from "@/lib/breezy-api";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import {
  defaultOperatorLiveCycleScope,
  resolveOperatorScopePool,
  resolveSendQueueForGateProfile,
} from "@/lib/p181-scoped-operator-paperwork-queue";
import { resolvePaperworkSendQueue } from "@/lib/p181-scoped-operator-paperwork-queue/select-send-queue-candidates";

function candidate(id: string, overrides: Partial<BreezyCandidate> = {}): BreezyCandidate {
  return {
    candidateId: id,
    firstName: id,
    lastName: "Test",
    email: `${id}@example.com`,
    appliedDate: "2026-07-01",
    addedDate: "2026-07-01",
    state: "AZ",
    positionId: "job-1",
    positionName: "Merchandiser",
    ...overrides,
  } as BreezyCandidate;
}

const workflows: Record<string, CandidateWorkflowRecord> = {
  alpha: {
    candidateId: "alpha",
    assignedRecruiter: "Logan",
    assignedDM: "Taylor DM",
    workflowStatus: "Paperwork Needed",
    paperworkStatus: "none",
  } as CandidateWorkflowRecord,
  bravo: {
    candidateId: "bravo",
    assignedRecruiter: "Logan",
    assignedDM: "Taylor DM",
    workflowStatus: "Paperwork Needed",
    paperworkStatus: "none",
  } as CandidateWorkflowRecord,
  charlie: {
    candidateId: "charlie",
    assignedRecruiter: "Other",
    assignedDM: "Other DM",
    workflowStatus: "Applied",
    paperworkStatus: "none",
  } as CandidateWorkflowRecord,
};

describe("P181 scoped operator paperwork queue", () => {
  it("operator explicit candidateIds take precedence over filters", async () => {
    const allCandidates = [
      candidate("alpha"),
      candidate("bravo"),
      candidate("charlie"),
    ];
    const scoped = await resolveOperatorScopePool({
      scope: {
        candidateIds: ["charlie", "alpha"],
        recruiters: ["Logan"],
      },
      allCandidates,
      workflows,
      jobsByPositionId: new Map(),
    });
    assert.deepEqual(
      scoped.map((row) => row.candidateId),
      ["charlie", "alpha"],
    );
  });

  it("operator profile never expands to full global pool", async () => {
    const allCandidates = [
      candidate("alpha"),
      candidate("bravo"),
      candidate("charlie"),
    ];
    const resolved = await resolvePaperworkSendQueue({
      sendQueue: {
        profile: "operator",
        scope: { candidateIds: ["alpha"] },
      },
      allCandidates,
      workflows,
      jobsByPositionId: new Map(),
    });
    assert.equal(resolved.candidates.length, 1);
    assert.equal(resolved.summary.operatorScopedOnly, true);
    assert.equal(resolved.summary.globalCandidateCount, 3);
  });

  it("autonomous profile keeps global pool", async () => {
    const allCandidates = [candidate("alpha"), candidate("bravo")];
    const resolved = await resolvePaperworkSendQueue({
      sendQueue: { profile: "autonomous" },
      allCandidates,
      workflows,
      jobsByPositionId: new Map(),
    });
    assert.equal(resolved.candidates.length, 2);
    assert.equal(resolved.summary.operatorScopedOnly, false);
  });

  it("operator empty explicit scope does not fall back to global pool", async () => {
    const scoped = await resolveOperatorScopePool({
      scope: { cohort: "manual_selection" },
      allCandidates: [candidate("alpha"), candidate("bravo")],
      workflows,
      jobsByPositionId: new Map(),
    });
    assert.deepEqual(scoped, []);
  });

  it("filters recruiters and states within operator scope", async () => {
    const scoped = await resolveOperatorScopePool({
      scope: {
        cohort: "newest_applicants",
        newestApplicants: 10,
        recruiters: ["Logan"],
        states: ["AZ"],
      },
      allCandidates: [
        candidate("alpha", { state: "AZ" }),
        candidate("bravo", { state: "NV" }),
        candidate("charlie", { state: "AZ" }),
      ],
      workflows,
      jobsByPositionId: new Map(),
    });
    assert.deepEqual(
      scoped.map((row) => row.candidateId),
      ["alpha"],
    );
  });

  it("resolveSendQueueForGateProfile maps P159 operator live cycle defaults", () => {
    const operatorDefault = resolveSendQueueForGateProfile({ gateProfile: "operator" });
    assert.equal(operatorDefault.profile, "operator");
    assert.deepEqual(operatorDefault.scope, defaultOperatorLiveCycleScope());

    const withIds = resolveSendQueueForGateProfile({
      gateProfile: "operator",
      candidateIds: ["c1", "c2"],
    });
    assert.deepEqual(withIds.scope?.candidateIds, ["c1", "c2"]);

    const autonomous = resolveSendQueueForGateProfile({ gateProfile: "autonomous" });
    assert.equal(autonomous.profile, "autonomous");
    assert.equal(autonomous.scope, undefined);
  });
});
