import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import { scoreCandidate, type CandidateAiScore } from "@/lib/candidate-ai-scoring";
import { scoreBreezyCandidate } from "@/lib/candidate-scoring-engine";
import {
  candidateDisplayName,
  candidatesForJob,
  cityKey,
  isInterviewingStage,
  parseDate,
} from "@/lib/dm-dashboard/territory-shared";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_JOBS_RANKED = 20;
const TOP_PER_JOB = 5;

export type RankedCandidateRow = {
  candidateId: string;
  name: string;
  numericScore: number;
  tierLabel: string;
  stage: string;
  source: string;
  city: string;
  state: string;
  appliedDate: string;
  highlights: string[];
};

export type JobCandidateRanking = {
  jobId: string;
  jobName: string;
  city: string;
  state: string;
  applicantCount: number;
  topCandidates: RankedCandidateRow[];
};

function sameState(a: string, b: string): boolean {
  return a.trim().toUpperCase().slice(0, 2) === b.trim().toUpperCase().slice(0, 2);
}

function scoreLocationProximity(candidate: BreezyCandidate, job: BreezyJob): number {
  if (cityKey(candidate.city, candidate.state) === cityKey(job.city, job.state)) return 15;
  if (sameState(candidate.state, job.state)) return 10;
  return 2;
}

function scoreResponsiveness(candidate: BreezyCandidate, reference: Date): number {
  const applied = parseDate(candidate.appliedDate);
  if (!applied) return 3;
  const days = Math.max(0, Math.round((reference.getTime() - applied.getTime()) / MS_PER_DAY));
  if (days <= 2) return 12;
  if (days <= 7) return 9;
  if (days <= 14) return 5;
  return 2;
}

function scoreRetailExperience(ai: CandidateAiScore): number {
  return Math.min(
    15,
    Math.round(
      (ai.breakdown.resetExperience + ai.breakdown.walmartTargetExperience) / 2,
    ),
  );
}

function buildHighlights(
  ai: CandidateAiScore,
  proximity: number,
  responsiveness: number,
  stage: string,
): string[] {
  const highlights: string[] = [];
  if (ai.breakdown.merchandisingKeywords >= 12) highlights.push("Merchandising");
  if (ai.breakdown.resetExperience >= 8) highlights.push("Reset exp");
  if (proximity >= 10) highlights.push("Local fit");
  if (responsiveness >= 9) highlights.push("Responsive");
  if (isInterviewingStage(stage)) highlights.push("Interview stage");
  if (ai.breakdown.stageProgression >= 7) highlights.push("Stage momentum");
  if (highlights.length === 0) highlights.push(ai.tierLabel);
  return highlights.slice(0, 4);
}

function scoreForJob(
  candidate: BreezyCandidate,
  job: BreezyJob,
  referenceIso: string,
): { ai: CandidateAiScore; composite: number; proximity: number; responsiveness: number } {
  const reference = new Date(referenceIso);
  const comprehensive = scoreBreezyCandidate(candidate, { referenceIso, job });
  const ai = scoreCandidate(candidate);
  const proximity = scoreLocationProximity(candidate, job);
  const responsiveness = scoreResponsiveness(candidate, reference);
  const retail = scoreRetailExperience(ai);
  const interviewBoost = isInterviewingStage(candidate.stage) ? 8 : 0;

  const composite = Math.min(
    100,
    Math.round(
      comprehensive.score * 0.7 +
        proximity * 0.8 +
        responsiveness * 0.5 +
        retail * 0.35 +
        interviewBoost,
    ),
  );

  return { ai, composite, proximity, responsiveness };
}

function toRow(
  candidate: BreezyCandidate,
  scored: ReturnType<typeof scoreForJob>,
): RankedCandidateRow {
  return {
    candidateId: candidate.candidateId,
    name: candidateDisplayName(candidate),
    numericScore: scored.composite,
    tierLabel: scored.ai.tierLabel,
    stage: candidate.stage || "—",
    source: candidate.source || "—",
    city: candidate.city || "—",
    state: candidate.state || "—",
    appliedDate: candidate.appliedDate || "—",
    highlights: buildHighlights(
      scored.ai,
      scored.proximity,
      scored.responsiveness,
      candidate.stage,
    ),
  };
}

export function rankCandidatesByJob(
  jobs: BreezyJob[],
  candidates: BreezyCandidate[],
  referenceIso: string,
  options?: { maxJobs?: number; topPerJob?: number },
): JobCandidateRanking[] {
  const maxJobs = options?.maxJobs ?? MAX_JOBS_RANKED;
  const topPerJob = options?.topPerJob ?? TOP_PER_JOB;

  const prioritizedJobs = [...jobs]
    .sort((a, b) => {
      const aCount = candidatesForJob(a, candidates).length;
      const bCount = candidatesForJob(b, candidates).length;
      return aCount - bCount || a.name.localeCompare(b.name);
    })
    .slice(0, maxJobs);

  return prioritizedJobs.map((job) => {
    const jobCandidates = candidatesForJob(job, candidates);
    const topCandidates = jobCandidates
      .map((candidate) => ({ candidate, scored: scoreForJob(candidate, job, referenceIso) }))
      .sort((a, b) => b.scored.composite - a.scored.composite)
      .slice(0, topPerJob)
      .map(({ candidate, scored }) => toRow(candidate, scored));

    return {
      jobId: job.jobId,
      jobName: job.name,
      city: job.city,
      state: job.state,
      applicantCount: jobCandidates.length,
      topCandidates,
    };
  });
}

export function rankTopCandidatesTerritory(
  candidates: BreezyCandidate[],
  limit = 15,
): RankedCandidateRow[] {
  return [...candidates]
    .map((candidate) => {
      const ai = scoreCandidate(candidate);
      return {
        candidate,
        composite: ai.numericScore,
        ai,
      };
    })
    .sort((a, b) => b.composite - a.composite)
    .slice(0, limit)
    .map(({ candidate, ai, composite }) => ({
      candidateId: candidate.candidateId,
      name: candidateDisplayName(candidate),
      numericScore: composite,
      tierLabel: ai.tierLabel,
      stage: candidate.stage || "—",
      source: candidate.source || "—",
      city: candidate.city || "—",
      state: candidate.state || "—",
      appliedDate: candidate.appliedDate || "—",
      highlights: [
        ai.breakdown.merchandisingKeywords >= 12 ? "Merchandising" : null,
        ai.breakdown.resetExperience >= 8 ? "Reset" : null,
        isInterviewingStage(candidate.stage) ? "Interviewing" : null,
      ].filter(Boolean) as string[],
    }));
}
