import type { AutonomousDecision } from "@/lib/autonomous-decision-engine/types";

export function buildExecutiveExplanation(decision: Pick<
  AutonomousDecision,
  "decision" | "reason" | "confidence" | "risk" | "requiredEngine" | "blocked" | "automationReady" | "humanApprovalRequired"
>): string {
  const approval = decision.humanApprovalRequired
    ? "Human approval required before execution."
    : decision.automationReady
      ? "Automation-ready in preview — no live execution."
      : "Advisory recommendation only.";

  const blockedNote = decision.blocked ? " Currently blocked." : "";

  return `${decision.decision}: ${decision.reason} Confidence ${decision.confidence}%, ${decision.risk} risk, owned by ${decision.requiredEngine}. ${approval}${blockedNote}`;
}

export function buildSimulationImpact(decision: AutonomousDecision): string {
  const candidateNote =
    decision.affectedCandidateNames.length > 0
      ? `Would affect ${decision.affectedCandidateNames.length} candidate${decision.affectedCandidateNames.length === 1 ? "" : "s"}.`
      : "Platform-level decision with no single-candidate scope.";

  return `${candidateNote} Expected: ${decision.expectedOutcome}. Estimated recruiter time saved: ${decision.estimatedRecruiterTimeSavedMinutes} min (preview estimate).`;
}
