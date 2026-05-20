import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import type { CandidateWorkflowState } from "@/lib/candidate-workflow-types";
import { DISTRICT_MANAGERS, getAssignedStatesForDm, normalizeStateCode } from "@/lib/dm-territory-map";
import {
  candidatesForJob,
  daysSince,
  isHiredStage,
  isInterviewingStage,
  parseDate,
} from "@/lib/dm-dashboard/territory-shared";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_72H = 72 * 60 * 60 * 1000;

export type RecruitingAlertSeverity = "critical" | "warning" | "healthy";

export type RecruitingAlertCategory =
  | "no-applicants-72h"
  | "low-territory-pipeline"
  | "high-priority-opening"
  | "aging-position"
  | "poor-conversion"
  | "low-interview-activity"
  | "coverage-risk"
  | "candidate-dropoff"
  | "slow-recruiter-response"
  | "healthy-pipeline";

export type RecruitingAlert = {
  id: string;
  category: RecruitingAlertCategory;
  severity: RecruitingAlertSeverity;
  title: string;
  detail: string;
  jobId?: string;
  candidateId?: string;
  territoryLabel?: string;
  metricValue?: number;
};

function recruiterResponseHours(workflows: CandidateWorkflowState, candidateId: string): number | null {
  const record = workflows[candidateId];
  if (!record?.lastActionAt || !record.updatedAt) return null;
  const last = parseDate(record.lastActionAt);
  const updated = parseDate(record.updatedAt);
  if (!last || !updated) return null;
  return Math.max(0, (updated.getTime() - last.getTime()) / (60 * 60 * 1000));
}

function isHighPriorityJob(job: BreezyJob, jobCandidates: BreezyCandidate[], reference: Date): boolean {
  const age = daysSince(job.createdDate || job.updatedDate, reference);
  const recent72 = jobCandidates.filter((c) => {
    const applied = parseDate(c.appliedDate);
    return applied !== null && applied >= new Date(reference.getTime() - MS_72H);
  });
  return (age !== null && age >= 14 && jobCandidates.length < 3) || recent72.length === 0;
}

export function buildRecruitingAlerts(
  jobs: BreezyJob[],
  candidates: BreezyCandidate[],
  referenceIso: string,
  workflows: CandidateWorkflowState = {},
  limit = 48,
): RecruitingAlert[] {
  const reference = new Date(referenceIso);
  const since72h = new Date(reference.getTime() - MS_72H);
  const alerts: RecruitingAlert[] = [];

  for (const job of jobs) {
    const jobCandidates = candidatesForJob(job, candidates);
    const recent72 = jobCandidates.filter((c) => {
      const applied = parseDate(c.appliedDate);
      return applied !== null && applied >= since72h;
    });
    const interviewing = jobCandidates.filter((c) => isInterviewingStage(c.stage));
    const age = daysSince(job.createdDate || job.updatedDate, reference);

    if (recent72.length === 0) {
      alerts.push({
        id: `72h-${job.jobId}`,
        category: "no-applicants-72h",
        severity: "critical",
        title: "No applicants in 72h",
        detail: `${job.name} (${job.city}, ${job.state}) — zero applicants in the last 72 hours.`,
        jobId: job.jobId,
      });
    }

    if (isHighPriorityJob(job, jobCandidates, reference)) {
      alerts.push({
        id: `priority-${job.jobId}`,
        category: "high-priority-opening",
        severity: "critical",
        title: "High-priority opening",
        detail: `${job.name} needs immediate recruiter attention (${jobCandidates.length} applicants).`,
        jobId: job.jobId,
      });
    }

    if (age !== null && age >= 30) {
      alerts.push({
        id: `aging-${job.jobId}`,
        category: "aging-position",
        severity: "critical",
        title: `Position aging ${age}d`,
        detail: `${job.name} has been open ${age} days — elevated fill risk.`,
        jobId: job.jobId,
        metricValue: age,
      });
    } else if (age !== null && age >= 21) {
      alerts.push({
        id: `aging-warn-${job.jobId}`,
        category: "aging-position",
        severity: "warning",
        title: `Position aging ${age}d`,
        detail: `${job.name} approaching critical aging threshold.`,
        jobId: job.jobId,
        metricValue: age,
      });
    }

    if (jobCandidates.length >= 5) {
      const conversion = Math.round((interviewing.length / jobCandidates.length) * 100);
      if (conversion < 10) {
        alerts.push({
          id: `conv-${job.jobId}`,
          category: "poor-conversion",
          severity: "warning",
          title: "Poor interview conversion",
          detail: `${job.name}: ${conversion}% in interview stages (${interviewing.length}/${jobCandidates.length}).`,
          jobId: job.jobId,
          metricValue: conversion,
        });
      }
    }

    if (jobCandidates.length >= 8 && interviewing.length === 0) {
      alerts.push({
        id: `interview-${job.jobId}`,
        category: "low-interview-activity",
        severity: "warning",
        title: "Low interview activity",
        detail: `${job.name} has ${jobCandidates.length} applicants but no interviews scheduled.`,
        jobId: job.jobId,
      });
    }

    if (jobCandidates.length >= 3 && recent72.length >= 2 && interviewing.length >= 1) {
      alerts.push({
        id: `healthy-job-${job.jobId}`,
        category: "healthy-pipeline",
        severity: "healthy",
        title: "Healthy job pipeline",
        detail: `${job.name} — steady applicants and interview momentum.`,
        jobId: job.jobId,
      });
    }
  }

  for (const dmName of DISTRICT_MANAGERS) {
    const states = getAssignedStatesForDm(dmName);
    const stateSet = new Set(states);
    const dmCandidates = candidates.filter((c) => stateSet.has(normalizeStateCode(c.state)));
    const dmJobs = jobs.filter((j) => stateSet.has(normalizeStateCode(j.state)));
    const appsPerJob = dmJobs.length > 0 ? dmCandidates.length / dmJobs.length : 0;

    if (dmJobs.length >= 3 && appsPerJob < 1.5) {
      alerts.push({
        id: `pipeline-${dmName}`,
        category: "low-territory-pipeline",
        severity: "warning",
        title: "Low territory pipeline",
        detail: `${dmName}: ${appsPerJob.toFixed(1)} applicants per opening across ${dmJobs.length} jobs.`,
        territoryLabel: dmName,
        metricValue: Math.round(appsPerJob * 10) / 10,
      });
    }

    const recent7 = dmCandidates.filter((c) => {
      const applied = parseDate(c.appliedDate);
      return applied !== null && applied >= new Date(reference.getTime() - 7 * MS_PER_DAY);
    });
    if (dmJobs.length >= 5 && recent7.length < dmJobs.length * 0.5) {
      alerts.push({
        id: `coverage-${dmName}`,
        category: "coverage-risk",
        severity: "critical",
        title: "Coverage risk",
        detail: `${dmName} — applicant volume trailing open roles (${recent7.length} apps / 7d vs ${dmJobs.length} jobs).`,
        territoryLabel: dmName,
      });
    }
  }

  for (const candidate of candidates) {
    const applied = parseDate(candidate.appliedDate);
    if (!applied) continue;
    const days = Math.round((reference.getTime() - applied.getTime()) / MS_PER_DAY);
    const stalled =
      !isHiredStage(candidate.stage) &&
      !isInterviewingStage(candidate.stage) &&
      days >= 14;
    if (stalled) {
      alerts.push({
        id: `dropoff-${candidate.candidateId}`,
        category: "candidate-dropoff",
        severity: days >= 21 ? "critical" : "warning",
        title: "Candidate dropoff risk",
        detail: `${candidate.firstName} ${candidate.lastName} — ${days}d in ${candidate.stage || "early"} stage.`,
        candidateId: candidate.candidateId,
        metricValue: days,
      });
    }

    const responseH = recruiterResponseHours(workflows, candidate.candidateId);
    if (responseH !== null && responseH > 72) {
      alerts.push({
        id: `response-${candidate.candidateId}`,
        category: "slow-recruiter-response",
        severity: responseH > 120 ? "critical" : "warning",
        title: "Slow recruiter response",
        detail: `No workflow update in ~${Math.round(responseH)}h for ${candidate.firstName} ${candidate.lastName}.`,
        candidateId: candidate.candidateId,
      });
    }
  }

  const severityRank: Record<RecruitingAlertSeverity, number> = {
    critical: 0,
    warning: 1,
    healthy: 2,
  };

  return alerts
    .sort(
      (a, b) =>
        severityRank[a.severity] - severityRank[b.severity] || a.title.localeCompare(b.title),
    )
    .slice(0, limit);
}

/** @deprecated Use buildRecruitingAlerts — kept for recruiting-automation compatibility */
export type SmartTerritoryAlert = RecruitingAlert & {
  category: RecruitingAlertCategory;
};

export function buildSmartTerritoryAlerts(
  jobs: BreezyJob[],
  candidates: BreezyCandidate[],
  referenceIso: string,
  workflows: CandidateWorkflowState = {},
): SmartTerritoryAlert[] {
  return buildRecruitingAlerts(jobs, candidates, referenceIso, workflows, 40).filter(
    (a) => a.severity !== "healthy",
  ) as SmartTerritoryAlert[];
}
