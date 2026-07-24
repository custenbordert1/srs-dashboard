import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  P260_CONFIRMATION_PHRASE,
  acquireP260InFlight,
  clearP260InFlightForTests,
  evaluateP260Eligibility,
  isP260ConfirmationPhrase,
  previewP260LivePaperworkSend,
  releaseP260InFlight,
  resolveTypedConfirmReasons,
  runP260LivePaperworkSend,
  typedConfirmationSatisfied,
  type P260CandidateSnapshot,
  type P260ProductionPreflight,
} from "@/lib/p260-live-paperwork-workspace";

function baseSnapshot(patch: Partial<P260CandidateSnapshot> = {}): P260CandidateSnapshot {
  return {
    candidateId: "cand-p260-1",
    name: "Jordan Lee",
    email: "jordan.lee@example.com",
    phone: "555-010-1234",
    workflowStatus: "Paperwork Needed",
    paperworkStatus: "not_sent",
    signatureRequestId: null,
    paperworkSentAt: null,
    paperworkViewedAt: null,
    paperworkSignedAt: null,
    recruiter: "Taylor Recruiter",
    districtManager: "Alex DM",
    templateKey: "onboarding_packet",
    nearestMiles: 22,
    coverageKnown: true,
    dropboxStatus: null,
    priorExpiredPacket: false,
    manuallyRecovered: false,
    ...patch,
  };
}

function okPreflight(patch: Partial<P260ProductionPreflight> = {}): P260ProductionPreflight {
  return {
    ok: true,
    aborted: false,
    blockers: [],
    testMode: false,
    productionModeConfirmed: true,
    apiKeyPresent: true,
    templateConfigured: true,
    accountQuotaRemaining: 5,
    rateLimitRemaining: 100,
    livePilotEnvOk: true,
    confirmationPhraseOk: true,
    detail: "Production Dropbox ready (testMode=false, quota=5).",
    ...patch,
  };
}

describe("P260 confirmation helpers", () => {
  it("accepts the exact production confirmation phrase", () => {
    assert.equal(isP260ConfirmationPhrase(P260_CONFIRMATION_PHRASE), true);
    assert.equal(isP260ConfirmationPhrase("wrong"), false);
  });

  it("requires typed confirm for distance 40–60, expired, recovered, nonstandard", () => {
    assert.deepEqual(
      resolveTypedConfirmReasons({
        nearestMiles: 45,
        priorExpiredPacket: false,
        manuallyRecovered: false,
        nonstandardOverride: false,
      }),
      ["distance_40_60"],
    );
    assert.deepEqual(
      resolveTypedConfirmReasons({
        nearestMiles: 10,
        priorExpiredPacket: true,
        manuallyRecovered: true,
        nonstandardOverride: true,
      }),
      ["prior_expired_packet", "manually_recovered", "nonstandard_override"],
    );
  });

  it("typedConfirmationSatisfied enforces phrase when required", () => {
    assert.equal(
      typedConfirmationSatisfied({
        requiresTypedConfirm: true,
        typedConfirmation: P260_CONFIRMATION_PHRASE,
      }),
      true,
    );
    assert.equal(
      typedConfirmationSatisfied({
        requiresTypedConfirm: true,
        typedConfirmation: "nope",
      }),
      false,
    );
  });
});

describe("P260 eligibility", () => {
  it("blocks active / viewed / signed packets with no bypass", () => {
    assert.ok(
      evaluateP260Eligibility(
        baseSnapshot({
          signatureRequestId: "sig-1",
          paperworkStatus: "sent",
          paperworkSentAt: "2026-07-01T00:00:00.000Z",
          workflowStatus: "Paperwork Sent",
        }),
      ).hardBlockers.includes("active_packet"),
    );
    assert.ok(
      evaluateP260Eligibility(
        baseSnapshot({
          paperworkStatus: "viewed",
          paperworkViewedAt: "2026-07-01T00:00:00.000Z",
          signatureRequestId: "sig-2",
        }),
      ).hardBlockers.includes("viewed_packet"),
    );
    assert.ok(
      evaluateP260Eligibility(
        baseSnapshot({
          paperworkStatus: "signed",
          paperworkSignedAt: "2026-07-01T00:00:00.000Z",
        }),
      ).hardBlockers.includes("signed_packet"),
    );
  });

  it("blocks missing identity / email / template / credentials-style fields", () => {
    assert.ok(
      evaluateP260Eligibility(baseSnapshot({ name: "", email: "" })).hardBlockers.includes(
        "missing_identity",
      ),
    );
    assert.ok(
      evaluateP260Eligibility(baseSnapshot({ email: "not-an-email" })).hardBlockers.includes(
        "missing_email",
      ),
    );
    assert.ok(
      evaluateP260Eligibility(baseSnapshot({ templateKey: "" })).hardBlockers.includes(
        "missing_template",
      ),
    );
  });

  it("blocks distance over 60; marks 40–60 as typed confirm only", () => {
    const over = evaluateP260Eligibility(baseSnapshot({ nearestMiles: 75 }));
    assert.ok(over.hardBlockers.includes("distance_over_60"));
    assert.equal(over.eligible, false);

    const review = evaluateP260Eligibility(baseSnapshot({ nearestMiles: 48 }));
    assert.equal(review.eligible, true);
    assert.deepEqual(review.typedConfirmReasons, ["distance_40_60"]);
    assert.equal(review.requiresTypedConfirm, true);
  });
});

describe("P260 run — fail closed & send guards", () => {
  beforeEach(() => {
    clearP260InFlightForTests();
  });

  it("fails closed when production quota is 0", async () => {
    const result = await runP260LivePaperworkSend({
      candidateId: "cand-p260-1",
      mode: "send",
      confirmationPhrase: P260_CONFIRMATION_PHRASE,
      deps: {
        preflight: async () =>
          okPreflight({
            ok: false,
            aborted: true,
            accountQuotaRemaining: 0,
            blockers: ["Production Dropbox Sign quota is 0"],
            detail: "ABORTED — Production Dropbox Sign quota is 0",
          }),
        refreshCandidate: async () => baseSnapshot(),
        executeSend: async () => {
          throw new Error("should not send when quota is 0");
        },
      },
    });

    assert.equal(result.mode, "send");
    if (result.mode !== "send") return;
    assert.equal(result.ok, false);
    assert.equal(result.writes.dropboxPacketCreated, false);
    assert.equal(result.writes.workflowPaperworkSent, false);
    assert.ok(result.auditTrail.some((e) => e.action === "quota_blocked"));
  });

  it("fails closed when credentials are missing", async () => {
    const result = await runP260LivePaperworkSend({
      candidateId: "cand-p260-1",
      mode: "send",
      confirmationPhrase: P260_CONFIRMATION_PHRASE,
      deps: {
        preflight: async () =>
          okPreflight({
            ok: false,
            aborted: true,
            apiKeyPresent: false,
            blockers: ["DROPBOX_SIGN_API_KEY is missing or placeholder."],
            detail: "ABORTED — credentials",
          }),
        refreshCandidate: async () => baseSnapshot(),
        executeSend: async () => {
          throw new Error("should not send without credentials");
        },
      },
    });
    assert.equal(result.mode, "send");
    if (result.mode !== "send") return;
    assert.equal(result.ok, false);
    assert.ok(result.auditTrail.some((e) => e.action === "credentials_blocked"));
    assert.equal(result.writes.dropboxPacketCreated, false);
  });

  it("cancel performs no write", async () => {
    const result = await runP260LivePaperworkSend({
      candidateId: "cand-p260-1",
      mode: "send",
      cancel: true,
      deps: {
        executeSend: async () => {
          throw new Error("cancel must not send");
        },
      },
    });
    assert.equal(result.mode, "cancelled");
    if (result.mode !== "cancelled") return;
    assert.equal(result.writes.dropboxPacketCreated, false);
    assert.ok(result.auditTrail.some((e) => e.action === "confirm_cancelled"));
  });

  it("blocks double-click via in-flight idempotency key", async () => {
    const snap = baseSnapshot();
    const elig = evaluateP260Eligibility(snap);
    assert.equal(acquireP260InFlight(elig.idempotencyKey), true);

    const result = await runP260LivePaperworkSend({
      candidateId: snap.candidateId,
      mode: "send",
      confirmationPhrase: P260_CONFIRMATION_PHRASE,
      deps: {
        preflight: async () => okPreflight(),
        refreshCandidate: async () => snap,
        checkExistingIdempotency: async () => ({ blocked: false, reason: null }),
        executeSend: async () => {
          throw new Error("double-click must not reach Dropbox");
        },
      },
    });
    assert.equal(result.mode, "send");
    if (result.mode !== "send") return;
    assert.equal(result.abortReason, "in_flight");
    assert.equal(result.writes.dropboxPacketCreated, false);
    releaseP260InFlight(elig.idempotencyKey);
  });

  it("blocks durable idempotency already-sent without creating a packet", async () => {
    const result = await runP260LivePaperworkSend({
      candidateId: "cand-p260-1",
      mode: "send",
      confirmationPhrase: P260_CONFIRMATION_PHRASE,
      deps: {
        preflight: async () => okPreflight(),
        refreshCandidate: async () => baseSnapshot(),
        checkExistingIdempotency: async () => ({
          blocked: true,
          reason: "idempotency_store_already_sent",
        }),
        executeSend: async () => {
          throw new Error("idempotency must block before Dropbox");
        },
      },
    });
    assert.equal(result.mode, "send");
    if (result.mode !== "send") return;
    assert.ok(result.auditTrail.some((e) => e.action === "idempotency_blocked"));
    assert.equal(result.writes.dropboxPacketCreated, false);
  });

  it("requires typed confirmation for distance 40–60", async () => {
    const result = await runP260LivePaperworkSend({
      candidateId: "cand-p260-1",
      mode: "send",
      confirmationPhrase: "not the phrase",
      deps: {
        preflight: async () => okPreflight(),
        refreshCandidate: async () => baseSnapshot({ nearestMiles: 52 }),
        executeSend: async () => {
          throw new Error("must not send without typed phrase");
        },
      },
    });
    assert.equal(result.mode, "send");
    if (result.mode !== "send") return;
    assert.equal(result.ok, false);
    assert.ok(result.eligibility?.requiresTypedConfirm);
    assert.equal(result.writes.dropboxPacketCreated, false);
  });

  it("reconciles timeout without Paperwork Sent write", async () => {
    const result = await runP260LivePaperworkSend({
      candidateId: "cand-p260-1",
      mode: "send",
      confirmationPhrase: P260_CONFIRMATION_PHRASE,
      deps: {
        preflight: async () => okPreflight(),
        refreshCandidate: async () => baseSnapshot(),
        checkExistingIdempotency: async () => ({ blocked: false, reason: null }),
        prepareSend: async () => ({ onboardingId: "ob-1" }),
        executeSend: async () => {
          throw new Error("Dropbox timeout ETIMEDOUT");
        },
      },
    });
    assert.equal(result.mode, "send");
    if (result.mode !== "send") return;
    assert.equal(result.writes.workflowPaperworkSent, false);
    assert.ok(result.auditTrail.some((e) => e.action === "timeout_reconcile"));
  });

  it("sends one candidate, verifies Dropbox, then marks Paperwork Sent", async () => {
    let upserted = false;
    let recorded = false;
    const result = await runP260LivePaperworkSend({
      candidateId: "cand-p260-1",
      mode: "send",
      confirmationPhrase: P260_CONFIRMATION_PHRASE,
      deps: {
        preflight: async () => okPreflight(),
        refreshCandidate: async () => baseSnapshot(),
        checkExistingIdempotency: async () => ({ blocked: false, reason: null }),
        prepareSend: async () => ({ onboardingId: "ob-1" }),
        executeSend: async () => ({
          ok: true,
          signatureRequestId: "sig-live-1",
          paperworkStatus: "sent",
          workflowStatus: "Paperwork Sent",
        }),
        verifyDropbox: async (id) => id === "sig-live-1",
        upsertPaperworkSent: async () => {
          upserted = true;
        },
        recordIdempotency: async () => {
          recorded = true;
        },
      },
    });
    assert.equal(result.mode, "send");
    if (result.mode !== "send") return;
    assert.equal(result.ok, true);
    assert.equal(result.signatureRequestId, "sig-live-1");
    assert.equal(result.verified, true);
    assert.equal(result.writes.dropboxPacketCreated, true);
    assert.equal(result.writes.workflowPaperworkSent, true);
    assert.equal(upserted, true);
    assert.equal(recorded, true);
    assert.equal(result.source, "Job Command Center");
    assert.ok(result.auditTrail.some((e) => e.action === "send_success"));
    assert.ok(result.auditTrail.some((e) => e.action === "post_send_verify"));
  });

  it("preview reports canSend=false when quota is 0", async () => {
    const preview = await previewP260LivePaperworkSend({
      candidateId: "cand-p260-1",
      mode: "preview",
      deps: {
        preflight: async () =>
          okPreflight({
            ok: false,
            aborted: true,
            accountQuotaRemaining: 0,
            blockers: ["quota 0"],
            detail: "ABORTED — quota 0",
          }),
        refreshCandidate: async () => baseSnapshot(),
      },
    });
    assert.equal(preview.canSend, false);
    assert.equal(preview.preflight.accountQuotaRemaining, 0);
  });

  it("blocks active packet on send without calling Dropbox", async () => {
    const result = await runP260LivePaperworkSend({
      candidateId: "cand-p260-1",
      mode: "send",
      confirmationPhrase: P260_CONFIRMATION_PHRASE,
      deps: {
        preflight: async () => okPreflight(),
        refreshCandidate: async () =>
          baseSnapshot({
            signatureRequestId: "existing",
            paperworkStatus: "sent",
            paperworkSentAt: "2026-07-01T00:00:00.000Z",
            workflowStatus: "Paperwork Sent",
          }),
        executeSend: async () => {
          throw new Error("must not send with active packet");
        },
      },
    });
    assert.equal(result.mode, "send");
    if (result.mode !== "send") return;
    assert.ok(result.auditTrail.some((e) => e.action === "packet_blocked"));
    assert.equal(result.writes.dropboxPacketCreated, false);
  });
});
