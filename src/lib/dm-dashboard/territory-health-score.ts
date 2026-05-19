import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import {
  MS_PER_DAY,
  candidatesForJob,
  clampScore,
  isHiredStage,
  isInterviewingStage,
  parseDate,
} from "@/lib/dm-dashboard/territory-shared";

export type TerritoryHealthFactor = {
  id: string;
  label: string;
  score: number;
  weight: number;
  detail: string;
};

export type TerritoryHealthScore = {
  score: number;
  label: "Critical" | "At Risk" | "Stable" | "Healthy";
  factors: TerritoryHealthFactor[];
};

function healthLabel(score: number): TerritoryHealthScore["label"] {
  if (score < 40) return "Critical";
  if (score < 60) return "At Risk";
  if (score < 80) return "Stable";
  return "Healthy";
}

function ratioScore(ratio: number, goodAt: number, poorAt: number): number {
  if (ratio >= goodAt) return 100;
  if (ratio <= poorAt) return 10;
  return clampScore(10 + ((ratio - poorAt) / (goodAt - poorAt)) * 90);
}

export function buildTerritoryHealthScore(
  jobs: BreezyJob[],
  candidates: BreezyCandidate[],
  referenceIso: string,
): TerritoryHealthScore {
  const reference = new Date(referenceIso);
  const since7d = new Date(reference.getTime() - 7 * MS_PER_DAY);
  const since30d = new Date(reference.getTime() - 30 * MS_PER_DAY);

  if (jobs.length === 0) {
    return {
      score: 50,
      label: "Stable",
      factors: [
        {
          id: "empty",
          label: "No open jobs",
          score: 50,
          weight: 1,
          detail: "Territory has no published positions in the current sync.",
        },
      ],
    };
  }

  let jobsWithRecentApplicants = 0;
  let nonAgingJobs = 0;
  let jobsWithInterviews = 0;
  let recentHires = 0;

  for (const job of jobs) {
    const jobCandidates = candidatesForJob(job, candidates);
    const recentApplicants = jobCandidates.filter((c) => {
      const applied = parseDate(c.appliedDate);
      return applied !== null && applied >= since7d;
    });
    if (recentApplicants.length > 0) jobsWithRecentApplicants += 1;

    const created = parseDate(job.createdDate || job.updatedDate);
    const ageDays =
      created !== null
        ? Math.max(0, Math.round((reference.getTime() - created.getTime()) / MS_PER_DAY))
        : null;
    if (ageDays === null || ageDays < 21) nonAgingJobs += 1;

    if (jobCandidates.some((c) => isInterviewingStage(c.stage))) jobsWithInterviews += 1;
  }

  recentHires = candidates.filter((c) => {
    if (!isHiredStage(c.stage)) return false;
    const applied = parseDate(c.appliedDate);
    return applied !== null && applied >= since30d;
  }).length;

  const applicantFlowRatio = jobsWithRecentApplicants / jobs.length;
  const agingRatio = nonAgingJobs / jobs.length;
  const interviewJobRatio = jobsWithInterviews / jobs.length;
  const candidatesPerJob = candidates.length / jobs.length;
  const fillVelocityRatio = recentHires / jobs.length;

  const factors: TerritoryHealthFactor[] = [
    {
      id: "applicant-flow",
      label: "Applicant flow",
      score: ratioScore(applicantFlowRatio, 0.55, 0.15),
      weight: 0.25,
      detail: `${jobsWithRecentApplicants}/${jobs.length} jobs received applicants in the last 7 days.`,
    },
    {
      id: "job-aging",
      label: "Open job aging",
      score: ratioScore(agingRatio, 0.75, 0.35),
      weight: 0.2,
      detail: `${nonAgingJobs}/${jobs.length} jobs are under 21 days open.`,
    },
    {
      id: "interview-activity",
      label: "Interview activity",
      score: ratioScore(interviewJobRatio, 0.4, 0.08),
      weight: 0.2,
      detail: `${jobsWithInterviews}/${jobs.length} jobs have candidates in interview stages.`,
    },
    {
      id: "candidate-volume",
      label: "Candidate volume",
      score: ratioScore(Math.min(candidatesPerJob, 8) / 8, 1, 0.12),
      weight: 0.2,
      detail: `${candidatesPerJob.toFixed(1)} candidates per open job on average.`,
    },
    {
      id: "fill-velocity",
      label: "Job fill velocity",
      score: ratioScore(fillVelocityRatio, 0.12, 0.01),
      weight: 0.15,
      detail: `${recentHires} hire(s) in the last 30 days across ${jobs.length} open jobs.`,
    },
  ];

  const weighted =
    factors.reduce((sum, factor) => sum + factor.score * factor.weight, 0) /
    factors.reduce((sum, factor) => sum + factor.weight, 0);

  const score = clampScore(weighted);
  return { score, label: healthLabel(score), factors };
}
