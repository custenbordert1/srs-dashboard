import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import type { CandidateWorkflowState } from "@/lib/candidate-workflow-types";
import {
  candidatesForJob,
  daysSince,
  isHiredStage,
  isInterviewingStage,
  parseDate,
} from "@/lib/dm-dashboard/territory-shared";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_48H = 48 * 60 * 60 * 1000;

export type SmartAlertCategory =
  | "no-applicants-48h"
  | "low-conversion"
  | "high-job-aging"
  | "candidate-dropoff"
  | "low-recruiter-response";

export type SmartTerritoryAlert = {
  id: string;
  category: SmartAlertCategory;
  severity: "critical" | "warning";
  title: string;
  detail: string;
  jobId?: string;
  candidateId?: string;
};

function recruiterResponseHours(workflows: CandidateWorkflowState, candidateId: string): number | null {
  const record = workflows[candidateId];
  if (!record?.lastActionAt || !record.updatedAt) return null;
  const last = parseDate(record.lastActionAt);
  const updated = parseDate(record.updatedAt);
  if (!last || !updated) return null;
  return Math.max(0, (updated.getTime() - last.getTime()) / (60 * 60 * 1000));
}

export function buildSmartTerritoryAlerts(
  jobs: BreezyJob[],
  candidates: BreezyCandidate[],
  referenceIso: string,
  workflows: CandidateWorkflowState = {},
): SmartTerritoryAlert[] {
  const reference = new Date(referenceIso);
  const since48h = new Date(reference.getTime() - MS_48H);
  const alerts: SmartTerritoryAlert[] = [];

  for (const job of jobs) {
    const jobCandidates = candidatesForJob(job, candidates);
    const recent48 = jobCandidates.filter((c) => {
      const applied = parseDate(c.appliedDate);
      return applied !== null && applied >= since48h;
    });
    const interviewing = jobCandidates.filter((c) => isInterviewingStage(c.stage));
    const age = daysSince(job.createdDate || job.updatedDate, reference);

    if (recent48.length === 0) {
      alerts.push({
        id: `48h-${job.jobId}`,
        category: "no-applicants-48h",
        severity: "critical",
        title: "No applicants in 48h",
        detail: `${job.name} (${job.city}, ${job.state}) has had no applicants in the last 48 hours.`,
        jobId: job.jobId,
      });
    }

    if (jobCandidates.length >= 5) {
      const conversion = Math.round((interviewing.length / jobCandidates.length) * 100);
      if (conversion < 12) {
        alerts.push({
          id: `conv-${job.jobId}`,
          category: "low-conversion",
          severity: "warning",
          title: "Low interview conversion",
          detail: `${job.name}: ${conversion}% interviewing (${interviewing.length}/${jobCandidates.length}).`,
          jobId: job.jobId,
        });
      }
    }

    if (age !== null && age >= 30) {
      alerts.push({
        id: `aging-${job.jobId}`,
        category: "high-job-aging",
        severity: "critical",
        title: `Job aging ${age}d`,
        detail: `${job.name} has been open ${age} days — elevated fill risk.`,
        jobId: job.jobId,
      });
    } else if (age !== null && age >= 21) {
      alerts.push({
        id: `aging-warn-${job.jobId}`,
        category: "high-job-aging",
        severity: "warning",
        title: `Job aging ${age}d`,
        detail: `${job.name} approaching critical aging threshold.`,
        jobId: job.jobId,
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
      });
    }

    const responseH = recruiterResponseHours(workflows, candidate.candidateId);
    if (responseH !== null && responseH > 72) {
      alerts.push({
        id: `response-${candidate.candidateId}`,
        category: "low-recruiter-response",
        severity: responseH > 120 ? "critical" : "warning",
        title: "Slow recruiter response",
        detail: `No workflow update in ~${Math.round(responseH)}h for ${candidate.firstName} ${candidate.lastName}.`,
        candidateId: candidate.candidateId,
      });
    }
  }

  const severityRank = { critical: 0, warning: 1 };
  return alerts
    .sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || a.title.localeCompare(b.title))
    .slice(0, 40);
}
