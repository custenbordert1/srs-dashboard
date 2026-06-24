import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { BreezyCandidate } from "@/lib/breezy-api";
import { emptyRecruitingActions } from "@/lib/candidate-recruiting-actions";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { backfillWorkflowRecordsForCandidates } from "@/lib/candidate-ingestion/backfill-workflow-records";
import { getCandidateWorkflowState, upsertCandidateWorkflow } from "@/lib/candidate-workflow-store";
import {
  installIsolatedRecruitingDataDir,
  type IsolatedRecruitingDataHandle,
} from "@/lib/test/recruiting-test-isolation";

let isolation: IsolatedRecruitingDataHandle;

function candidate(id: string): BreezyCandidate {
  return {
    candidateId: id,
    firstName: "Sam",
    lastName: "Rivera",
    email: "sam@example.com",
    phone: "555-0100",
    source: "Indeed",
    stage: "Applied",
    appliedDate: "2026-06-20T10:00:00.000Z",
    createdDate: "2026-06-20T10:00:00.000Z",
    addedDate: "2026-06-20T10:00:00.000Z",
    updatedDate: "2026-06-20T10:00:00.000Z",
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

function automationWorkflow(id: string): Partial<CandidateWorkflowRecord> {
  return {
    assignedRecruiter: "Taylor",
    recruiterAssignmentSource: "auto",
    recruiterAssignmentReason: "Territory match",
    recruiterAssignmentConfidence: 72,
    lastActionAt: "2026-06-20T11:00:00.000Z",
    requiredAction: "Send Paperwork",
    actionType: "send-paperwork",
    actionPriority: "high",
    actionReason: "Qualified candidate",
    actionDueDate: "2026-06-21",
    actionConfidence: 88,
    actionGeneratedAt: "2026-06-20T11:05:00.000Z",
    recommendedStage: "Paperwork Needed",
    progressionReason: "Interview complete",
    progressionConfidence: 85,
    progressionGeneratedAt: "2026-06-20T11:10:00.000Z",
    recruitingActions: emptyRecruitingActions(),
  };
}

before(async () => {
  isolation = await installIsolatedRecruitingDataDir("p65-backfill-test-");
  process.env.SRS_CANDIDATE_WORKFLOW_DATA_DIR = isolation.dir;
});

after(async () => {
  delete process.env.SRS_CANDIDATE_WORKFLOW_DATA_DIR;
  await isolation.restore();
});

describe("backfill-workflow-records", () => {
  it("preserves assigned recruiter when stale in-memory map is empty", async () => {
    await upsertCandidateWorkflow({
      candidateId: "c-assigned",
      workflowStatus: "Qualified",
      ...automationWorkflow("c-assigned"),
    });

    const staleMap: Record<string, CandidateWorkflowRecord> = {};
    const result = await backfillWorkflowRecordsForCandidates({
      candidates: [candidate("c-assigned")],
      workflows: staleMap,
    });

    assert.equal(result.created, 0);
    const state = await getCandidateWorkflowState();
    assert.equal(state["c-assigned"]?.assignedRecruiter, "Taylor");
    assert.equal(state["c-assigned"]?.recruiterAssignmentSource, "auto");
  });

  it("preserves requiredAction and actionGeneratedAt during backfill", async () => {
    await upsertCandidateWorkflow({
      candidateId: "c-action",
      workflowStatus: "Qualified",
      ...automationWorkflow("c-action"),
    });

    await backfillWorkflowRecordsForCandidates({
      candidates: [candidate("c-action")],
      workflows: {},
    });

    const state = await getCandidateWorkflowState();
    assert.equal(state["c-action"]?.requiredAction, "Send Paperwork");
    assert.equal(state["c-action"]?.actionGeneratedAt, "2026-06-20T11:05:00.000Z");
  });

  it("preserves recommendedStage and progressionGeneratedAt during backfill", async () => {
    await upsertCandidateWorkflow({
      candidateId: "c-progress",
      workflowStatus: "Qualified",
      ...automationWorkflow("c-progress"),
    });

    await backfillWorkflowRecordsForCandidates({
      candidates: [candidate("c-progress")],
      workflows: {},
    });

    const state = await getCandidateWorkflowState();
    assert.equal(state["c-progress"]?.recommendedStage, "Paperwork Needed");
    assert.equal(state["c-progress"]?.progressionGeneratedAt, "2026-06-20T11:10:00.000Z");
  });

  it("creates Unassigned workflow records for new candidates", async () => {
    const workflows: Record<string, CandidateWorkflowRecord> = {};
    const result = await backfillWorkflowRecordsForCandidates({
      candidates: [candidate("c-new")],
      workflows,
    });

    assert.equal(result.created, 1);
    const state = await getCandidateWorkflowState();
    assert.equal(state["c-new"]?.assignedRecruiter, "Unassigned");
    assert.equal(state["c-new"]?.workflowStatus, "Applied");
  });
});
