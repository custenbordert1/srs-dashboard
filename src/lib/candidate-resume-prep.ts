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

/** Parses resume/application text from Breezy profile fields included in candidate sync (read-only). */
export const RESUME_PARSING_CAPABILITIES: ResumeParsingCapabilities = {
  enabled: true,
  provider: "local-heuristic",
  notes: "Scores use Breezy profile + resume/application fields from the candidate sync payload.",
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
