import type { BreezyCandidate } from "@/lib/breezy-api";
import { buildCandidateScoringInput, scoringHaystack } from "@/lib/candidate-resume-prep";
import {
  labelForSkillTag,
  scoreExperienceFromTags,
} from "@/lib/recruiting-intelligence/skill-tags";
import {
  parseCandidateApplication,
  normalizeZip,
} from "@/lib/recruiting-intelligence/resume-parser";
import {
  distanceMilesForCandidateToJob,
  scoreTravelRadiusMatch,
} from "@/lib/recruiting-intelligence/travel-radius";
import type {
  CandidateIntelligenceContext,
  CandidateIntelligenceScore,
  CandidateMatchFactors,
  CandidateMatchLevel,
  CandidateSkillTagId,
} from "@/lib/recruiting-intelligence/types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const WEIGHTS = {
  experience: 0.35,
  travelRadius: 0.25,
  responseSpeed: 0.2,
  resumeQuality: 0.2,
} as const;

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function parseDate(raw: string): Date | null {
  if (!raw.trim()) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function scoreResponseSpeed(candidate: BreezyCandidate, reference: Date): number {
  const applied = parseDate(candidate.appliedDate);
  if (!applied) return 35;
  const days = Math.max(0, Math.round((reference.getTime() - applied.getTime()) / MS_PER_DAY));
  if (days <= 1) return 100;
  if (days <= 3) return 90;
  if (days <= 7) return 75;
  if (days <= 14) return 58;
  if (days <= 30) return 40;
  return 25;
}

function scoreResumeQuality(hasResume: boolean, resumeText: string, skillTagCount: number): number {
  if (!hasResume) return 8;
  const length = resumeText.trim().length;
  let score = 35;
  if (length >= 120) score += 20;
  if (length >= 400) score += 15;
  if (length >= 900) score += 10;
  score += Math.min(25, skillTagCount * 4);
  if (resumeText.includes("@") && resumeText.includes(".")) score += 5;
  return clamp(score);
}

function matchLevelFromScore(matchPercent: number, hasResume: boolean): CandidateMatchLevel {
  if (!hasResume && matchPercent < 55) return "no_resume";
  if (matchPercent >= 75) return "high";
  if (matchPercent >= 55) return "medium";
  return "low";
}

function buildSummary(
  matchPercent: number,
  matchLevel: CandidateMatchLevel,
  skillLabels: string[],
  distanceMiles: number | null,
  hasResume: boolean,
): string {
  const tagHint = skillLabels.length > 0 ? skillLabels.slice(0, 3).join(", ") : "limited retail signals";
  const distanceHint =
    distanceMiles === null ? "distance unknown" : `${distanceMiles} mi from job`;
  const resumeHint = hasResume ? "resume/application parsed" : "no resume text on file";
  return `${matchPercent}% match (${matchLevel.replace("_", " ")}) · ${tagHint} · ${distanceHint} · ${resumeHint}`;
}

function weightedMatchPercent(factors: CandidateMatchFactors): number {
  return clamp(
    factors.experience * WEIGHTS.experience +
      factors.travelRadius * WEIGHTS.travelRadius +
      factors.responseSpeed * WEIGHTS.responseSpeed +
      factors.resumeQuality * WEIGHTS.resumeQuality,
  );
}

function logIntelligenceScore(
  candidate: BreezyCandidate,
  score: CandidateIntelligenceScore,
  context: CandidateIntelligenceContext,
): void {
  if (process.env.NODE_ENV === "production") return;
  console.info("[candidate-intelligence] scored", {
    candidateId: candidate.candidateId,
    positionId: candidate.positionId,
    matchPercent: score.matchPercent,
    matchLevel: score.matchLevel,
    hasResume: score.hasResume,
    distanceMiles: score.distanceMiles,
    skillTags: score.skillTags,
    factors: score.factors,
    job: context.job
      ? { city: context.job.city, state: context.job.state, hasZip: Boolean(context.job.zip) }
      : null,
  });
}

export function scoreCandidateIntelligence(
  candidate: BreezyCandidate,
  context: CandidateIntelligenceContext = {},
): CandidateIntelligenceScore {
  const reference = new Date(context.referenceIso ?? new Date().toISOString());
  const { resumeText, hasResume, skillTags } = parseCandidateApplication(candidate);
  const skillTagLabels = skillTags.map((id) => labelForSkillTag(id));
  const resumeMentionsTravel = skillTags.includes("travel_willing") || skillTags.includes("overnight_travel");

  const experience = scoreExperienceFromTags(skillTags);
  const breezyBoost = candidate.score !== undefined ? Math.min(12, Math.round(candidate.score / 10)) : 0;
  const experienceScore = clamp(experience + breezyBoost);

  const candidateZip = normalizeZip(candidate.zipCode);
  const distanceMiles = context.job
    ? distanceMilesForCandidateToJob(candidateZip, candidate.city, candidate.state, {
        ...context.job,
        zip: context.job.zip,
      })
    : null;
  const travelRadius = scoreTravelRadiusMatch(distanceMiles, resumeMentionsTravel);
  const responseSpeed = scoreResponseSpeed(candidate, reference);
  const resumeQuality = scoreResumeQuality(hasResume, resumeText, skillTags.length);

  const factors: CandidateMatchFactors = {
    experience: experienceScore,
    travelRadius,
    responseSpeed,
    resumeQuality,
  };

  let matchPercent = weightedMatchPercent(factors);
  const matchLevel = matchLevelFromScore(matchPercent, hasResume);

  const scoringNotes: string[] = [];
  if (!context.job) {
    scoringNotes.push("Job location unavailable — travel radius uses candidate location only.");
  }
  if (!hasResume) {
    scoringNotes.push("No resume/application body detected in Breezy profile fields.");
  }
  if (!candidateZip && context.job) {
    scoringNotes.push("Candidate ZIP missing — distance estimated from city/state.");
  }

  if (!hasResume && matchLevel === "no_resume") {
    matchPercent = Math.min(matchPercent, 54);
  }

  const isTopMatch = matchLevel === "high" && matchPercent >= 82;
  const summary = buildSummary(matchPercent, matchLevel, skillTagLabels, distanceMiles, hasResume);

  const result: CandidateIntelligenceScore = {
    matchPercent,
    matchLevel,
    isTopMatch,
    skillTags,
    skillTagLabels,
    hasResume,
    factors,
    distanceMiles,
    resumeKeywordCount: skillTags.length,
    summary,
    scoringNotes,
  };

  logIntelligenceScore(candidate, result, context);

  return result;
}

export function scoreCandidatesIntelligence(
  candidates: BreezyCandidate[],
  context: CandidateIntelligenceContext & {
    jobsByPositionId?: Map<string, CandidateIntelligenceContext["job"]>;
  } = {},
): Map<string, CandidateIntelligenceScore> {
  const map = new Map<string, CandidateIntelligenceScore>();
  for (const candidate of candidates) {
    const job = context.jobsByPositionId?.get(candidate.positionId);
    map.set(
      candidate.candidateId,
      scoreCandidateIntelligence(candidate, {
        ...context,
        job: job ?? context.job,
      }),
    );
  }
  return map;
}

export function buildJobsByPositionId(
  jobs: Array<{ jobId: string; city: string; state: string; zip?: string }>,
): Map<string, { city: string; state: string; zip?: string }> {
  const map = new Map<string, { city: string; state: string; zip?: string }>();
  for (const job of jobs) {
    map.set(job.jobId, { city: job.city, state: job.state, zip: job.zip });
  }
  return map;
}

export { scoringHaystack, buildCandidateScoringInput };
export type { CandidateSkillTagId };
