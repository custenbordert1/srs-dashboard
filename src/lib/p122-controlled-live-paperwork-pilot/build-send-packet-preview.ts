import { p100AuditLogPath } from "@/lib/controlled-live-send/controlled-live-send-store";
import type { PilotCandidateEvaluation, PilotSendPacketPreview } from "@/lib/p122-controlled-live-paperwork-pilot/types";

export function buildPilotSendPacketPreview(input: {
  candidate: PilotCandidateEvaluation;
  auditDestination?: string;
  /** Build preview even when status is blocked (caller still enforces safety). */
  forceReadyToSend?: boolean;
}): PilotSendPacketPreview | null {
  if (input.candidate.status !== "ready_to_send" && input.forceReadyToSend !== true) {
    return null;
  }

  return {
    candidateId: input.candidate.candidateId,
    candidateName: input.candidate.candidateName,
    candidateEmail: input.candidate.email,
    jobOrProject: input.candidate.projectLabel ?? "Unknown project",
    paperworkTemplate: input.candidate.templateKey ?? "onboarding_packet",
    safetyChecks: input.candidate.safetyChecks,
    auditDestination: input.auditDestination ?? p100AuditLogPath(),
  };
}
