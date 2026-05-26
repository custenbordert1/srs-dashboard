import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildDirectDepositBackfillQueue,
  DIRECT_DEPOSIT_BACKFILL_WINDOW_MS,
  isEligibleDirectDepositBackfillWorkflow,
  isWithinDirectDepositBackfillWindow,
} from "@/lib/direct-deposit-backfill";
import { emptyRecruitingActions } from "@/lib/candidate-recruiting-actions";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { hasDirectDepositEmailInOutbox } from "@/lib/transactional-email-outbox";

const REF = Date.parse("2026-05-21T12:00:00.000Z");

function wf(
  id: string,
  patch: Partial<CandidateWorkflowRecord> & { paperworkSignedAt: string },
): CandidateWorkflowRecord {
  return {
    candidateId: id,
    workflowStatus: "Signed",
    notes: [],
    assignedRecruiter: "Taylor",
    assignedDM: "Field Ops",
    lastActionAt: patch.paperworkSignedAt,
    nextActionNeeded: "Verify",
    history: [],
    recruitingActions: emptyRecruitingActions(),
    followUpDueAt: null,
    snoozedUntil: null,
    signatureRequestId: "sig-1",
    paperworkTemplateKey: "onboarding_packet",
    paperworkSentAt: patch.paperworkSignedAt,
    paperworkViewedAt: null,
    paperworkViewCount: 0,
    paperworkSignedAt: patch.paperworkSignedAt,
    paperworkStatus: "signed",
    paperworkError: null,
    onboardingContactEmail: "c@example.com",
    directDepositStatus: "not_requested",
    directDepositRequestedAt: null,
    directDepositLastReminderAt: null,
    directDepositNotes: null,
    directDepositTriggeredByUserId: null,
    directDepositLastDeliveryMode: null,
    updatedAt: patch.paperworkSignedAt,
    ...patch,
  };
}

describe("direct-deposit-backfill", () => {
  it("includes only signed within 72 hours with not_requested", () => {
    const recent = new Date(REF - 24 * 60 * 60 * 1000).toISOString();
    const old = new Date(REF - 96 * 60 * 60 * 1000).toISOString();
    assert.equal(isWithinDirectDepositBackfillWindow(recent, REF), true);
    assert.equal(isWithinDirectDepositBackfillWindow(old, REF), false);
    const eligible = wf("recent", { paperworkSignedAt: recent });
    const tooOld = wf("old", { paperworkSignedAt: old });
    assert.equal(isEligibleDirectDepositBackfillWorkflow(eligible, REF), true);
    assert.equal(isEligibleDirectDepositBackfillWorkflow(tooOld, REF), false);
  });

  it("builds queue and flags outbox duplicates", async () => {
    const recent = new Date(REF - 12 * 60 * 60 * 1000).toISOString();
    const rows = await buildDirectDepositBackfillQueue(
      {
        a: wf("a", { paperworkSignedAt: recent }),
        b: wf("b", { paperworkSignedAt: recent, directDepositStatus: "requested" }),
      },
      {
        referenceMs: REF,
        outboxRows: [
          {
            id: "1",
            createdAt: recent,
            to: "c@example.com",
            subject: "Direct Deposit Verification Needed",
            meta: { candidateId: "a", signatureRequestId: "sig-1", kind: "direct_deposit_verification" },
          },
        ],
      },
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.candidateId, "a");
    assert.equal(rows[0]?.outboxAlreadySent, true);
    assert.equal(rows[0]?.eligible, false);
    assert.equal(rows[0]?.contactEmail, "c@example.com");
    assert.equal(rows[0]?.displayName, "a");
    const outbox = hasDirectDepositEmailInOutbox({
      candidateId: "a",
      signatureRequestId: "sig-1",
      rows: [
        {
          id: "1",
          createdAt: recent,
          to: "x@example.com",
          subject: "Direct Deposit Verification Needed",
          meta: { candidateId: "a", kind: "direct_deposit_verification" },
        },
      ],
    });
    assert.equal(outbox.sent, true);
  });

  it("exports 72 hour window constant", () => {
    assert.equal(DIRECT_DEPOSIT_BACKFILL_WINDOW_MS, 72 * 60 * 60 * 1000);
  });

  it("marks rows without contact email ineligible", async () => {
    const recent = new Date(REF - 12 * 60 * 60 * 1000).toISOString();
    const rows = await buildDirectDepositBackfillQueue(
      {
        "no-email": wf("no-email", {
          paperworkSignedAt: recent,
          onboardingContactEmail: null,
          signatureRequestId: null,
        }),
      },
      { referenceMs: REF, outboxRows: [] },
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.contactEmail, null);
    assert.equal(rows[0]?.eligible, false);
    assert.match(rows[0]?.ineligibleReason ?? "", /No contact email/);
  });
});
