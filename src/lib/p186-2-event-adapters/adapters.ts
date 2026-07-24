import { normalizeLifecycleEvent } from "@/lib/p186-2-event-adapters/normalize";
import type { P186NormalizedLifecycleEvent } from "@/lib/p186-2-event-adapters/types";

export function adaptBreezyStageChange(input: {
  candidateId: string;
  stage?: string | null;
  previousStage?: string | null;
  at?: string;
  actor?: string;
}): { ok: true; event: P186NormalizedLifecycleEvent } | { ok: false; detail: string } {
  const stage = (input.stage ?? "").toLowerCase();
  let eventType: "candidate_applied" | "breezy_stage_changed" | "recruiter_claimed" =
    "breezy_stage_changed";
  if (!input.previousStage && (stage.includes("applied") || stage === "")) {
    eventType = "candidate_applied";
  } else if (stage.includes("review") || stage.includes("screen")) {
    eventType = "recruiter_claimed";
  }
  const n = normalizeLifecycleEvent({
    candidateId: input.candidateId,
    eventType,
    sourceSystem: "breezy",
    sourceTimestamp: input.at,
    actor: input.actor ?? "system:breezy",
    redactedMetadata: {
      stage: input.stage ?? null,
      previousStage: input.previousStage ?? null,
    },
  });
  return n.ok ? n : { ok: false, detail: n.detail };
}

export function adaptRecruiterAction(input: {
  candidateId: string;
  action: "claim" | "recommend" | "reject" | string;
  at?: string;
  actor?: string;
}): { ok: true; event: P186NormalizedLifecycleEvent } | { ok: false; detail: string } {
  const action = input.action.toLowerCase();
  let eventType: "recruiter_claimed" | "recruiter_recommended" | "recruiter_rejected" | "unmapped" =
    "unmapped";
  if (action === "claim" || action === "screen") eventType = "recruiter_claimed";
  else if (action === "recommend" || action === "hire_recommend") eventType = "recruiter_recommended";
  else if (action === "reject" || action === "not_qualified") eventType = "recruiter_rejected";
  const n = normalizeLifecycleEvent({
    candidateId: input.candidateId,
    eventType,
    sourceSystem: "recruiter",
    sourceTimestamp: input.at,
    actor: input.actor ?? "user:recruiter",
    redactedMetadata: { action },
  });
  return n.ok ? n : { ok: false, detail: n.detail };
}

export function adaptOperatorApproval(input: {
  candidateId: string;
  decision: "approve" | "deny" | string;
  at?: string;
  actor?: string;
  evidenceRef?: string | null;
}): { ok: true; event: P186NormalizedLifecycleEvent } | { ok: false; detail: string } {
  const decision = input.decision.toLowerCase();
  const eventType =
    decision === "approve" || decision === "approved"
      ? "operator_approved"
      : decision === "deny" || decision === "denied"
        ? "operator_denied"
        : "unmapped";
  const n = normalizeLifecycleEvent({
    candidateId: input.candidateId,
    eventType,
    sourceSystem: "operator",
    sourceTimestamp: input.at,
    actor: input.actor ?? "operator:unknown",
    redactedMetadata: {
      decision,
      evidenceRef: input.evidenceRef ? String(input.evidenceRef).slice(0, 64) : null,
    },
  });
  return n.ok ? n : { ok: false, detail: n.detail };
}

export function adaptPaperworkEngineEvent(input: {
  candidateId: string;
  status:
    | "paperwork_needed"
    | "confirmed_sent"
    | "viewed"
    | "signed"
    | "declined"
    | "canceled"
    | "failed"
    | string;
  source?: "p184" | "p185";
  at?: string;
  envelopeIdHash?: string | null;
}): { ok: true; event: P186NormalizedLifecycleEvent } | { ok: false; detail: string } {
  const status = input.status.toLowerCase();
  const allowed = new Set([
    "paperwork_needed",
    "confirmed_sent",
    "viewed",
    "signed",
    "declined",
    "canceled",
    "failed",
  ]);
  const eventType = allowed.has(status) ? status : "unmapped";
  const n = normalizeLifecycleEvent({
    candidateId: input.candidateId,
    eventType,
    sourceSystem: input.source ?? "p185",
    sourceTimestamp: input.at,
    actor: `system:${input.source ?? "p185"}`,
    redactedMetadata: {
      status,
      envelopeIdHash: input.envelopeIdHash ?? null,
    },
  });
  return n.ok ? n : { ok: false, detail: n.detail };
}

export function adaptDropboxSignStatus(input: {
  candidateId: string;
  eventType: string;
  signatureRequestIdHash?: string | null;
  at?: string;
}): { ok: true; event: P186NormalizedLifecycleEvent } | { ok: false; detail: string } {
  const t = input.eventType.toLowerCase();
  let mapped: "viewed" | "signed" | "declined" | "canceled" | "failed" | "unmapped" = "unmapped";
  if (t.includes("viewed")) mapped = "viewed";
  else if (t.includes("all_signed") || t.includes("signed")) mapped = "signed";
  else if (t.includes("declin")) mapped = "declined";
  else if (t.includes("cancel")) mapped = "canceled";
  else if (t.includes("fail") || t.includes("error")) mapped = "failed";
  const n = normalizeLifecycleEvent({
    candidateId: input.candidateId,
    eventType: mapped,
    sourceSystem: "dropbox_sign",
    sourceTimestamp: input.at,
    actor: "system:dropbox_sign",
    redactedMetadata: {
      dropboxEvent: t.slice(0, 80),
      signatureRequestIdHash: input.signatureRequestIdHash ?? null,
    },
  });
  return n.ok ? n : { ok: false, detail: n.detail };
}

export function adaptOnboardingComplete(input: {
  candidateId: string;
  at?: string;
}): { ok: true; event: P186NormalizedLifecycleEvent } | { ok: false; detail: string } {
  return normalizeLifecycleEvent({
    candidateId: input.candidateId,
    eventType: "onboarding_complete",
    sourceSystem: "onboarding",
    sourceTimestamp: input.at,
    actor: "system:onboarding",
  });
}

export function adaptReadyForMel(input: {
  candidateId: string;
  at?: string;
}): { ok: true; event: P186NormalizedLifecycleEvent } | { ok: false; detail: string } {
  return normalizeLifecycleEvent({
    candidateId: input.candidateId,
    eventType: "ready_for_mel",
    sourceSystem: "mel",
    sourceTimestamp: input.at,
    actor: "system:mel",
  });
}

export function adaptMelExported(input: {
  candidateId: string;
  at?: string;
}): { ok: true; event: P186NormalizedLifecycleEvent } | { ok: false; detail: string } {
  return normalizeLifecycleEvent({
    candidateId: input.candidateId,
    eventType: "mel_exported",
    sourceSystem: "mel",
    sourceTimestamp: input.at,
    actor: "system:mel",
  });
}

export function adaptReconcileTick(input: {
  candidateId: string;
  at?: string;
}): { ok: true; event: P186NormalizedLifecycleEvent } | { ok: false; detail: string } {
  return normalizeLifecycleEvent({
    candidateId: input.candidateId,
    eventType: "reconcile_tick",
    sourceSystem: "reconcile",
    sourceTimestamp: input.at,
    actor: "system:reconcile",
  });
}

/** Map workflow store mutation into a best-effort observe event (shadow only). */
export function adaptWorkflowStoreChange(input: {
  candidateId: string;
  workflowStatus?: string | null;
  paperworkStatus?: string | null;
  at?: string;
  actor?: string;
}): { ok: true; event: P186NormalizedLifecycleEvent } | { ok: false; detail: string } {
  const wf = (input.workflowStatus ?? "").toLowerCase();
  const pw = (input.paperworkStatus ?? "").toLowerCase();
  let eventType:
    | "candidate_applied"
    | "recruiter_claimed"
    | "paperwork_needed"
    | "confirmed_sent"
    | "viewed"
    | "signed"
    | "ready_for_mel"
    | "mel_exported"
    | "onboarding_complete"
    | "unmapped" = "unmapped";

  if (pw === "viewed") eventType = "viewed";
  else if (pw === "signed" || wf === "signed") eventType = "signed";
  else if (pw === "sent" || wf === "paperwork sent") eventType = "confirmed_sent";
  else if (wf === "paperwork needed") eventType = "paperwork_needed";
  else if (wf === "ready for mel") eventType = "ready_for_mel";
  else if (wf === "loaded in mel" || wf === "active rep") eventType = "mel_exported";
  else if (wf === "awaiting dd verification") eventType = "onboarding_complete";
  else if (wf === "needs review" || wf === "qualified") eventType = "recruiter_claimed";
  else if (wf === "applied") eventType = "candidate_applied";

  return normalizeLifecycleEvent({
    candidateId: input.candidateId,
    eventType,
    sourceSystem: "workflow_store",
    sourceTimestamp: input.at,
    actor: input.actor ?? "system:workflow_store",
    redactedMetadata: {
      workflowStatus: input.workflowStatus ?? null,
      paperworkStatus: input.paperworkStatus ?? null,
    },
  });
}
