import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import type { CandidateWorkflowState } from "@/lib/candidate-workflow-types";
import type { CoverageRiskSnapshot } from "@/lib/coverage-risk-engine";
import { candidatesForJob, parseDate, MS_PER_DAY } from "@/lib/dm-dashboard/territory-shared";
import { normalizeStateCode } from "@/lib/dm-territory-map";
import { isHiredStage } from "@/lib/territory-intelligence/metric-calculators";
import type { ApplicantVelocityTrend } from "@/lib/territory-intelligence/types";

const LOW_FLOW_APPLICANT_THRESHOLD = 2;
const RECRUITER_WORKLOAD_ASSIGNED_THRESHOLD = 12;

export function countZeroApplicantJobs(jobs: BreezyJob[], candidates: BreezyCandidate[]): number {
  let count = 0;
  for (const job of jobs) {
    if (candidatesForJob(job, candidates).length === 0) count += 1;
  }
  return count;
}

export function countLowApplicantFlowJobs(jobs: BreezyJob[], candidates: BreezyCandidate[]): number {
  let count = 0;
  for (const job of jobs) {
    const total = candidatesForJob(job, candidates).length;
    if (total > 0 && total < LOW_FLOW_APPLICANT_THRESHOLD) count += 1;
  }
  return count;
}

export function countHiresLast7Days(candidates: BreezyCandidate[], fetchedAt: string): number {
  const reference = new Date(fetchedAt);
  const since = new Date(reference.getTime() - 7 * MS_PER_DAY);
  let count = 0;
  for (const candidate of candidates) {
    if (!isHiredStage(candidate.stage)) continue;
    const anchor = parseDate(candidate.updatedDate) ?? parseDate(candidate.appliedDate);
    if (anchor && anchor >= since) count += 1;
  }
  return count;
}

export function computeApplicantVelocityTrend(
  candidates: BreezyCandidate[],
  fetchedAt: string,
): ApplicantVelocityTrend {
  const reference = new Date(fetchedAt);
  const currentStart = new Date(reference.getTime() - 7 * MS_PER_DAY);
  const priorStart = new Date(reference.getTime() - 14 * MS_PER_DAY);

  let current7d = 0;
  let prior7d = 0;
  for (const candidate of candidates) {
    const applied = parseDate(candidate.appliedDate);
    if (!applied) continue;
    if (applied >= currentStart) current7d += 1;
    else if (applied >= priorStart && applied < currentStart) prior7d += 1;
  }

  const delta = current7d - prior7d;
  const direction: ApplicantVelocityTrend["direction"] =
    delta > 0 ? "up" : delta < 0 ? "down" : "flat";

  return { direction, current7d, prior7d, delta };
}

export function computeCoverageRiskScoreForDm(
  dmName: string,
  coverage: CoverageRiskSnapshot | null,
): number {
  if (!coverage) return 0;
  const rows = coverage.opportunities.filter((row) => row.territoryOwner === dmName);
  if (rows.length === 0) return 0;
  const avgCoverage =
    rows.reduce((sum, row) => sum + row.coverageScore, 0) / rows.length;
  const redWeight = rows.filter((row) => row.staffingRisk === "RED").length / rows.length;
  const yellowWeight = rows.filter((row) => row.staffingRisk === "YELLOW").length / rows.length;
  const risk = Math.round(100 - avgCoverage + redWeight * 25 + yellowWeight * 10);
  return Math.max(0, Math.min(100, risk));
}

export function computeRecruiterWorkloadScore(
  candidates: BreezyCandidate[],
  workflows: CandidateWorkflowState | null,
): number {
  if (!workflows) return 0;
  const allowed = new Set(candidates.map((row) => row.candidateId));
  const counts = new Map<string, number>();
  for (const [candidateId, workflow] of Object.entries(workflows)) {
    if (!allowed.has(candidateId)) continue;
    const recruiter = workflow.assignedRecruiter?.trim();
    if (!recruiter || recruiter === "Unassigned") continue;
    counts.set(recruiter, (counts.get(recruiter) ?? 0) + 1);
  }
  if (counts.size === 0) return 0;
  const maxAssigned = Math.max(...counts.values());
  return Math.min(100, Math.round((maxAssigned / RECRUITER_WORKLOAD_ASSIGNED_THRESHOLD) * 100));
}

export function maxJobAgeDaysWithoutApplicants(
  jobs: BreezyJob[],
  candidates: BreezyCandidate[],
  fetchedAt: string,
): { city: string; state: string; days: number } | null {
  const reference = Date.parse(fetchedAt);
  let best: { city: string; state: string; days: number } | null = null;
  for (const job of jobs) {
    if (candidatesForJob(job, candidates).length > 0) continue;
    const created = parseDate(job.createdDate) ?? parseDate(job.updatedDate);
    if (!created) continue;
    const days = Math.max(0, Math.round((reference - created.getTime()) / MS_PER_DAY));
    if (!best || days > best.days) {
      best = { city: job.city, state: job.state, days };
    }
  }
  return best;
}

export function aggregateStateHeatCells(input: {
  jobs: BreezyJob[];
  candidates: BreezyCandidate[];
  states: string[];
  coveragePercentByState: Map<string, number>;
}): Array<{
  state: string;
  openJobs: number;
  zeroApplicantJobs: number;
  score: number;
}> {
  const stateSet = new Set(input.states.map(normalizeStateCode));
  const agg = new Map<string, { openJobs: number; zeroApplicantJobs: number }>();

  for (const job of input.jobs) {
    const state = normalizeStateCode(job.state);
    if (!stateSet.has(state)) continue;
    const row = agg.get(state) ?? { openJobs: 0, zeroApplicantJobs: 0 };
    row.openJobs += 1;
    if (candidatesForJob(job, input.candidates).length === 0) row.zeroApplicantJobs += 1;
    agg.set(state, row);
  }

  return [...agg.entries()].map(([state, row]) => ({
    state,
    openJobs: row.openJobs,
    zeroApplicantJobs: row.zeroApplicantJobs,
    score: input.coveragePercentByState.get(state) ?? 50,
  }));
}
