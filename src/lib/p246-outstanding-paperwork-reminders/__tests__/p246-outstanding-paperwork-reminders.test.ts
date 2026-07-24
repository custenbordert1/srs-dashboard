import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DropboxSignRequestSummary } from "@/lib/dropbox-sign";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { emptyRecruitingActions } from "@/lib/candidate-recruiting-actions";
import {
  buildP246IdempotencyKey,
  isCadenceSatisfied,
  nextReminderNumber,
} from "@/lib/p246-outstanding-paperwork-reminders/cadence";
import {
  candidateSignerStillOutstanding,
  isEligibleDropboxStatus,
  mapDropboxSummaryToLiveStatus,
  packetIncludesEmail,
} from "@/lib/p246-outstanding-paperwork-reminders/dropbox-status";
import { evaluateP246Eligibility } from "@/lib/p246-outstanding-paperwork-reminders/eligibility";
import {
  emptyP246ReminderStore,
  hasIdempotencyKey,
  recordSuccessfulReminder,
} from "@/lib/p246-outstanding-paperwork-reminders/store";

function summary(partial: Partial<DropboxSignRequestSummary> & {
  signatures: DropboxSignRequestSummary["signatures"];
}): DropboxSignRequestSummary {
  return {
    signatureRequestId: partial.signatureRequestId ?? "sig-1",
    isComplete: partial.isComplete ?? false,
    isDeclined: partial.isDeclined ?? false,
    signatures: partial.signatures,
    rawStatus: partial.rawStatus ?? "pending",
  };
}

function workflow(
  overrides: Partial<CandidateWorkflowRecord> = {},
): CandidateWorkflowRecord {
  return {
    candidateId: "cand-1",
    workflowStatus: "Paperwork Sent",
    notes: [],
    assignedRecruiter: "Taylor",
    assignedDM: "Unassigned",
    lastActionAt: null,
    nextActionNeeded: "",
    history: [],
    recruitingActions: emptyRecruitingActions(),
    followUpDueAt: null,
    snoozedUntil: null,
    signatureRequestId: "sig-1",
    paperworkTemplateKey: "onboarding_packet",
    paperworkSentAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    paperworkViewedAt: null,
    paperworkViewCount: 0,
    paperworkSignedAt: null,
    paperworkStatus: "sent",
    paperworkError: null,
    onboardingContactEmail: "candidate@example.com",
    directDepositStatus: "not_requested",
    directDepositRequestedAt: null,
    directDepositLastReminderAt: null,
    directDepositNotes: null,
    directDepositTriggeredByUserId: null,
    directDepositLastDeliveryMode: null,
    directDepositLastHrCopyIncluded: null,
    directDepositLastHrBccAddress: null,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("p246 cadence + idempotency", () => {
  it("builds idempotency keys with signature request id", () => {
    assert.equal(
      buildP246IdempotencyKey("c1", "sig-9", 2),
      "c1:sig-9:2",
    );
  });

  it("advances reminder numbers up to 4", () => {
    assert.equal(nextReminderNumber(0), 1);
    assert.equal(nextReminderNumber(3), 4);
    assert.equal(nextReminderNumber(4), null);
  });

  it("enforces Reminder 1 48h after send", () => {
    const now = Date.now();
    const tooSoon = isCadenceSatisfied({
      nextReminderNumber: 1,
      originalPaperworkSentAt: new Date(now - 12 * 60 * 60 * 1000).toISOString(),
      lastReminderAt: null,
      nowMs: now,
    });
    assert.equal(tooSoon.ok, false);

    const ready = isCadenceSatisfied({
      nextReminderNumber: 1,
      originalPaperworkSentAt: new Date(now - 49 * 60 * 60 * 1000).toISOString(),
      lastReminderAt: null,
      nowMs: now,
    });
    assert.equal(ready.ok, true);
  });

  it("prevents duplicate reminder numbers via store keys", () => {
    let store = emptyP246ReminderStore();
    const key = buildP246IdempotencyKey("cand-1", "sig-1", 1);
    store = recordSuccessfulReminder(store, {
      candidateId: "cand-1",
      signatureRequestId: "sig-1",
      reminderNumber: 1,
      idempotencyKey: key,
      sentAt: new Date().toISOString(),
      email: "candidate@example.com",
      deliveryStatus: "sent",
      messageId: "msg-1",
    });
    assert.equal(hasIdempotencyKey(store, "cand-1", "sig-1", key), true);
    // Second record with same key is a no-op
    const again = recordSuccessfulReminder(store, {
      candidateId: "cand-1",
      signatureRequestId: "sig-1",
      reminderNumber: 1,
      idempotencyKey: key,
      sentAt: new Date().toISOString(),
      email: "candidate@example.com",
      deliveryStatus: "sent",
      messageId: "msg-2",
    });
    assert.equal(again.byPacketKey["cand-1:sig-1"]!.reminderCount, 1);
  });
});

describe("p246 dropbox status mapping", () => {
  it("maps complete and partial signatures correctly", () => {
    assert.equal(
      mapDropboxSummaryToLiveStatus(
        summary({
          isComplete: true,
          signatures: [
            {
              signatureId: "a",
              signerEmail: "a@x.com",
              signerName: "A",
              statusCode: "signed",
              lastViewedAt: null,
              signedAt: "2026-01-01T00:00:00.000Z",
            },
          ],
        }),
      ),
      "complete",
    );

    assert.equal(
      mapDropboxSummaryToLiveStatus(
        summary({
          signatures: [
            {
              signatureId: "a",
              signerEmail: "a@x.com",
              signerName: "A",
              statusCode: "signed",
              lastViewedAt: null,
              signedAt: "2026-01-01T00:00:00.000Z",
            },
            {
              signatureId: "b",
              signerEmail: "b@x.com",
              signerName: "B",
              statusCode: "awaiting_signature",
              lastViewedAt: null,
              signedAt: null,
            },
          ],
        }),
      ),
      "partially_signed",
    );
  });

  it("only treats incomplete candidate signer as outstanding", () => {
    const s = summary({
      signatures: [
        {
          signatureId: "a",
          signerEmail: "candidate@example.com",
          signerName: "Cand",
          statusCode: "awaiting_signature",
          lastViewedAt: null,
          signedAt: null,
        },
        {
          signatureId: "b",
          signerEmail: "hr@example.com",
          signerName: "HR",
          statusCode: "signed",
          lastViewedAt: null,
          signedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    assert.equal(packetIncludesEmail(s, "candidate@example.com"), true);
    assert.equal(candidateSignerStillOutstanding(s, "candidate@example.com"), true);
    assert.equal(candidateSignerStillOutstanding(s, "hr@example.com"), false);
    assert.equal(isEligibleDropboxStatus("partially_signed"), true);
    assert.equal(isEligibleDropboxStatus("signed"), false);
  });
});

describe("p246 eligibility", () => {
  it("requires verified Dropbox status and does not fall back to workflow", () => {
    const result = evaluateP246Eligibility({
      workflow: workflow(),
      candidate: null,
      store: emptyP246ReminderStore(),
      dropboxLiveStatus: null,
      dropboxVerified: false,
      dropboxSummary: null,
      dropboxError: "lookup failed",
    });
    assert.equal(result.eligible, false);
    assert.equal(result.eligibilityResult, "dropbox_status_lookup_failed");
  });

  it("excludes signed Dropbox packets even if workflow says sent", () => {
    const s = summary({
      isComplete: true,
      signatures: [
        {
          signatureId: "a",
          signerEmail: "candidate@example.com",
          signerName: "Cand",
          statusCode: "signed",
          lastViewedAt: null,
          signedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    const result = evaluateP246Eligibility({
      workflow: workflow(),
      candidate: null,
      store: emptyP246ReminderStore(),
      dropboxLiveStatus: "complete",
      dropboxVerified: true,
      dropboxSummary: s,
      dropboxError: null,
    });
    assert.equal(result.eligible, false);
    assert.equal(result.eligibilityResult, "signed_or_completed");
  });

  it("marks Reminder 1 eligible when Dropbox awaiting and cadence met", () => {
    const s = summary({
      signatures: [
        {
          signatureId: "a",
          signerEmail: "candidate@example.com",
          signerName: "Cand",
          statusCode: "awaiting_signature",
          lastViewedAt: null,
          signedAt: null,
        },
      ],
      rawStatus: "awaiting_signature",
    });
    const result = evaluateP246Eligibility({
      workflow: workflow(),
      candidate: null,
      store: emptyP246ReminderStore(),
      dropboxLiveStatus: "awaiting_signature",
      dropboxVerified: true,
      dropboxSummary: s,
      dropboxError: null,
    });
    assert.equal(result.eligible, true);
    assert.equal(result.nextReminderNumber, 1);
    assert.equal(result.idempotencyKey, "cand-1:sig-1:1");
  });

  it("rejects packet email mismatches", () => {
    const s = summary({
      signatures: [
        {
          signatureId: "a",
          signerEmail: "other@example.com",
          signerName: "Other",
          statusCode: "awaiting_signature",
          lastViewedAt: null,
          signedAt: null,
        },
      ],
    });
    const result = evaluateP246Eligibility({
      workflow: workflow(),
      candidate: null,
      store: emptyP246ReminderStore(),
      dropboxLiveStatus: "awaiting_signature",
      dropboxVerified: true,
      dropboxSummary: s,
      dropboxError: null,
    });
    assert.equal(result.eligible, false);
    assert.equal(result.eligibilityResult, "packet_email_mismatch");
  });
});
