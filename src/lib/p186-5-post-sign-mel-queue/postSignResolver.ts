import type { P1865PostSignEvent } from "@/lib/p186-5-post-sign-mel-queue/types";

export type PostSignIntakeResult =
  | { ok: true; event: P1865PostSignEvent }
  | { ok: false; reason: string; code: string };

/**
 * Accept only events that resolve to one candidate, envelope, send/rollout,
 * onboarding assignment, and job/project. Ambiguous events are rejected/held.
 */
export function resolvePostSignEvent(input: {
  eventId?: string | null;
  candidateId?: string | null;
  envelopeId?: string | null;
  rolloutOrSendId?: string | null;
  onboardingAssignmentId?: string | null;
  jobOrProjectId?: string | null;
  envelopeStatus?: string | null;
  sourceSystem: string;
  at?: string | null;
  templateKey?: string | null;
  requiredSignersCompleted?: boolean | null;
  requiredFieldsPresent?: boolean | null;
  declinedOrCanceled?: boolean;
  expiredOrFailed?: boolean;
  ambiguousCandidateIds?: string[];
}): PostSignIntakeResult {
  if (input.ambiguousCandidateIds && input.ambiguousCandidateIds.length > 1) {
    return { ok: false, reason: "Ambiguous candidate match", code: "ambiguous_candidate" };
  }
  const candidateId = input.candidateId?.trim() || null;
  const envelopeId = input.envelopeId?.trim() || null;
  const rolloutOrSendId = input.rolloutOrSendId?.trim() || null;
  const onboardingAssignmentId = input.onboardingAssignmentId?.trim() || null;
  const jobOrProjectId = input.jobOrProjectId?.trim() || null;

  if (!candidateId) {
    return { ok: false, reason: "Candidate identity unresolved", code: "identity_unresolved" };
  }
  if (!envelopeId) {
    return { ok: false, reason: "Envelope ID missing", code: "envelope_missing" };
  }
  if (!rolloutOrSendId) {
    return { ok: false, reason: "Rollout/send operation unresolved", code: "send_unresolved" };
  }
  if (!onboardingAssignmentId) {
    return { ok: false, reason: "Onboarding assignment unresolved", code: "assignment_unresolved" };
  }
  if (!jobOrProjectId) {
    return { ok: false, reason: "Job/project unresolved", code: "job_unresolved" };
  }

  return {
    ok: true,
    event: {
      eventId: input.eventId?.trim() || `pse-${candidateId}-${envelopeId}`,
      candidateId,
      envelopeId,
      rolloutOrSendId,
      onboardingAssignmentId,
      jobOrProjectId,
      envelopeStatus: input.envelopeStatus ?? null,
      sourceSystem: input.sourceSystem,
      at: input.at ?? new Date().toISOString(),
      templateKey: input.templateKey ?? null,
      requiredSignersCompleted: input.requiredSignersCompleted ?? null,
      requiredFieldsPresent: input.requiredFieldsPresent ?? null,
      declinedOrCanceled: Boolean(input.declinedOrCanceled),
      expiredOrFailed: Boolean(input.expiredOrFailed),
    },
  };
}
