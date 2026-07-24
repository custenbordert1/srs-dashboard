import { ensurePilotMaxSendsForCanary } from "@/lib/p122-controlled-live-paperwork-pilot/live-pilot-env";
import { pushP260Audit } from "@/lib/p260-live-paperwork-workspace/audit";
import { typedConfirmationSatisfied } from "@/lib/p260-live-paperwork-workspace/confirmation";
import { evaluateP260Eligibility } from "@/lib/p260-live-paperwork-workspace/eligibility";
import {
  acquireP260InFlight,
  checkP260ExistingIdempotency,
  recordP260Idempotency,
  releaseP260InFlight,
} from "@/lib/p260-live-paperwork-workspace/idempotency";
import { runP260ProductionPreflight } from "@/lib/p260-live-paperwork-workspace/preflight";
import { refreshP260Candidate } from "@/lib/p260-live-paperwork-workspace/refresh";
import {
  defaultClearExpiredPacket,
  defaultExecuteP260Send,
  defaultPrepareP260Send,
  defaultUpsertP260PaperworkSent,
  defaultVerifyP260Dropbox,
} from "@/lib/p260-live-paperwork-workspace/send";
import {
  P260_BY_USER,
  P260_CONFIRMATION_PHRASE,
  P260_PHASE,
  P260_SOURCE,
  type P260AuditEntry,
  type P260PreviewResult,
  type P260ProductionPreflight,
  type P260RunInput,
  type P260SendResult,
} from "@/lib/p260-live-paperwork-workspace/types";

function emptyPreflight(detail: string): P260ProductionPreflight {
  return {
    ok: false,
    aborted: true,
    blockers: [detail],
    testMode: null,
    productionModeConfirmed: false,
    apiKeyPresent: false,
    templateConfigured: false,
    accountQuotaRemaining: null,
    rateLimitRemaining: null,
    livePilotEnvOk: false,
    confirmationPhraseOk: false,
    detail,
  };
}

function applyLivePilotEnv(): void {
  process.env.AUTONOMOUS_PAPERWORK_LIVE_PILOT_ENABLED = "true";
  process.env.AUTONOMOUS_PAPERWORK_LIVE_MODE = "true";
  process.env.AUTONOMOUS_PAPERWORK_OPERATOR_GO = "true";
  ensurePilotMaxSendsForCanary(1);
}

export async function previewP260LivePaperworkSend(
  input: P260RunInput,
): Promise<P260PreviewResult> {
  const auditTrail: P260AuditEntry[] = [];
  const candidateId = input.candidateId.trim();
  pushP260Audit(auditTrail, "preview_opened", `Preview for ${candidateId}`, candidateId);

  const deps = input.deps ?? {};
  const preflightFn =
    deps.preflight ??
    ((phrase: string) =>
      runP260ProductionPreflight({
        confirmationPhrase: phrase,
        requireLivePilotEnv: false,
        allowMissingPhrase: true,
      }));
  const refreshFn =
    deps.refreshCandidate ??
    ((id: string) =>
      refreshP260Candidate({
        candidateId: id,
        allowNetworkGeocode: input.allowNetworkGeocode,
        manuallyRecovered: input.manuallyRecovered,
      }));
  const evaluateFn = deps.evaluateEligibility ?? evaluateP260Eligibility;

  // Preview probes quota/credentials; phrase is validated on send.
  applyLivePilotEnv();
  const preflight = await preflightFn(P260_CONFIRMATION_PHRASE);
  pushP260Audit(
    auditTrail,
    "preflight_checked",
    preflight.detail,
    candidateId,
  );

  if (!preflight.apiKeyPresent) {
    pushP260Audit(auditTrail, "credentials_blocked", preflight.detail, candidateId);
  }
  if (preflight.accountQuotaRemaining != null && preflight.accountQuotaRemaining <= 0) {
    pushP260Audit(auditTrail, "quota_blocked", preflight.detail, candidateId);
  }

  const snapshot = await refreshFn(candidateId);
  pushP260Audit(auditTrail, "pre_send_refresh", "Candidate context refreshed", candidateId);

  const eligibility = evaluateFn(snapshot, {
    nonstandardOverride: input.nonstandardOverride === true,
  });
  if (input.manuallyRecovered) {
    eligibility.snapshot.manuallyRecovered = true;
    const reEval = evaluateFn(
      { ...eligibility.snapshot, manuallyRecovered: true },
      { nonstandardOverride: input.nonstandardOverride === true },
    );
    Object.assign(eligibility, reEval);
  }

  pushP260Audit(auditTrail, "eligibility_evaluated", eligibility.detail, candidateId);
  if (eligibility.requiresTypedConfirm) {
    pushP260Audit(
      auditTrail,
      "typed_confirm_required",
      eligibility.typedConfirmReasons.join(", "),
      candidateId,
    );
  }
  if (
    eligibility.hardBlockers.some((b) =>
      ["active_packet", "viewed_packet", "signed_packet", "duplicate"].includes(b),
    )
  ) {
    pushP260Audit(auditTrail, "packet_blocked", eligibility.detail, candidateId);
  }

  pushP260Audit(auditTrail, "confirm_shown", "Operator confirmation required", candidateId);

  const canSend =
    eligibility.eligible &&
    preflight.ok &&
    preflight.accountQuotaRemaining != null &&
    preflight.accountQuotaRemaining > 0;

  return {
    ok: true,
    mode: "preview",
    phase: P260_PHASE,
    source: P260_SOURCE,
    confirmationPhrase: P260_CONFIRMATION_PHRASE,
    preflight,
    eligibility,
    auditTrail,
    canSend,
    detail: canSend
      ? eligibility.requiresTypedConfirm
        ? "Preview OK — typed confirmation required before send."
        : "Preview OK — ready for confirmed production send."
      : `Preview blocked — ${[...preflight.blockers, ...eligibility.hardBlockers].join(" | ")}`,
  };
}

export async function runP260LivePaperworkSend(
  input: P260RunInput,
): Promise<P260PreviewResult | P260SendResult> {
  if (input.mode === "preview") {
    return previewP260LivePaperworkSend(input);
  }

  const auditTrail: P260AuditEntry[] = [];
  const candidateId = input.candidateId.trim();
  const byUserId = input.byUserId?.trim() || P260_BY_USER;
  const deps = input.deps ?? {};

  if (input.cancel) {
    pushP260Audit(auditTrail, "confirm_cancelled", "Operator cancelled — no write", candidateId);
    return {
      ok: true,
      mode: "cancelled",
      phase: P260_PHASE,
      source: P260_SOURCE,
      aborted: true,
      abortReason: "cancelled",
      candidateId,
      signatureRequestId: null,
      paperworkStatus: null,
      workflowStatus: null,
      idempotencyKey: "",
      preflight: emptyPreflight("cancelled"),
      eligibility: null,
      verified: false,
      writes: { dropboxPacketCreated: false, workflowPaperworkSent: false },
      auditTrail,
      detail: "Cancelled — no Dropbox or workflow write.",
    };
  }

  applyLivePilotEnv();

  const preflightFn = deps.preflight ?? ((phrase: string) => runP260ProductionPreflight({ confirmationPhrase: phrase }));
  const refreshFn =
    deps.refreshCandidate ??
    ((id: string) =>
      refreshP260Candidate({
        candidateId: id,
        allowNetworkGeocode: input.allowNetworkGeocode,
        manuallyRecovered: input.manuallyRecovered,
      }));
  const evaluateFn = deps.evaluateEligibility ?? evaluateP260Eligibility;
  const prepareFn = deps.prepareSend ?? defaultPrepareP260Send;
  const executeFn = deps.executeSend ?? defaultExecuteP260Send;
  const verifyFn = deps.verifyDropbox ?? defaultVerifyP260Dropbox;
  const upsertFn = deps.upsertPaperworkSent ?? defaultUpsertP260PaperworkSent;
  const clearExpiredFn = deps.clearExpiredPacket ?? defaultClearExpiredPacket;
  const acquireFn = deps.acquireInFlight ?? acquireP260InFlight;
  const releaseFn = deps.releaseInFlight ?? releaseP260InFlight;
  const checkIdempoFn = deps.checkExistingIdempotency ?? checkP260ExistingIdempotency;
  const recordIdempoFn = deps.recordIdempotency ?? recordP260Idempotency;

  const confirmationPhrase = input.confirmationPhrase?.trim() || "";
  const preflight = await preflightFn(confirmationPhrase);
  pushP260Audit(auditTrail, "preflight_checked", preflight.detail, candidateId);

  if (!preflight.ok) {
    if (!preflight.apiKeyPresent) {
      pushP260Audit(auditTrail, "credentials_blocked", preflight.detail, candidateId);
    }
    if (preflight.accountQuotaRemaining != null && preflight.accountQuotaRemaining <= 0) {
      pushP260Audit(auditTrail, "quota_blocked", preflight.detail, candidateId);
    }
    return {
      ok: false,
      mode: "send",
      phase: P260_PHASE,
      source: P260_SOURCE,
      aborted: true,
      abortReason: preflight.detail,
      candidateId,
      signatureRequestId: null,
      paperworkStatus: null,
      workflowStatus: null,
      idempotencyKey: "",
      preflight,
      eligibility: null,
      verified: false,
      writes: { dropboxPacketCreated: false, workflowPaperworkSent: false },
      auditTrail,
      detail: preflight.detail,
    };
  }

  pushP260Audit(auditTrail, "pre_send_refresh", "Refreshing candidate before send", candidateId);
  let snapshot = await refreshFn(candidateId);
  if (input.manuallyRecovered) {
    snapshot = { ...snapshot, manuallyRecovered: true };
  }

  let eligibility = evaluateFn(snapshot, {
    nonstandardOverride: input.nonstandardOverride === true,
  });
  pushP260Audit(auditTrail, "eligibility_evaluated", eligibility.detail, candidateId);

  if (eligibility.requiresTypedConfirm) {
    pushP260Audit(
      auditTrail,
      "typed_confirm_required",
      eligibility.typedConfirmReasons.join(", "),
      candidateId,
    );
  }

  if (!eligibility.eligible) {
    if (
      eligibility.hardBlockers.some((b) =>
        ["active_packet", "viewed_packet", "signed_packet", "duplicate"].includes(b),
      )
    ) {
      pushP260Audit(auditTrail, "packet_blocked", eligibility.detail, candidateId);
    }
    return {
      ok: false,
      mode: "send",
      phase: P260_PHASE,
      source: P260_SOURCE,
      aborted: true,
      abortReason: eligibility.detail,
      candidateId,
      signatureRequestId: snapshot.signatureRequestId,
      paperworkStatus: snapshot.paperworkStatus,
      workflowStatus: snapshot.workflowStatus,
      idempotencyKey: eligibility.idempotencyKey,
      preflight,
      eligibility,
      verified: false,
      writes: { dropboxPacketCreated: false, workflowPaperworkSent: false },
      auditTrail,
      detail: eligibility.detail,
    };
  }

  if (
    !typedConfirmationSatisfied({
      requiresTypedConfirm: eligibility.requiresTypedConfirm,
      typedConfirmation: input.typedConfirmation,
      confirmationPhrase,
    })
  ) {
    const detail = eligibility.requiresTypedConfirm
      ? `Typed confirmation required (${eligibility.typedConfirmReasons.join(", ")}). Phrase must be exactly: "${P260_CONFIRMATION_PHRASE}"`
      : `Confirmation phrase must be exactly: "${P260_CONFIRMATION_PHRASE}"`;
    pushP260Audit(auditTrail, "typed_confirm_required", detail, candidateId);
    return {
      ok: false,
      mode: "send",
      phase: P260_PHASE,
      source: P260_SOURCE,
      aborted: true,
      abortReason: detail,
      candidateId,
      signatureRequestId: null,
      paperworkStatus: null,
      workflowStatus: null,
      idempotencyKey: eligibility.idempotencyKey,
      preflight,
      eligibility,
      verified: false,
      writes: { dropboxPacketCreated: false, workflowPaperworkSent: false },
      auditTrail,
      detail,
    };
  }

  const idempo = await checkIdempoFn(candidateId, snapshot.email);
  if (idempo.blocked) {
    pushP260Audit(
      auditTrail,
      "idempotency_blocked",
      idempo.reason ?? "already sent",
      candidateId,
    );
    return {
      ok: false,
      mode: "send",
      phase: P260_PHASE,
      source: P260_SOURCE,
      aborted: true,
      abortReason: idempo.reason ?? "idempotency_already_sent",
      candidateId,
      signatureRequestId: null,
      paperworkStatus: snapshot.paperworkStatus,
      workflowStatus: snapshot.workflowStatus,
      idempotencyKey: eligibility.idempotencyKey,
      preflight,
      eligibility,
      verified: false,
      writes: { dropboxPacketCreated: false, workflowPaperworkSent: false },
      auditTrail,
      detail: `Idempotency blocked: ${idempo.reason}`,
    };
  }

  if (!acquireFn(eligibility.idempotencyKey)) {
    pushP260Audit(auditTrail, "idempotency_blocked", "in_flight double-click guard", candidateId);
    return {
      ok: false,
      mode: "send",
      phase: P260_PHASE,
      source: P260_SOURCE,
      aborted: true,
      abortReason: "in_flight",
      candidateId,
      signatureRequestId: null,
      paperworkStatus: null,
      workflowStatus: null,
      idempotencyKey: eligibility.idempotencyKey,
      preflight,
      eligibility,
      verified: false,
      writes: { dropboxPacketCreated: false, workflowPaperworkSent: false },
      auditTrail,
      detail: "Send already in flight for this candidate+template (double-click guard).",
    };
  }

  try {
    if (eligibility.typedConfirmReasons.includes("prior_expired_packet")) {
      await clearExpiredFn(candidateId);
      snapshot = await refreshFn(candidateId);
      eligibility = evaluateFn(
        { ...snapshot, priorExpiredPacket: false, signatureRequestId: null },
        { nonstandardOverride: input.nonstandardOverride === true },
      );
      if (!eligibility.eligible) {
        return {
          ok: false,
          mode: "send",
          phase: P260_PHASE,
          source: P260_SOURCE,
          aborted: true,
          abortReason: eligibility.detail,
          candidateId,
          signatureRequestId: null,
          paperworkStatus: null,
          workflowStatus: null,
          idempotencyKey: eligibility.idempotencyKey,
          preflight,
          eligibility,
          verified: false,
          writes: { dropboxPacketCreated: false, workflowPaperworkSent: false },
          auditTrail,
          detail: `After expired clear: ${eligibility.detail}`,
        };
      }
    }

    const prepared = await prepareFn(candidateId, snapshot.templateKey);
    pushP260Audit(
      auditTrail,
      "send_attempt",
      `Production Dropbox send via ${P260_SOURCE}`,
      candidateId,
    );

    let sendResult: Awaited<ReturnType<typeof executeFn>>;
    try {
      sendResult = await executeFn({
        candidateId,
        candidateName: snapshot.name,
        candidateEmail: snapshot.email,
        templateKey: snapshot.templateKey,
        byUserId,
        inFlightOnboardingId: prepared.onboardingId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const looksTimeout = /timeout|ETIMEDOUT|aborted|network/i.test(message);
      if (looksTimeout) {
        pushP260Audit(
          auditTrail,
          "timeout_reconcile",
          `Ambiguous/timeout — no Paperwork Sent write; reconcile only. ${message}`,
          candidateId,
        );
        return {
          ok: false,
          mode: "send",
          phase: P260_PHASE,
          source: P260_SOURCE,
          aborted: true,
          abortReason: `timeout_reconcile: ${message}`,
          candidateId,
          signatureRequestId: null,
          paperworkStatus: null,
          workflowStatus: null,
          idempotencyKey: eligibility.idempotencyKey,
          preflight,
          eligibility,
          verified: false,
          writes: { dropboxPacketCreated: false, workflowPaperworkSent: false },
          auditTrail,
          detail: `Timeout/ambiguous Dropbox response — did not advance to Paperwork Sent. ${message}`,
        };
      }
      pushP260Audit(auditTrail, "send_failed", message, candidateId);
      return {
        ok: false,
        mode: "send",
        phase: P260_PHASE,
        source: P260_SOURCE,
        aborted: false,
        abortReason: message,
        candidateId,
        signatureRequestId: null,
        paperworkStatus: null,
        workflowStatus: null,
        idempotencyKey: eligibility.idempotencyKey,
        preflight,
        eligibility,
        verified: false,
        writes: { dropboxPacketCreated: false, workflowPaperworkSent: false },
        auditTrail,
        detail: message,
      };
    }

    if (!sendResult.ok || !sendResult.signatureRequestId) {
      const err = sendResult.error ?? "missing signatureRequestId";
      const looksTimeout = Boolean(sendResult.transient) || /timeout|ETIMEDOUT/i.test(err);
      if (looksTimeout) {
        pushP260Audit(auditTrail, "timeout_reconcile", err, candidateId);
      } else {
        pushP260Audit(auditTrail, "send_failed", err, candidateId);
      }
      return {
        ok: false,
        mode: "send",
        phase: P260_PHASE,
        source: P260_SOURCE,
        aborted: false,
        abortReason: err,
        candidateId,
        signatureRequestId: null,
        paperworkStatus: sendResult.paperworkStatus ?? null,
        workflowStatus: sendResult.workflowStatus ?? null,
        idempotencyKey: eligibility.idempotencyKey,
        preflight,
        eligibility,
        verified: false,
        writes: { dropboxPacketCreated: false, workflowPaperworkSent: false },
        auditTrail,
        detail: err,
      };
    }

    const signatureRequestId = sendResult.signatureRequestId;

    // Paperwork Sent only after Dropbox success.
    await upsertFn({ candidateId, signatureRequestId, byUserId });
    pushP260Audit(
      auditTrail,
      "workflow_paperwork_sent",
      "Workflow advanced after Dropbox success",
      candidateId,
      signatureRequestId,
    );

    const verified = await verifyFn(signatureRequestId);
    pushP260Audit(
      auditTrail,
      "post_send_verify",
      verified ? "Dropbox re-read OK" : "Dropbox re-read failed",
      candidateId,
      signatureRequestId,
    );

    await recordIdempoFn({
      candidateId,
      email: snapshot.email,
      signatureRequestId,
      idempotencyKey: eligibility.idempotencyKey,
    });

    pushP260Audit(
      auditTrail,
      "send_success",
      `signatureRequestId=${signatureRequestId}`,
      candidateId,
      signatureRequestId,
    );

    return {
      ok: verified,
      mode: "send",
      phase: P260_PHASE,
      source: P260_SOURCE,
      aborted: false,
      abortReason: null,
      candidateId,
      signatureRequestId,
      paperworkStatus: sendResult.paperworkStatus ?? "sent",
      workflowStatus: "Paperwork Sent",
      idempotencyKey: eligibility.idempotencyKey,
      preflight,
      eligibility,
      verified,
      writes: {
        dropboxPacketCreated: true,
        workflowPaperworkSent: true,
      },
      auditTrail,
      detail: verified
        ? `Sent and verified via ${P260_SOURCE}.`
        : `Sent but post-send Dropbox verify failed for ${signatureRequestId}.`,
    };
  } finally {
    releaseFn(eligibility.idempotencyKey);
  }
}
