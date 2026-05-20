import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import type { CandidateWorkflowState } from "@/lib/candidate-workflow-types";
import { getAssignedStatesForDm, getDmForState } from "@/lib/dm-territory-map";
import {
  buildCandidateScoringInput,
  type CandidateScoringInput,
} from "@/lib/candidate-resume-prep";
import {
  candidateDisplayName,
  candidatesForJob,
  isInterviewingStage,
  parseDate,
} from "@/lib/dm-dashboard/territory-shared";
import {
  scoreCandidateComprehensive,
  type CandidateScoreResult,
} from "@/lib/candidate-scoring-engine";

export type CandidateIntelligenceProfile = {
  candidateId: string;
  candidateName: string;
  score: number;
  tier: CandidateScoreResult["tier"];
  tierLabel: string;
  strengths: string[];
  concerns: string[];
  recommendedTerritories: string[];
  suggestedProjects: string[];
  bestFit: boolean;
  bestFitReason?: string;
  positionName: string;
  city: string;
  state: string;
  stage: string;
  source: string;
  extractedKeywords: string[];
};

export type CandidateIntelligenceSnapshot = {
  profiles: CandidateIntelligenceProfile[];
  bestFitCandidates: CandidateIntelligenceProfile[];
  averageScore: number;
  scoredCount: number;
};

const BEST_FIT_THRESHOLD = 78;

function inferSuggestedProjects(keywords: string[], positionName: string): string[] {
  const projects: string[] = [];
  const position = positionName.toLowerCase();
  if (keywords.some((k) => k.includes("Reset"))) projects.push("Store reset surge");
  if (keywords.some((k) => k.includes("Walmart") || k.includes("Target"))) {
    projects.push("Big-box coverage");
  }
  if (keywords.some((k) => k.includes("Grocery"))) projects.push("Grocery merchandising route");
  if (keywords.some((k) => k.includes("OOS"))) projects.push("OOS compliance blitz");
  if (keywords.some((k) => k.includes("Fixture"))) projects.push("Planogram / fixture set");
  if (position.includes("reset")) projects.push("Reset team placement");
  if (projects.length === 0) projects.push("General merchandising coverage");
  return [...new Set(projects)].slice(0, 4);
}

function buildStrengths(score: CandidateScoreResult, candidate: BreezyCandidate): string[] {
  const strengths: string[] = [];
  const { factors } = score;
  if (factors.merchandisingExperience >= 9) strengths.push("Strong merchandising background");
  if (factors.retailExperience >= 8) strengths.push("Retail / big-box experience");
  if (factors.resumeKeywords >= 10) strengths.push("Resume keyword match");
  if (factors.travelRadius >= 10) strengths.push("Travel / radius flexible");
  if (factors.territoryFit >= 12) strengths.push("Territory-aligned location");
  if (factors.communicationResponsiveness >= 10) strengths.push("Fast applicant response");
  if (factors.interviewLikelihood >= 12) strengths.push("Interview-ready stage");
  if (isInterviewingStage(candidate.stage)) strengths.push("Active interview pipeline");
  if (score.extractedKeywords.includes("Walmart")) strengths.push("Walmart experience");
  if (score.extractedKeywords.includes("Reset")) strengths.push("Reset experience");
  return strengths.length > 0 ? strengths.slice(0, 5) : ["Profile meets baseline criteria"];
}

function buildConcerns(score: CandidateScoreResult, candidate: BreezyCandidate): string[] {
  const concerns: string[] = [];
  const { factors } = score;
  if (factors.merchandisingExperience < 6) concerns.push("Limited merchandising signals");
  if (factors.retailExperience < 5) concerns.push("Weak retail experience match");
  if (factors.travelRadius < 6) concerns.push("Travel radius unclear");
  if (factors.territoryFit < 8) concerns.push("Outside primary territory");
  if (factors.communicationResponsiveness < 6) concerns.push("Slow response / aging application");
  if (factors.interviewLikelihood < 7) concerns.push("Early-stage — interview likelihood low");
  const applied = parseDate(candidate.appliedDate);
  if (applied) {
    const days = Math.round((Date.now() - applied.getTime()) / (24 * 60 * 60 * 1000));
    if (days >= 21 && !isInterviewingStage(candidate.stage)) {
      concerns.push(`Stalled ${days}d in ${candidate.stage || "pipeline"}`);
    }
  }
  return concerns.slice(0, 4);
}

function buildRecommendedTerritories(candidate: BreezyCandidate): string[] {
  const dm = getDmForState(candidate.state);
  if (!dm) return [];
  return getAssignedStatesForDm(dm).slice(0, 8);
}

export function buildCandidateIntelligenceProfile(
  input: CandidateScoringInput,
  context: {
    referenceIso: string;
    territoryStates?: string[];
    job?: Pick<BreezyJob, "city" | "state">;
    workflows?: CandidateWorkflowState;
  },
): CandidateIntelligenceProfile {
  const { candidate } = input;
  const scored = scoreCandidateComprehensive(input, {
    referenceIso: context.referenceIso,
    territoryStates: context.territoryStates,
    job: context.job,
  });

  const strengths = buildStrengths(scored, candidate);
  const concerns = buildConcerns(scored, candidate);
  const bestFit = scored.score >= BEST_FIT_THRESHOLD && concerns.length <= 2;

  return {
    candidateId: candidate.candidateId,
    candidateName: candidateDisplayName(candidate),
    score: scored.score,
    tier: scored.tier,
    tierLabel: scored.tierLabel,
    strengths,
    concerns,
    recommendedTerritories: buildRecommendedTerritories(candidate),
    suggestedProjects: inferSuggestedProjects(scored.extractedKeywords, candidate.positionName),
    bestFit,
    bestFitReason: bestFit
      ? `Score ${scored.score}/100 with ${strengths.slice(0, 2).join(" · ")}`
      : undefined,
    positionName: candidate.positionName || "—",
    city: candidate.city || "—",
    state: candidate.state || "—",
    stage: candidate.stage || "—",
    source: candidate.source || "—",
    extractedKeywords: scored.extractedKeywords,
  };
}

export function buildCandidateIntelligenceSnapshot(
  candidates: BreezyCandidate[],
  referenceIso: string,
  options?: {
    territoryStates?: string[];
    limit?: number;
    workflows?: CandidateWorkflowState;
  },
): CandidateIntelligenceSnapshot {
  const limit = options?.limit ?? 50;
  const profiles = [...candidates]
    .map((candidate) =>
      buildCandidateIntelligenceProfile(buildCandidateScoringInput(candidate), {
        referenceIso,
        territoryStates: options?.territoryStates,
        workflows: options?.workflows,
      }),
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const bestFitCandidates = profiles.filter((p) => p.bestFit).slice(0, 12);
  const averageScore =
    profiles.length > 0
      ? Math.round(profiles.reduce((sum, p) => sum + p.score, 0) / profiles.length)
      : 0;

  return {
    profiles,
    bestFitCandidates,
    averageScore,
    scoredCount: profiles.length,
  };
}

export function rankCandidatesForJob(
  job: BreezyJob,
  candidates: BreezyCandidate[],
  referenceIso: string,
  topN = 5,
): CandidateIntelligenceProfile[] {
  return candidatesForJob(job, candidates)
    .map((candidate) =>
      buildCandidateIntelligenceProfile(buildCandidateScoringInput(candidate), {
        referenceIso,
        job,
      }),
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}
