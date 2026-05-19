import type { BreezyCandidate } from "@/lib/breezy-api";
import type { CandidateWorkflowStatus } from "@/lib/candidate-workflow-types";

/**
 * Unified scoring input — profile fields today; optional resume body when parsing ships.
 */
export type CandidateScoringInput = {
  candidate: BreezyCandidate;
  /** Reserved for future resume HTML/text parsing pipeline. */
  resumeText?: string;
  workflowStatus?: CandidateWorkflowStatus;
};

export type ResumeParsingCapabilities = {
  enabled: boolean;
  provider: "none" | "local-heuristic" | "external";
  notes: string;
};

/** Current production path: Breezy profile fields only. */
export const RESUME_PARSING_CAPABILITIES: ResumeParsingCapabilities = {
  enabled: false,
  provider: "local-heuristic",
  notes: "Resume body parsing is not wired yet. Scores use Breezy profile, stage, and source metadata.",
};

export function buildCandidateScoringInput(
  candidate: BreezyCandidate,
  options?: { resumeText?: string; workflowStatus?: CandidateWorkflowStatus },
): CandidateScoringInput {
  return {
    candidate,
    resumeText: options?.resumeText,
    workflowStatus: options?.workflowStatus,
  };
}

export function scoringHaystack(input: CandidateScoringInput): string {
  const { candidate, resumeText } = input;
  const profile = [
    candidate.firstName,
    candidate.lastName,
    candidate.email,
    candidate.phone,
    candidate.source,
    candidate.stage,
    candidate.positionName,
    candidate.city,
    candidate.state,
  ].join(" ");

  if (!resumeText?.trim()) return profile.toLowerCase();
  return `${profile} ${resumeText}`.toLowerCase();
}
