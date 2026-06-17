import type { BreezyCandidate } from "@/lib/breezy-api";
import type { CandidateWorkflowState } from "@/lib/candidate-workflow-types";
import { isHiredStage, isInterviewingStage, parseDate } from "@/lib/dm-dashboard/territory-shared";
import type {
  ForecastHorizonDays,
  HiringForecastHorizon,
  WeeklyHireForecastPoint,
} from "@/lib/executive-recruiting-forecast/types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Trailing window used to estimate monthly hire velocity from workflow outcomes. */
const TRAILING_VELOCITY_DAYS = 30;

/**
 * Pipeline stage weights — deterministic conversion assumptions (not ML).
 * Interview-stage candidates contribute less than Ready-for-MEL because fewer convert.
 */
const PIPELINE_WEIGHTS = {
  interview: 0.12,
  paperwork: 0.22,
  readyForMel: 0.45,
} as const;

function countRecentHires(workflows: CandidateWorkflowState, referenceIso: string): number {
  const reference = new Date(referenceIso).getTime();
  const since = reference - TRAILING_VELOCITY_DAYS * MS_PER_DAY;
  let hires = 0;
  for (const record of Object.values(workflows)) {
    if (record.workflowStatus !== "Active Rep") continue;
    const updated = new Date(record.updatedAt).getTime();
    if (!Number.isNaN(updated) && updated >= since) hires += 1;
  }
  return hires;
}

function countPipelinePotential(candidates: BreezyCandidate[], workflows: CandidateWorkflowState): {
  interview: number;
  paperwork: number;
  readyForMel: number;
} {
  let interview = 0;
  let paperwork = 0;
  let readyForMel = 0;
  for (const candidate of candidates) {
    const record = workflows[candidate.candidateId];
    if (record?.workflowStatus === "Ready for MEL" || record?.workflowStatus === "Loaded in MEL") {
      readyForMel += 1;
      continue;
    }
    if (
      record?.workflowStatus === "Paperwork Sent" ||
      record?.workflowStatus === "Signed" ||
      record?.workflowStatus === "Awaiting DD Verification"
    ) {
      paperwork += 1;
      continue;
    }
    if (isInterviewingStage(candidate.stage)) interview += 1;
    else if (isHiredStage(candidate.stage)) readyForMel += 1;
  }
  return { interview, paperwork, readyForMel };
}

function applicantVelocityPerDay(candidates: BreezyCandidate[], referenceIso: string): number {
  const reference = new Date(referenceIso).getTime();
  const since = reference - TRAILING_VELOCITY_DAYS * MS_PER_DAY;
  let recent = 0;
  for (const candidate of candidates) {
    const applied = parseDate(candidate.appliedDate);
    if (!applied) continue;
    if (applied.getTime() >= since) recent += 1;
  }
  return recent / TRAILING_VELOCITY_DAYS;
}

function horizonConfidence(horizonDays: ForecastHorizonDays, partialSync: boolean): number {
  const base = horizonDays === 30 ? 78 : horizonDays === 60 ? 65 : 52;
  return partialSync ? Math.max(35, base - 15) : base;
}

export function buildHiringForecastHorizons(input: {
  candidates: BreezyCandidate[];
  workflows: CandidateWorkflowState;
  publishedJobCount: number;
  fetchedAt: string;
  partialSync: boolean;
}): HiringForecastHorizon[] {
  const recentHires = countRecentHires(input.workflows, input.fetchedAt);
  const monthlyVelocity = recentHires;
  const pipeline = countPipelinePotential(input.candidates, input.workflows);
  const pipelineHires =
    pipeline.interview * PIPELINE_WEIGHTS.interview +
    pipeline.paperwork * PIPELINE_WEIGHTS.paperwork +
    pipeline.readyForMel * PIPELINE_WEIGHTS.readyForMel;
  const dailyApplicants = applicantVelocityPerDay(input.candidates, input.fetchedAt);
  const jobMultiplier = Math.max(0.85, Math.min(1.35, input.publishedJobCount / 40));

  const horizons: ForecastHorizonDays[] = [30, 60, 90];
  return horizons.map((horizonDays) => {
    const scale = horizonDays / 30;
    const velocityHires = monthlyVelocity * scale;
    const pipelineContribution = pipelineHires * Math.min(1, scale * 0.85);
    const projectedHires = Math.round((velocityHires + pipelineContribution) * 10) / 10;
    const projectedApplicants = Math.round(dailyApplicants * horizonDays * jobMultiplier);
    const projectedInterviews = Math.round(
      projectedApplicants * 0.18 + pipeline.interview * Math.min(1, scale),
    );
    return {
      horizonDays,
      projectedHires,
      projectedApplicants,
      projectedInterviews,
      confidencePercent: horizonConfidence(horizonDays, input.partialSync),
    };
  });
}

/**
 * Distributes 90-day hire forecast across weeks with front-loading when pipeline backlog is high.
 */
export function buildWeeklyHireForecast(input: {
  projectedHires90: number;
  pipelineBacklog: number;
}): WeeklyHireForecastPoint[] {
  const weeks = 13;
  const backlogBoost = Math.min(0.25, input.pipelineBacklog / 80);
  const weights: number[] = [];
  for (let i = 0; i < weeks; i += 1) {
    const position = i / Math.max(weeks - 1, 1);
    const frontLoad = 1.2 - position * 0.4 + backlogBoost;
    weights.push(Math.max(0.3, frontLoad));
  }
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  return weights.map((weight, index) => {
    const share = weight / totalWeight;
    return {
      weekLabel: `W${index + 1}`,
      weekIndex: index + 1,
      projectedHires: Math.round(input.projectedHires90 * share * 10) / 10,
      projectedApplicants: Math.round(input.projectedHires90 * share * 6),
    };
  });
}
