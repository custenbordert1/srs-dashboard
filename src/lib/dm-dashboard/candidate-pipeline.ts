import type { BreezyCandidate } from "@/lib/breezy-api";
import {
  MS_PER_DAY,
  candidateDisplayName,
  isAppliedStage,
  isHiredStage,
  isInterviewingStage,
  parseDate,
} from "@/lib/dm-dashboard/territory-shared";

export type PipelineStageBucket = "applied" | "interviewing" | "hired" | "stalled";

export type PipelineCandidateRow = {
  candidateId: string;
  name: string;
  stage: string;
  bucket: PipelineStageBucket;
  position: string;
  city: string;
  state: string;
  source: string;
  appliedDate: string;
  daysInStage: number | null;
};

export type CandidatePipelineSnapshot = {
  counts: Record<PipelineStageBucket, number>;
  applied: PipelineCandidateRow[];
  interviewing: PipelineCandidateRow[];
  hired: PipelineCandidateRow[];
  stalled: PipelineCandidateRow[];
};

const STALLED_DAYS = 14;

function classifyBucket(candidate: BreezyCandidate, reference: Date): PipelineStageBucket {
  const applied = parseDate(candidate.appliedDate);
  const daysInPipeline =
    applied !== null
      ? Math.max(0, Math.round((reference.getTime() - applied.getTime()) / MS_PER_DAY))
      : null;

  if (isHiredStage(candidate.stage)) return "hired";
  if (isInterviewingStage(candidate.stage)) {
    if (daysInPipeline !== null && daysInPipeline >= STALLED_DAYS) return "stalled";
    return "interviewing";
  }
  if (isAppliedStage(candidate.stage)) {
    if (daysInPipeline !== null && daysInPipeline >= STALLED_DAYS) return "stalled";
    return "applied";
  }
  if (daysInPipeline !== null && daysInPipeline >= STALLED_DAYS) return "stalled";
  return "applied";
}

function toRow(candidate: BreezyCandidate, bucket: PipelineStageBucket, reference: Date): PipelineCandidateRow {
  const applied = parseDate(candidate.appliedDate);
  const daysInStage =
    applied !== null
      ? Math.max(0, Math.round((reference.getTime() - applied.getTime()) / MS_PER_DAY))
      : null;

  return {
    candidateId: candidate.candidateId,
    name: candidateDisplayName(candidate),
    stage: candidate.stage || "—",
    bucket,
    position: candidate.positionName || "—",
    city: candidate.city || "—",
    state: candidate.state || "—",
    source: candidate.source || "—",
    appliedDate: candidate.appliedDate || "—",
    daysInStage,
  };
}

export function buildCandidatePipeline(
  candidates: BreezyCandidate[],
  referenceIso: string,
  listLimit = 10,
): CandidatePipelineSnapshot {
  const reference = new Date(referenceIso);
  const buckets: Record<PipelineStageBucket, PipelineCandidateRow[]> = {
    applied: [],
    interviewing: [],
    hired: [],
    stalled: [],
  };

  for (const candidate of candidates) {
    const bucket = classifyBucket(candidate, reference);
    buckets[bucket].push(toRow(candidate, bucket, reference));
  }

  for (const key of Object.keys(buckets) as PipelineStageBucket[]) {
    buckets[key].sort((a, b) => (b.daysInStage ?? 0) - (a.daysInStage ?? 0));
  }

  return {
    counts: {
      applied: buckets.applied.length,
      interviewing: buckets.interviewing.length,
      hired: buckets.hired.length,
      stalled: buckets.stalled.length,
    },
    applied: buckets.applied.slice(0, listLimit),
    interviewing: buckets.interviewing.slice(0, listLimit),
    hired: buckets.hired.slice(0, listLimit),
    stalled: buckets.stalled.slice(0, listLimit),
  };
}

export function recentApplicants(
  candidates: BreezyCandidate[],
  referenceIso: string,
  limit = 15,
): PipelineCandidateRow[] {
  const reference = new Date(referenceIso);
  return [...candidates]
    .map((candidate) => toRow(candidate, classifyBucket(candidate, reference), reference))
    .sort((a, b) => {
      const da = parseDate(a.appliedDate)?.getTime() ?? 0;
      const db = parseDate(b.appliedDate)?.getTime() ?? 0;
      return db - da;
    })
    .slice(0, limit);
}
