import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hasDirectDepositEmailInOutbox } from "@/lib/transactional-email-outbox";

describe("transactional-email-outbox", () => {
  it("detects DD email by candidate and signature request", () => {
    const rows = [
      {
        id: "1",
        createdAt: "2026-05-20T10:00:00.000Z",
        to: "a@example.com",
        subject: "Direct Deposit Verification Needed",
        meta: { candidateId: "c1", signatureRequestId: "sig-a", kind: "direct_deposit_verification" },
      },
      {
        id: "2",
        createdAt: "2026-05-20T11:00:00.000Z",
        to: "b@example.com",
        subject: "Direct Deposit Verification Needed",
        meta: { candidateId: "c2", signatureRequestId: "sig-b", kind: "direct_deposit_verification" },
      },
    ];
    assert.equal(hasDirectDepositEmailInOutbox({ candidateId: "c1", signatureRequestId: "sig-a", rows }).sent, true);
    assert.equal(hasDirectDepositEmailInOutbox({ candidateId: "c1", signatureRequestId: "sig-other", rows }).sent, false);
  });
});
