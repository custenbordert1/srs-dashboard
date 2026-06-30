import type { BreezyJob } from "@/lib/breezy-api";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { buildPaperworkSendEligibility } from "@/lib/autonomous-paperwork-send-engine/build-paperwork-send-eligibility";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import type { HiringDecision } from "@/lib/autonomous-hiring-decision-engine/types";

export type P88AutonomousPaperworkPreview = {
  phase: "P88";
  previewMode: true;
  summary: string;
  fastTrackCandidates: number;
  p84EligibleAfterFastTrack: number;
  pipelineSteps: string[];
  blockersBeforeLive: string[];
  estimatedPaperworkSendsIfEnabled: number;
};

/**
 * P88 design (preview only): wires P87 Fast Track → P83 advancement → P84 paperwork send.
 * No live sends; no workflow mutations.
 */
export function buildP88AutonomousPaperworkPreview(input: {
  fastTrackDecisions: HiringDecision[];
  rows: ScoredCandidateWorkflowRow[];
  jobsByPositionId: Map<string, BreezyJob>;
  onboardingByCandidateId: Map<string, CandidateOnboardingRecord>;
}): P88AutonomousPaperworkPreview {
  const rowById = new Map(input.rows.map((row) => [row.candidateId, row]));
  let p84Eligible = 0;

  for (const decision of input.fastTrackDecisions) {
    const row = rowById.get(decision.candidateId);
    if (!row) continue;
    const eligibility = buildPaperworkSendEligibility({
      row,
      onboarding: input.onboardingByCandidateId.get(row.candidateId) ?? null,
      jobsByPositionId: input.jobsByPositionId,
    });
    if (eligibility.eligible) p84Eligible += 1;
  }

  const blockers: string[] = [
    "P84 live send disabled (preview only)",
    "P87 must remain in preview until executive sign-off",
    "Recruiter assignment required for all P84 sends",
    "Published job match required per candidate",
  ];
  if (p84Eligible < input.fastTrackDecisions.length) {
    blockers.push(
      `${input.fastTrackDecisions.length - p84Eligible} fast-track candidates fail P84 eligibility gates`,
    );
  }

  return {
    phase: "P88",
    previewMode: true,
    summary: `P88 preview: ${p84Eligible}/${input.fastTrackDecisions.length} fast-track candidates would enter autonomous paperwork (P84 preview gates).`,
    fastTrackCandidates: input.fastTrackDecisions.length,
    p84EligibleAfterFastTrack: p84Eligible,
    pipelineSteps: [
      "P87 Fast Track recommendation",
      "P83 advancement to Paperwork Needed (preview)",
      "P84 eligibility verification (no live send)",
      "P71 execution engine dry-run",
      "Signature monitoring (P84 monitorSignatures)",
    ],
    blockersBeforeLive: blockers,
    estimatedPaperworkSendsIfEnabled: p84Eligible,
  };
}
