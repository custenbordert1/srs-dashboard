import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import type { CandidateWorkflowState } from "@/lib/candidate-workflow-types";
import type { DmPrioritizedAlert } from "@/lib/dm-dashboard/dm-alert-priority";
import type {
  DmCandidateStageCounts,
  DmCityOperationalSummary,
  DmJobOperationalDetail,
  DmOperationalIndex,
  DmStateOperationalSummary,
} from "@/lib/dm-dashboard/dm-operational-types";
import { classifyBucketForCandidate } from "@/lib/dm-dashboard/candidate-pipeline-buckets";
import {
  MS_PER_DAY,
  candidatesForJob,
  cityKey,
  daysSince,
  isInterviewingStage,
  parseDate,
} from "@/lib/dm-dashboard/territory-shared";

function emptyCounts(): DmCandidateStageCounts {
  return { applied: 0, interviewing: 0, hired: 0, stalled: 0 };
}

function demandLevelFromScore(score: number): DmCityOperationalSummary["demandLevel"] {
  if (score >= 8) return "Critical";
  if (score >= 5) return "High";
  if (score >= 2) return "Medium";
  return "Low";
}

function resolveAssignedRecruiter(
  jobCandidates: BreezyCandidate[],
  workflows: CandidateWorkflowState,
): string | null {
  const counts = new Map<string, number>();
  for (const candidate of jobCandidates) {
    const recruiter = workflows[candidate.candidateId]?.assignedRecruiter?.trim();
    if (!recruiter) continue;
    counts.set(recruiter, (counts.get(recruiter) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [name, count] of counts) {
    if (count > bestCount) {
      best = name;
      bestCount = count;
    }
  }
  return best;
}

function buildCandidateCounts(
  jobCandidates: BreezyCandidate[],
  reference: Date,
): DmCandidateStageCounts {
  const counts = emptyCounts();
  for (const candidate of jobCandidates) {
    const bucket = classifyBucketForCandidate(candidate, reference);
    counts[bucket] += 1;
  }
  return counts;
}

function lastApplicantIso(candidates: BreezyCandidate[]): {
  lastApplicantAt: string | null;
  daysSinceLastApplicant: number | null;
} {
  let last: Date | null = null;
  for (const candidate of candidates) {
    const applied = parseDate(candidate.appliedDate);
    if (!applied) continue;
    if (!last || applied > last) last = applied;
  }
  if (!last) return { lastApplicantAt: null, daysSinceLastApplicant: null };
  const reference = new Date();
  return {
    lastApplicantAt: last.toISOString(),
    daysSinceLastApplicant: Math.max(
      0,
      Math.round((reference.getTime() - last.getTime()) / MS_PER_DAY),
    ),
  };
}

export function buildDmOperationalIndex(
  jobs: BreezyJob[],
  candidates: BreezyCandidate[],
  prioritizedAlerts: DmPrioritizedAlert[],
  fetchedAt: string,
  workflows: CandidateWorkflowState = {},
): DmOperationalIndex {
  const reference = new Date(fetchedAt);
  const alertsById: Record<string, DmPrioritizedAlert> = {};
  const alertsByJobId = new Map<string, DmPrioritizedAlert[]>();

  for (const alert of prioritizedAlerts) {
    alertsById[alert.id] = alert;
    if (alert.jobId) {
      const list = alertsByJobId.get(alert.jobId) ?? [];
      list.push(alert);
      alertsByJobId.set(alert.jobId, list);
    }
  }

  const jobsById: Record<string, DmJobOperationalDetail> = {};

  for (const job of jobs) {
    const jobCandidates = candidatesForJob(job, candidates);
    const interviewingCount = jobCandidates.filter((c) => isInterviewingStage(c.stage)).length;
    const jobAgeDays = daysSince(job.createdDate || job.updatedDate, reference);
    const applicantActivity = lastApplicantIso(jobCandidates);
    const related = alertsByJobId.get(job.jobId) ?? [];
    const topAlert = [...related].sort((a, b) => b.priorityScore - a.priorityScore)[0];

    jobsById[job.jobId] = {
      jobId: job.jobId,
      title: job.name,
      city: job.city,
      state: job.state,
      cityKey: cityKey(job.city, job.state),
      jobAgeDays,
      applicantCount: jobCandidates.length,
      interviewingCount,
      lastApplicantAt: applicantActivity.lastApplicantAt,
      daysSinceLastApplicant: applicantActivity.daysSinceLastApplicant,
      payRange: job.payRate?.trim() || null,
      assignedRecruiter: resolveAssignedRecruiter(jobCandidates, workflows),
      priority: topAlert?.priority ?? null,
      priorityScore: topAlert?.priorityScore ?? null,
      recommendedAction: topAlert?.recommendedAction ?? null,
      relatedAlertIds: related.map((a) => a.id),
      candidateCounts: buildCandidateCounts(jobCandidates, reference),
    };
  }

  const citiesByKey: Record<string, DmCityOperationalSummary> = {};
  const statesByCode: Record<string, DmStateOperationalSummary> = {};

  for (const job of jobs) {
    const key = cityKey(job.city, job.state);
    const stateCode = job.state.trim().toUpperCase();
    const citySummary =
      citiesByKey[key] ??
      ({
        cityKey: key,
        label: key,
        city: job.city,
        state: job.state,
        openJobs: 0,
        demandLevel: "Low",
        demandScore: 0,
        jobIds: [],
        relatedAlertIds: [],
      } satisfies DmCityOperationalSummary);

    citySummary.openJobs += 1;
    citySummary.jobIds.push(job.jobId);
    citiesByKey[key] = citySummary;

    const stateSummary =
      statesByCode[stateCode] ??
      ({
        state: stateCode,
        openJobs: 0,
        alertCount: 0,
        demandLevel: "Low",
        jobIds: [],
      } satisfies DmStateOperationalSummary);

    stateSummary.openJobs += 1;
    stateSummary.jobIds.push(job.jobId);
    statesByCode[stateCode] = stateSummary;
  }

  for (const alert of prioritizedAlerts) {
    if (alert.jobId) {
      const job = jobsById[alert.jobId];
      if (!job) continue;
      const city = citiesByKey[job.cityKey];
      if (city && !city.relatedAlertIds.includes(alert.id)) {
        city.relatedAlertIds.push(alert.id);
        city.demandScore += alert.priority === "critical" ? 4 : alert.priority === "high" ? 3 : 1;
      }
      const stateCode = job.state.trim().toUpperCase();
      const state = statesByCode[stateCode];
      if (state) state.alertCount += 1;
    } else if (alert.city && alert.state) {
      const key = cityKey(alert.city, alert.state);
      const city = citiesByKey[key];
      if (city && !city.relatedAlertIds.includes(alert.id)) {
        city.relatedAlertIds.push(alert.id);
        city.demandScore += 3;
      }
    }
  }

  for (const city of Object.values(citiesByKey)) {
    city.demandLevel = demandLevelFromScore(city.demandScore);
  }

  for (const state of Object.values(statesByCode)) {
    const pressure = state.alertCount + Math.max(0, state.openJobs - 3);
    state.demandLevel = demandLevelFromScore(pressure);
  }

  return { jobsById, citiesByKey, statesByCode, alertsById };
}

export function parseCityLabelToKey(label: string): string | null {
  const trimmed = label.trim();
  if (!trimmed.includes(",")) return null;
  const [cityPart, statePart] = trimmed.split(",").map((p) => p.trim());
  if (!cityPart || !statePart) return null;
  return cityKey(cityPart, statePart);
}

export function resolveDrawerJobId(
  target: import("@/lib/dm-dashboard/dm-operational-types").DmOperationalDrawerTarget,
  index: DmOperationalIndex,
): string | null {
  if (target.type === "job") return target.jobId;
  if (target.type === "alert") {
    const alert = index.alertsById[target.alertId];
    return alert?.jobId ?? null;
  }
  if (target.type === "city") {
    const city = index.citiesByKey[target.cityKey];
    return city?.jobIds[0] ?? null;
  }
  if (target.type === "state") {
    const state = index.statesByCode[target.state.trim().toUpperCase()];
    return state?.jobIds[0] ?? null;
  }
  return null;
}
