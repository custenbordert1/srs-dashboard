import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildP243Fingerprint,
  hasAlreadySentPaperwork,
  normalizeEmailFingerprint,
  shouldSkipIdempotent,
  type P243IdempotencyStoreFile,
} from "@/lib/p243-autonomous-end-to-end-pipeline/idempotency";
import { runP243Preflight } from "@/lib/p243-autonomous-end-to-end-pipeline/preflight";
import { dedupeBreezyCandidates } from "@/lib/p243-autonomous-end-to-end-pipeline/pull";
import {
  evaluateP243StateMachine,
  isNeverSendTwiceBlocked,
} from "@/lib/p243-autonomous-end-to-end-pipeline/state-machine";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";

function emptyStore(): P243IdempotencyStoreFile {
  return {
    version: 2,
    updatedAt: new Date().toISOString(),
    lastCheckedAt: null,
    lastWebhookCursorAt: null,
    records: {},
    emailIndex: {},
  };
}

function stubRow(
  overrides: Partial<ScoredCandidateWorkflowRow> & { candidateId: string },
): ScoredCandidateWorkflowRow {
  const { candidateId, ...rest } = overrides;
  return {
    candidateId,
    email: "a@example.com",
    firstName: "A",
    lastName: "B",
    name: "A B",
    stage: "Applied",
    workflowStatus: "Applied",
    paperworkStatus: "not_sent",
    signatureRequestId: null,
    ...rest,
  } as ScoredCandidateWorkflowRow;
}

describe("p243-autonomous-end-to-end-pipeline", () => {
  it("builds stable idempotency fingerprints including email", () => {
    const a = buildP243Fingerprint({
      candidateId: "c1",
      email: "Person@Example.com",
      workflowStatus: "Applied",
      paperworkStatus: "not_sent",
      signatureRequestId: null,
      recommendation: "advance_paperwork_needed",
    });
    const b = buildP243Fingerprint({
      candidateId: "c1",
      email: "person@example.com",
      workflowStatus: "Applied",
      paperworkStatus: "not_sent",
      signatureRequestId: null,
      recommendation: "advance_paperwork_needed",
    });
    assert.equal(a, b);
    assert.equal(a.length, 24);
    assert.equal(normalizeEmailFingerprint("Person@Example.com"), normalizeEmailFingerprint("person@example.com"));
  });

  it("skips only when fingerprint matches", () => {
    const store = emptyStore();
    store.records.c1 = {
      candidateId: "c1",
      emailFingerprint: null,
      fingerprint: "abc",
      outcome: "auto_advance",
      paperworkSent: false,
      signatureRequestId: null,
      processedAt: new Date().toISOString(),
      batchId: "b1",
    };
    assert.equal(shouldSkipIdempotent(store, "c1", "abc"), true);
    assert.equal(shouldSkipIdempotent(store, "c1", "zzz"), false);
    assert.equal(shouldSkipIdempotent(store, "c2", "abc"), false);
  });

  it("blocks re-send via id or email fingerprint", () => {
    const store = emptyStore();
    const emailFp = normalizeEmailFingerprint("dup@example.com");
    assert.ok(emailFp);
    store.records.c1 = {
      candidateId: "c1",
      emailFingerprint: emailFp,
      fingerprint: "fp1",
      outcome: "auto_advance",
      paperworkSent: true,
      signatureRequestId: "sig-1",
      processedAt: new Date().toISOString(),
      batchId: "b1",
    };
    store.emailIndex[emailFp!] = "c1";

    assert.equal(hasAlreadySentPaperwork(store, "c1").blocked, true);
    assert.equal(hasAlreadySentPaperwork(store, "c2", "dup@example.com").blocked, true);
    assert.equal(hasAlreadySentPaperwork(store, "c2", "dup@example.com").reason, "email_fingerprint_already_sent");
    assert.equal(hasAlreadySentPaperwork(store, "c3", "other@example.com").blocked, false);
  });

  it("state machine blocks terminal / already-sent stages", () => {
    assert.equal(evaluateP243StateMachine(stubRow({ candidateId: "a", workflowStatus: "Applied" })), null);
    assert.ok(evaluateP243StateMachine(stubRow({ candidateId: "b", workflowStatus: "Paperwork Sent" })));
    assert.equal(isNeverSendTwiceBlocked(stubRow({ candidateId: "c", paperworkStatus: "sent" })), true);
    assert.equal(isNeverSendTwiceBlocked(stubRow({ candidateId: "d", workflowStatus: "Applied" })), false);
  });

  it("dedupes Breezy candidates by id and email fingerprint", () => {
    const { candidates, deduped } = dedupeBreezyCandidates([
      { _id: "1", candidateId: "1", email: "a@x.com", firstName: "A", lastName: "1" } as never,
      { _id: "1", candidateId: "1", email: "a@x.com", firstName: "A", lastName: "1b" } as never,
      { _id: "2", candidateId: "2", email: "a@x.com", firstName: "Dup", lastName: "Email" } as never,
      { _id: "3", candidateId: "3", email: "b@x.com", firstName: "B", lastName: "3" } as never,
    ]);
    assert.equal(candidates.length, 2);
    assert.ok(deduped >= 2);
    assert.ok(candidates.some((c) => c.candidateId === "1"));
    assert.ok(candidates.some((c) => c.candidateId === "3"));
  });

  it("preflight passes dry-run and requires confirmLive for live", async () => {
    const dry = await runP243Preflight({
      dryRun: true,
      confirmLive: false,
      fullLive: false,
      canaryLimit: 3,
    });
    assert.equal(dry.ok, true);
    assert.ok(dry.checks.some((c) => c.id === "mode"));
    const storageDry = dry.checks.find((c) => c.id === "durable_storage");
    assert.ok(storageDry);
    assert.equal(storageDry?.ok, true);
    assert.ok(
      storageDry?.message.includes("WARNING") || storageDry?.message.includes("Postgres"),
      "dry-run storage check should warn or confirm adapter",
    );

    const liveNoConfirm = await runP243Preflight({
      dryRun: false,
      confirmLive: false,
      fullLive: false,
      canaryLimit: 3,
    });
    assert.equal(liveNoConfirm.ok, false);
    const confirmCheck = liveNoConfirm.checks.find((c) => c.id === "confirm_live");
    assert.equal(confirmCheck?.ok, false);
    assert.ok(confirmCheck?.message.includes("confirmLive"));
    const storageLive = liveNoConfirm.checks.find((c) => c.id === "durable_storage");
    assert.ok(storageLive);
  });

  it("exposes forceFreshReset on AutonomousCycleOptions (forceFreshData alias)", () => {
    const opts: import("@/lib/p243-autonomous-end-to-end-pipeline/types").AutonomousCycleOptions = {
      dryRun: true,
      forceFreshReset: true,
    };
    assert.equal(opts.forceFreshReset, true);
    const legacy: import("@/lib/p243-autonomous-end-to-end-pipeline/types").AutonomousCycleOptions = {
      dryRun: true,
      forceFreshData: true,
    };
    assert.equal(legacy.forceFreshData, true);
  });
});
