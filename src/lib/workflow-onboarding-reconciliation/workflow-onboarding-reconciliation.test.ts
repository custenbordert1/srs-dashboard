import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { BreezyCandidate } from "@/lib/breezy-api";
import { emptyRecruitingActions } from "@/lib/candidate-recruiting-actions";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import { recordCandidateOnboarding } from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import { backfillWorkflowRecordsForCandidates } from "@/lib/candidate-ingestion/backfill-workflow-records";
import { getCandidateWorkflowState, upsertCandidateWorkflow } from "@/lib/candidate-workflow-store";
import { isOnboardingPipelineEligible } from "@/lib/onboarding-pipeline-engine/is-pipeline-eligible";
import {
  installIsolatedRecruitingDataDir,
  type IsolatedRecruitingDataHandle,
} from "@/lib/test/recruiting-test-isolation";
import {
  planWorkflowReconciliationFromOnboarding,
  reconcileAllWorkflowsFromOnboarding,
  reconcileWorkflowFromOnboarding,
  resolveAssignedRecruiter,
  resolvePaperworkStatus,
  resolveWorkflowStatus,
} from "@/lib/workflow-onboarding-reconciliation";

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

function onboardingRecord(
  candidateId: string,
  patch: Partial<CandidateOnboardingRecord> = {},
): CandidateOnboardingRecord {
  return {
    onboardingId: "onb-1",
    candidateId,
    status: "sent",
    signatureRequestId: "sig-abc",
    paperworkComplete: false,
    readyForMel: false,
    createdAt: "2026-06-20T10:00:00.000Z",
    sentAt: "2026-06-20T11:00:00.000Z",
    retryCount: 0,
    escalated: false,
    statusHistory: [],
    ...patch,
  };
}

before(async () => {
  isolation = await installIsolatedRecruitingDataDir("workflow-reconciliation-test-");
  process.env.SRS_CANDIDATE_WORKFLOW_DATA_DIR = isolation.dir;
  process.env.SRS_RECRUITING_DATA_DIR = isolation.dir;
});

after(async () => {
  delete process.env.SRS_CANDIDATE_WORKFLOW_DATA_DIR;
  delete process.env.SRS_RECRUITING_DATA_DIR;
  await isolation.restore();
});

describe("workflow-durability", () => {
  it("preserves assigned recruiter when incoming is Unassigned", () => {
    const existing = {
      assignedRecruiter: "Taylor",
    } as CandidateWorkflowRecord;
    assert.equal(resolveAssignedRecruiter("Unassigned", existing), "Taylor");
    assert.equal(resolveAssignedRecruiter(undefined, existing), "Taylor");
    assert.equal(resolveAssignedRecruiter("", existing), "Taylor");
  });

  it("blocks workflow status regression from Paperwork Sent to Applied", () => {
    const existing = { workflowStatus: "Paperwork Sent" } as CandidateWorkflowRecord;
    assert.equal(resolveWorkflowStatus("Applied", existing), "Paperwork Sent");
    assert.equal(resolveWorkflowStatus("Needs Review", existing), "Paperwork Sent");
    assert.equal(resolveWorkflowStatus("Applied", existing, true), "Applied");
  });

  it("blocks paperwork status regression from sent to not_sent", () => {
    assert.equal(resolvePaperworkStatus("not_sent", "sent"), "sent");
    assert.equal(resolvePaperworkStatus("not_sent", "signed"), "signed");
    assert.equal(resolvePaperworkStatus("not_sent", "sent", true), "not_sent");
  });
});

describe("upsertCandidateWorkflow durability", () => {
  it("does not clobber recruiter assignment during backfill-style upsert", async () => {
    await upsertCandidateWorkflow({
      candidateId: "c-clobber",
      workflowStatus: "Qualified",
      assignedRecruiter: "Taylor",
      recruiterAssignmentSource: "auto",
      recruiterAssignmentReason: "Territory match",
      recruiterAssignmentConfidence: 80,
      recruitingActions: emptyRecruitingActions(),
    });

    await upsertCandidateWorkflow({
      candidateId: "c-clobber",
      workflowStatus: "Applied",
      assignedRecruiter: "Unassigned",
      audit: { action: "ingestion_import" },
    });

    const state = await getCandidateWorkflowState();
    assert.equal(state["c-clobber"]?.assignedRecruiter, "Taylor");
  });

  it("preserves paperwork fields when ingestion tries to reset workflow status", async () => {
    await upsertCandidateWorkflow({
      candidateId: "c-paperwork",
      workflowStatus: "Paperwork Sent",
      paperworkStatus: "sent",
      signatureRequestId: "sig-123",
      paperworkSentAt: "2026-06-20T12:00:00.000Z",
      assignedRecruiter: "Taylor",
      recruitingActions: emptyRecruitingActions(),
    });

    await upsertCandidateWorkflow({
      candidateId: "c-paperwork",
      workflowStatus: "Applied",
      assignedRecruiter: "Unassigned",
      audit: { action: "ingestion_import" },
    });

    const state = await getCandidateWorkflowState();
    assert.equal(state["c-paperwork"]?.paperworkStatus, "sent");
    assert.equal(state["c-paperwork"]?.signatureRequestId, "sig-123");
    assert.equal(state["c-paperwork"]?.workflowStatus, "Paperwork Sent");
    assert.equal(state["c-paperwork"]?.assignedRecruiter, "Taylor");
  });
});

describe("backfill-workflow-records paperwork protection", () => {
  it("does not recreate workflow for candidates with advanced paperwork in memory map", async () => {
    const workflows: Record<string, CandidateWorkflowRecord> = {
      "c-advanced": {
        candidateId: "c-advanced",
        workflowStatus: "Paperwork Sent",
        paperworkStatus: "sent",
        signatureRequestId: "sig-keep",
        paperworkSentAt: "2026-06-20T12:00:00.000Z",
        assignedRecruiter: "Taylor",
        assignedDM: "Unassigned",
        notes: [],
        history: [],
        recruitingActions: emptyRecruitingActions(),
        lastActionAt: "2026-06-20T12:00:00.000Z",
        nextActionNeeded: "Await signature",
        followUpDueAt: null,
        snoozedUntil: null,
        paperworkTemplateKey: null,
        paperworkViewedAt: null,
        paperworkViewCount: 0,
        paperworkSignedAt: null,
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
        updatedAt: "2026-06-20T12:00:00.000Z",
      },
    };

    const result = await backfillWorkflowRecordsForCandidates({
      candidates: [candidate("c-advanced")],
      workflows,
    });

    assert.equal(result.created, 0);
    assert.equal(workflows["c-advanced"]?.signatureRequestId, "sig-keep");
  });
});

describe("reconcileWorkflowFromOnboarding planning", () => {
  it("plans reconciliation when onboarding is sent and workflow is behind", () => {
    const plan = planWorkflowReconciliationFromOnboarding({
      candidateId: "c-mary",
      workflow: {
        candidateId: "c-mary",
        workflowStatus: "Applied",
        paperworkStatus: "not_sent",
        signatureRequestId: null,
        paperworkSentAt: null,
      } as CandidateWorkflowRecord,
      onboarding: onboardingRecord("c-mary"),
    });

    assert.equal(plan.reconciled, true);
    assert.ok(plan.changes.some((change) => change.includes("paperworkStatus")));
    assert.ok(plan.changes.some((change) => change.includes("signatureRequestId")));
  });

  it("skips when workflow is already aligned", () => {
    const plan = planWorkflowReconciliationFromOnboarding({
      candidateId: "c-ok",
      workflow: {
        candidateId: "c-ok",
        workflowStatus: "Paperwork Sent",
        paperworkStatus: "sent",
        signatureRequestId: "sig-abc",
        paperworkSentAt: "2026-06-20T11:00:00.000Z",
      } as CandidateWorkflowRecord,
      onboarding: onboardingRecord("c-ok"),
    });

    assert.equal(plan.reconciled, false);
    assert.equal(plan.skippedReason, "workflow_already_aligned");
  });
});

describe("P81.3 workflow reconciliation", () => {
  it("restores paperwork state after ingestion-style workflow reset", async () => {
    await recordCandidateOnboarding(onboardingRecord("c-reset"));

    await upsertCandidateWorkflow({
      candidateId: "c-reset",
      workflowStatus: "Applied",
      paperworkStatus: "not_sent",
      assignedRecruiter: "Unassigned",
      audit: { action: "ingestion_import" },
    });

    const result = await backfillWorkflowRecordsForCandidates({
      candidates: [candidate("c-reset")],
      workflows: {},
    });

    assert.equal(result.reconciled, 1);
    const state = await getCandidateWorkflowState();
    assert.equal(state["c-reset"]?.paperworkStatus, "sent");
    assert.equal(state["c-reset"]?.workflowStatus, "Paperwork Sent");
    assert.equal(state["c-reset"]?.signatureRequestId, "sig-abc");
  });

  it("restores signed state from completed onboarding record", async () => {
    await recordCandidateOnboarding(
      onboardingRecord("c-signed", {
        status: "completed",
        paperworkComplete: true,
        completedAt: "2026-06-21T10:00:00.000Z",
      }),
    );

    const reconciled = await reconcileWorkflowFromOnboarding({
      candidateId: "c-signed",
      workflow: {
        candidateId: "c-signed",
        workflowStatus: "Applied",
        paperworkStatus: "not_sent",
      } as CandidateWorkflowRecord,
      onboarding: onboardingRecord("c-signed", {
        status: "completed",
        paperworkComplete: true,
        completedAt: "2026-06-21T10:00:00.000Z",
      }),
    });

    assert.equal(reconciled.reconciled, true);
    const state = await getCandidateWorkflowState();
    assert.equal(state["c-signed"]?.paperworkStatus, "signed");
    assert.equal(state["c-signed"]?.workflowStatus, "Signed");
    assert.equal(
      isOnboardingPipelineEligible({
        candidateId: "c-signed",
        workflowStatus: state["c-signed"]!.workflowStatus,
        paperworkStatus: state["c-signed"]!.paperworkStatus,
      }),
      true,
    );
  });

  it("keeps applied-only candidates at Applied when onboarding is pending approval", async () => {
    await recordCandidateOnboarding(
      onboardingRecord("c-applied", {
        status: "pending_approval",
        signatureRequestId: undefined,
        sentAt: undefined,
      }),
    );

    const result = await backfillWorkflowRecordsForCandidates({
      candidates: [candidate("c-applied")],
      workflows: {},
    });

    assert.equal(result.created, 1);
    assert.equal(result.reconciled, 0);
    const state = await getCandidateWorkflowState();
    assert.equal(state["c-applied"]?.workflowStatus, "Applied");
    assert.equal(state["c-applied"]?.paperworkStatus, "not_sent");
  });

  it("does not create duplicate workflow records during backfill reconciliation", async () => {
    await recordCandidateOnboarding(onboardingRecord("c-dup"));

    const result = await backfillWorkflowRecordsForCandidates({
      candidates: [candidate("c-dup"), candidate("c-dup")],
      workflows: {},
    });

    const state = await getCandidateWorkflowState();
    assert.equal(state["c-dup"]?.paperworkStatus, "sent");
    assert.equal(state["c-dup"]?.signatureRequestId, "sig-abc");
    assert.equal(result.reconciled, 1);
  });

  it("reconcileAllWorkflowsFromOnboarding repairs drifted sent records", async () => {
    await recordCandidateOnboarding(onboardingRecord("c-drift"));
    await upsertCandidateWorkflow({
      candidateId: "c-drift",
      workflowStatus: "Applied",
      paperworkStatus: "not_sent",
      assignedRecruiter: "Unassigned",
      audit: { action: "ingestion_import" },
    });

    const batch = await reconcileAllWorkflowsFromOnboarding();
    assert.equal(batch.reconciled, 1);

    const state = await getCandidateWorkflowState();
    assert.equal(state["c-drift"]?.paperworkStatus, "sent");
    assert.equal(
      isOnboardingPipelineEligible({
        candidateId: "c-drift",
        workflowStatus: state["c-drift"]!.workflowStatus,
        paperworkStatus: state["c-drift"]!.paperworkStatus,
      }),
      false,
    );
  });
});
