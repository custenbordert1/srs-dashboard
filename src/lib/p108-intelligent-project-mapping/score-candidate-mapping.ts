import type { BreezyJob } from "@/lib/breezy-api";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { suggestDmForCandidate } from "@/lib/candidate-dm-suggest";
import { normalizeStateCode } from "@/lib/dm-territory-map";
import { distanceBetweenLocations } from "@/lib/mel-matching/distance-utils";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import {
  clientsMatch,
  extractJobSignals,
  projectCodesMatch,
  titleSimilarityScore,
} from "@/lib/p108-intelligent-project-mapping/extract-job-signals";
import { historicalPatternBonus } from "@/lib/p108-intelligent-project-mapping/historical-mapping-patterns";
import type {
  CandidateMappingRecommendation,
  MappingDecision,
  MappingFactorScore,
} from "@/lib/p108-intelligent-project-mapping/types";
import type { HistoricalMappingPattern } from "@/lib/p108-intelligent-project-mapping/historical-mapping-patterns";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function normalizeState(state: string | undefined | null): string {
  return normalizeStateCode(state ?? "");
}

function normalizeCity(city: string | undefined | null): string {
  return (city ?? "").trim().toLowerCase();
}

function daysSince(iso: string | undefined | null): number | null {
  if (!iso?.trim()) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.floor((Date.now() - ms) / MS_PER_DAY));
}

function resolveMappingDecision(score: number): MappingDecision {
  if (score >= 85) return "AUTO_MAP";
  if (score >= 50) return "REVIEW";
  return "NO_MATCH";
}

function melCoverageDemandScore(
  state: string,
  city: string,
  opportunities: MelOpportunity[],
): { points: number; matched: boolean; detail: string; demandCount: number } {
  const stateCode = normalizeState(state);
  const cityNorm = normalizeCity(city);
  const open = opportunities.filter(
    (o) =>
      o.openStatus &&
      normalizeState(o.state) === stateCode &&
      (!cityNorm || normalizeCity(o.city) === cityNorm || normalizeCity(o.storeName) === cityNorm),
  );
  if (open.length >= 3) {
    return { points: 5, matched: true, detail: "High coverage demand in market", demandCount: open.length };
  }
  if (open.length >= 1) {
    return { points: 3, matched: true, detail: "Active project demand in market", demandCount: open.length };
  }
  return { points: 0, matched: false, detail: "No open MEL demand in market", demandCount: 0 };
}

function buildMappingReasons(factors: MappingFactorScore[]): string[] {
  const positives = factors.filter((f) => f.matched && f.points > 0).map((f) => f.detail);
  const concerns = factors.filter((f) => !f.matched && f.points <= 0).map((f) => f.detail);
  return [...positives, ...concerns.map((c) => (c.startsWith("•") ? c : `• ${c}`))];
}

function buildExplanationHeadline(decision: MappingDecision, score: number): string {
  if (decision === "AUTO_MAP") return `${score}% — Auto-map recommended`;
  if (decision === "REVIEW") return `${score}% — Needs review`;
  return `${score}% — No confident match`;
}

export function scoreCandidateAgainstPublishedJob(input: {
  row: ScoredCandidateWorkflowRow;
  closedJob: BreezyJob | undefined;
  publishedJob: BreezyJob;
  sourcePositionId: string;
  historicalPatterns: Map<string, HistoricalMappingPattern>;
  melOpportunities: MelOpportunity[];
}): { score: number; factors: MappingFactorScore[] } {
  const sourceTitle = input.closedJob?.name || input.row.positionName || "";
  const sourceCity = input.closedJob?.city || input.row.city || "";
  const sourceState = input.closedJob?.state || input.row.state || "";
  const sourceSignals = extractJobSignals(sourceTitle);
  const targetSignals = extractJobSignals(input.publishedJob.name);

  const factors: MappingFactorScore[] = [];

  const title = titleSimilarityScore(sourceTitle, input.publishedJob.name);
  factors.push({
    factor: "position_title",
    points: title.points,
    maxPoints: 25,
    matched: title.matched,
    detail: title.detail,
  });

  const sameClient = clientsMatch(sourceSignals.client, targetSignals.client);
  factors.push({
    factor: "client",
    points: sameClient ? 12 : 0,
    maxPoints: 12,
    matched: sameClient,
    detail: sameClient ? "Same client" : "Different client",
  });

  const sameCode = projectCodesMatch(sourceSignals.projectCode, targetSignals.projectCode);
  factors.push({
    factor: "project_code",
    points: sameCode ? 10 : 0,
    maxPoints: 10,
    matched: sameCode,
    detail: sameCode ? "Same project code" : "No project code match",
  });

  const sameCity =
    normalizeCity(sourceCity) &&
    normalizeCity(input.publishedJob.city) &&
    normalizeCity(sourceCity) === normalizeCity(input.publishedJob.city);
  factors.push({
    factor: "city",
    points: sameCity ? 15 : 0,
    maxPoints: 15,
    matched: Boolean(sameCity),
    detail: sameCity ? "Same city" : "Different city",
  });

  const sameState =
    normalizeState(sourceState) &&
    normalizeState(input.publishedJob.state) &&
    normalizeState(sourceState) === normalizeState(input.publishedJob.state);
  factors.push({
    factor: "state",
    points: sameState ? 8 : 0,
    maxPoints: 8,
    matched: Boolean(sameState),
    detail: sameState ? "Same state" : "Different state",
  });

  const sourceDm = suggestDmForCandidate({ candidateState: sourceState, jobState: sourceState });
  const targetDm = suggestDmForCandidate({ jobState: input.publishedJob.state });
  const sameTerritory = sourceDm !== "Unassigned" && sourceDm === targetDm;
  factors.push({
    factor: "territory_dm",
    points: sameTerritory ? 8 : 0,
    maxPoints: 8,
    matched: sameTerritory,
    detail: sameTerritory ? "Same territory / DM" : "Different territory",
  });

  const distanceMiles = distanceBetweenLocations(
    sourceCity,
    sourceState,
    input.publishedJob.city,
    input.publishedJob.state,
  );
  let distancePoints = 0;
  let distanceMatched = false;
  let distanceDetail = "Distance unknown";
  if (distanceMiles !== null) {
    if (distanceMiles <= 25) {
      distancePoints = 7;
      distanceMatched = true;
      distanceDetail = `Close proximity (${distanceMiles} mi)`;
    } else if (distanceMiles <= 75) {
      distancePoints = 4;
      distanceMatched = true;
      distanceDetail = `Regional proximity (${distanceMiles} mi)`;
    } else {
      distanceDetail = `Distant (${distanceMiles} mi)`;
    }
  }
  factors.push({
    factor: "distance",
    points: distancePoints,
    maxPoints: 7,
    matched: distanceMatched,
    detail: distanceDetail,
  });

  factors.push({
    factor: "active_posting",
    points: 5,
    maxPoints: 5,
    matched: true,
    detail: "Active posting exists",
  });

  const historical = historicalPatternBonus({
    patterns: input.historicalPatterns,
    sourcePositionId: input.sourcePositionId,
    recommendedPositionId: input.publishedJob.jobId,
  });
  factors.push({
    factor: "historical_pattern",
    points: Math.max(0, historical.points),
    maxPoints: 5,
    matched: historical.matched,
    detail: historical.detail,
  });

  const postingAgeDays = daysSince(input.closedJob?.updatedDate ?? input.closedJob?.createdDate);
  let postingRecencyPoints = 0;
  let postingRecencyMatched = false;
  if (postingAgeDays !== null) {
    if (postingAgeDays <= 30) {
      postingRecencyPoints = 3;
      postingRecencyMatched = true;
    } else if (postingAgeDays <= 90) {
      postingRecencyPoints = 2;
      postingRecencyMatched = true;
    } else if (postingAgeDays <= 180) {
      postingRecencyPoints = 1;
      postingRecencyMatched = true;
    }
  }
  factors.push({
    factor: "posting_age",
    points: postingRecencyPoints,
    maxPoints: 3,
    matched: postingRecencyMatched,
    detail:
      postingAgeDays !== null ? `Closed posting age ${postingAgeDays}d` : "Posting age unknown",
  });

  const applicationAgeDays = daysSince(input.row.appliedDate);
  let applicationPoints = 0;
  let applicationMatched = false;
  if (applicationAgeDays !== null && applicationAgeDays <= 60) {
    applicationPoints = 2;
    applicationMatched = true;
  } else if (applicationAgeDays !== null && applicationAgeDays <= 120) {
    applicationPoints = 1;
    applicationMatched = true;
  }
  factors.push({
    factor: "application_date",
    points: applicationPoints,
    maxPoints: 2,
    matched: applicationMatched,
    detail:
      applicationAgeDays !== null
        ? `Application ${applicationAgeDays}d ago`
        : "Application date unknown",
  });

  const melDemand = melCoverageDemandScore(
    input.publishedJob.state,
    input.publishedJob.city,
    input.melOpportunities,
  );
  factors.push({
    factor: "coverage_demand",
    points: melDemand.points,
    maxPoints: 5,
    matched: melDemand.matched,
    detail: melDemand.detail,
  });

  const jobAgeDays = daysSince(input.publishedJob.createdDate);
  let activeProjectPoints = 0;
  let activeProjectMatched = false;
  if (jobAgeDays !== null && jobAgeDays <= 90) {
    activeProjectPoints = 3;
    activeProjectMatched = true;
  } else if (jobAgeDays !== null && jobAgeDays <= 180) {
    activeProjectPoints = 1;
    activeProjectMatched = true;
  }
  factors.push({
    factor: "active_project_dates",
    points: activeProjectPoints,
    maxPoints: 3,
    matched: activeProjectMatched,
    detail:
      jobAgeDays !== null ? `Published posting ${jobAgeDays}d active` : "Active posting date unknown",
  });

  const recruiterAligned =
    input.row.recruiterAssignmentSource === "auto" ||
    Boolean(input.row.assignedRecruiter?.trim() && input.row.assignedRecruiter !== "Unassigned");
  factors.push({
    factor: "recruiter_decision",
    points: recruiterAligned ? 2 : 0,
    maxPoints: 2,
    matched: recruiterAligned,
    detail: recruiterAligned ? "Recruiter assignment present" : "No recruiter decision",
  });

  const rawScore = factors.reduce((sum, f) => sum + f.points, 0);
  const score = Math.min(100, Math.max(0, Math.round(rawScore)));

  return { score, factors };
}

export function recommendCandidateMapping(input: {
  row: ScoredCandidateWorkflowRow;
  closedJob: BreezyJob | undefined;
  sourcePositionId: string;
  publishedJobs: BreezyJob[];
  historicalPatterns: Map<string, HistoricalMappingPattern>;
  melOpportunities: MelOpportunity[];
}): CandidateMappingRecommendation {
  const sourceTitle = input.closedJob?.name || input.row.positionName || "Unknown";
  const sourceCity = input.closedJob?.city || input.row.city || "";
  const sourceState = input.closedJob?.state || input.row.state || "";
  const postingAgeDays = daysSince(input.closedJob?.updatedDate ?? input.closedJob?.createdDate);

  let best: {
    job: BreezyJob | null;
    score: number;
    factors: MappingFactorScore[];
  } = { job: null, score: 0, factors: [] };

  for (const publishedJob of input.publishedJobs) {
    const result = scoreCandidateAgainstPublishedJob({
      row: input.row,
      closedJob: input.closedJob,
      publishedJob,
      sourcePositionId: input.sourcePositionId,
      historicalPatterns: input.historicalPatterns,
      melOpportunities: input.melOpportunities,
    });
    if (result.score > best.score) {
      best = { job: publishedJob, score: result.score, factors: result.factors };
    }
  }

  const mappingDecision = resolveMappingDecision(best.score);
  const mappingReason = buildMappingReasons(best.factors);
  const territoryDm = suggestDmForCandidate({ candidateState: sourceState, jobState: sourceState });
  const distanceMiles =
    best.job &&
    distanceBetweenLocations(sourceCity, sourceState, best.job.city, best.job.state);

  const coverageDemandScore =
    best.factors.find((f) => f.factor === "coverage_demand")?.points ?? 0;

  return {
    candidateId: input.row.candidateId,
    candidateName: `${input.row.firstName ?? ""} ${input.row.lastName ?? ""}`.trim() || "Unknown",
    candidateEmail: input.row.email ?? null,
    appliedDate: input.row.appliedDate ?? null,
    currentClosedPosition: {
      positionId: input.sourcePositionId,
      title: sourceTitle,
      city: sourceCity,
      state: sourceState,
      breezyStatus: input.closedJob?.status ?? "unpublished",
      postingAgeDays,
    },
    recommendedProjectId: best.job?.jobId ?? null,
    recommendedPositionId: best.job?.jobId ?? null,
    recommendedPositionTitle: best.job?.name ?? null,
    recommendedCity: best.job?.city ?? null,
    recommendedState: best.job?.state ?? null,
    confidenceScore: best.score,
    mappingDecision,
    mappingReason,
    factorScores: best.factors,
    explanationHeadline: buildExplanationHeadline(mappingDecision, best.score),
    recruiter: input.row.assignedRecruiter ?? null,
    territoryDm,
    distanceMiles: distanceMiles ?? null,
    coverageDemandScore,
  };
}
