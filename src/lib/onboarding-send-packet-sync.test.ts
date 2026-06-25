import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { emptyRecruitingActions } from "@/lib/candidate-recruiting-actions";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import {
  listCandidateOnboardingRecords,
  recordCandidateOnboarding,
} from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { recordCandidatePaperworkSent } from "@/lib/candidate-workflow-store";
import {
  buildSentOnboardingRecordUpdate,
  duplicatePaperworkSendBlockReason,
  syncActiveOnboardingRecordAfterSend,
} from "@/lib/onboarding-send-packet-sync";
import {
  installIsolatedRecruitingDataDir,
  type IsolatedRecruitingDataHandle,
} from "@/lib/test/recruiting-test-isolation";

let isolation: IsolatedRecruitingDataHandle;

function pendingRecord(candidateId: string, onboardingId: string): CandidateOnboardingRecord {
  return {
    onboardingId,
    candidateId,
    status: "pending_approval",
    paperworkComplete: false,
    readyForMel: false,
    createdAt: "2026-06-24T10:00:00.000Z",
    retryCount: 0,
    escalated: false,
    statusHistory: [{ at: "2026-06-24T10:00:00.000Z", status: "pending_approval" }],
  };
}

function workflowSent(candidateId: string, signatureRequestId: string): CandidateWorkflowRecord {
  return {
    candidateId,
    workflowStatus: "Paperwork Sent",
    assignedRecruiter: "Taylor",
    assignedDM: "Unassigned",
    notes: [],
    history: [],
    lastActionAt: null,
    nextActionNeeded: "Wait",
    recruitingActions: emptyRecruitingActions(),
    followUpDueAt: null,
    snoozedUntil: null,
    signatureRequestId,
    paperworkTemplateKey: "onboarding_packet",
    paperworkSentAt: "2026-06-24T10:00:00.000Z",
    paperworkViewedAt: null,
    paperworkViewCount: 0,
    paperworkSignedAt: null,
    paperworkStatus: "sent",
    paperworkError: null,
    directDepositStatus: "not_requested",
    directDepositRequestedAt: null,
    directDepositLastReminderAt: null,
    directDepositNotes: null,
    directDepositTriggeredByUserId: null,
    directDepositLastDeliveryMode: null,
    directDepositLastHrCopyIncluded: null,
    directDepositLastHrBccAddress: null,
    requiredAction: null,
    actionType: null,
    actionPriority: null,
    actionReason: null,
    actionDueDate: null,
    actionConfidence: null,
    actionGeneratedAt: null,
  };
}

before(async () => {
  isolation = await installIsolatedRecruitingDataDir("onboarding-send-packet-sync-");
  process.env.SRS_CANDIDATE_WORKFLOW_DATA_DIR = isolation.dir;
});

after(async () => {
  delete process.env.SRS_CANDIDATE_WORKFLOW_DATA_DIR;
  await isolation.restore();
});

describe("onboarding-send-packet-sync", () => {
  it("blocks duplicate send when workflow already has signatureRequestId", () => {
    const reason = duplicatePaperworkSendBlockReason({
      workflow: workflowSent("c-dup", "sig-existing"),
      activeOnboarding: pendingRecord("c-dup", "onb-dup"),
    });
    assert.equal(reason, "Packet already sent — awaiting signature.");
  });

  it("blocks duplicate send when onboarding record is queued", () => {
    const reason = duplicatePaperworkSendBlockReason({
      workflow: null,
      activeOnboarding: {
        ...pendingRecord("c-queued", "onb-queued"),
        status: "queued",
      },
    });
    assert.equal(reason, "Onboarding packet is queued for send.");
  });

  it("blocks duplicate send when onboarding record is already sent", () => {
    const reason = duplicatePaperworkSendBlockReason({
      workflow: null,
      activeOnboarding: {
        ...pendingRecord("c-sent", "onb-sent"),
        status: "sent",
        signatureRequestId: "sig-sent",
      },
    });
    assert.equal(reason, "Onboarding record already has an active signature request.");
  });

  it("syncs active onboarding record to sent without creating duplicate", async () => {
    await recordCandidateOnboarding(pendingRecord("c-sync", "onb-sync"));
    const before = await listCandidateOnboardingRecords(50);
    assert.equal(before.length, 1);

    const updated = await syncActiveOnboardingRecordAfterSend("c-sync", "sig-sync-1");
    assert.ok(updated);
    assert.equal(updated?.status, "sent");
    assert.equal(updated?.signatureRequestId, "sig-sync-1");
    assert.ok(updated?.sentAt);

    const after = await listCandidateOnboardingRecords(50);
    assert.equal(after.length, 1);
    assert.equal(after[0]?.onboardingId, "onb-sync");
    assert.equal(after[0]?.status, "sent");
  });

  it("buildSentOnboardingRecordUpdate appends sent history event", () => {
    const updated = buildSentOnboardingRecordUpdate(
      pendingRecord("c-hist", "onb-hist"),
      "sig-hist",
      "2026-06-24T12:00:00.000Z",
    );
    assert.equal(updated.status, "sent");
    assert.equal(updated.signatureRequestId, "sig-hist");
    assert.equal(updated.sentAt, "2026-06-24T12:00:00.000Z");
    assert.equal(updated.statusHistory.at(-1)?.status, "sent");
  });

  it("allows send when workflow and onboarding are still pending", () => {
    const reason = duplicatePaperworkSendBlockReason({
      workflow: {
        ...workflowSent("c-ok", "sig-old"),
        signatureRequestId: null,
        paperworkStatus: "not_sent",
        workflowStatus: "Paperwork Needed",
      },
      activeOnboarding: pendingRecord("c-ok", "onb-ok"),
    });
    assert.equal(reason, null);
  });

  it("blocks duplicate send after workflow paperwork sent via recordCandidatePaperworkSent", async () => {
    await recordCandidatePaperworkSent({
      candidateId: "c-wf-sent",
      signatureRequestId: "sig-wf",
      templateKey: "onboarding_packet",
      onboardingContactEmail: "test@example.com",
    });
    const workflows = await import("@/lib/candidate-workflow-store").then((m) =>
      m.getCandidateWorkflowState(),
    );
    const reason = duplicatePaperworkSendBlockReason({
      workflow: workflows["c-wf-sent"],
      activeOnboarding: pendingRecord("c-wf-sent", "onb-wf"),
    });
    assert.equal(reason, "Packet already sent — awaiting signature.");
  });
});
