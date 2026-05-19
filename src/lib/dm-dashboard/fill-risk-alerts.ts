import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import {
  MS_PER_DAY,
  candidatesForJob,
  cityKey,
  daysSince,
  isInterviewingStage,
  parseDate,
} from "@/lib/dm-dashboard/territory-shared";
import type { DmAttentionItem, DmAttentionSeverity } from "@/lib/dm-dashboard/dm-needs-attention";

export type FillRiskCategory =
  | "no-applicants-7d"
  | "no-interviews"
  | "job-aging-14"
  | "job-aging-21"
  | "job-aging-30"
  | "low-applicant-flow-city"
  | "low-applicant-flow"
  | "low-interview-conversion";

const AGING_THRESHOLDS = [14, 21, 30] as const;

function severityRank(severity: DmAttentionSeverity): number {
  return severity === "critical" ? 0 : 1;
}

function riskRank(category: FillRiskCategory): number {
  const order: FillRiskCategory[] = [
    "no-applicants-7d",
    "no-interviews",
    "job-aging-30",
    "job-aging-21",
    "job-aging-14",
    "low-applicant-flow-city",
    "low-applicant-flow",
    "low-interview-conversion",
  ];
  return order.indexOf(category);
}

export function buildTerritoryFillRiskAlerts(
  jobs: BreezyJob[],
  candidates: BreezyCandidate[],
  referenceIso: string,
): DmAttentionItem[] {
  const reference = new Date(referenceIso);
  const since7d = new Date(reference.getTime() - 7 * MS_PER_DAY);
  const items: DmAttentionItem[] = [];
  const cityApplicantCounts = new Map<string, { jobs: number; applicants7d: number }>();

  for (const job of jobs) {
    const jobCandidates = candidatesForJob(job, candidates);
    const recentApplicants = jobCandidates.filter((c) => {
      const applied = parseDate(c.appliedDate);
      return applied !== null && applied >= since7d;
    });
    const interviewing = jobCandidates.filter((c) => isInterviewingStage(c.stage));
    const jobAgeDays = daysSince(job.createdDate || job.updatedDate, reference);
    const key = cityKey(job.city, job.state);
    const cityStats = cityApplicantCounts.get(key) ?? { jobs: 0, applicants7d: 0 };
    cityStats.jobs += 1;
    cityStats.applicants7d += recentApplicants.length;
    cityApplicantCounts.set(key, cityStats);

    if (recentApplicants.length === 0) {
      items.push({
        id: `no-apps-${job.jobId}`,
        severity: "critical",
        category: "no-applicants-7d",
        title: "No applicants in 7+ days",
        detail: `${job.name} (${job.city}, ${job.state}) has had no new applicants this week.`,
        jobId: job.jobId,
        positionName: job.name,
        state: job.state,
        city: job.city,
      });
    }

    if (jobCandidates.length > 0 && interviewing.length === 0) {
      items.push({
        id: `no-interviews-${job.jobId}`,
        severity: jobCandidates.length >= 3 ? "critical" : "warning",
        category: "no-interviews",
        title: "No interviews scheduled",
        detail: `${job.name} has ${jobCandidates.length} applicant(s) but none in interview stages.`,
        jobId: job.jobId,
        positionName: job.name,
        state: job.state,
        city: job.city,
      });
    }

    if (jobAgeDays !== null) {
      for (const threshold of AGING_THRESHOLDS) {
        if (jobAgeDays >= threshold) {
          const category =
            threshold === 14 ? "job-aging-14" : threshold === 21 ? "job-aging-21" : "job-aging-30";
          items.push({
            id: `aging-${threshold}-${job.jobId}`,
            severity: threshold >= 21 ? "critical" : "warning",
            category,
            title: `Job aging ${jobAgeDays}d`,
            detail: `${job.name} has been open approximately ${jobAgeDays} days (threshold ${threshold}d).`,
            jobId: job.jobId,
            positionName: job.name,
            state: job.state,
            city: job.city,
          });
          break;
        }
      }
    }

    if (jobCandidates.length > 0 && jobCandidates.length < 2) {
      items.push({
        id: `low-flow-${job.jobId}`,
        severity: "warning",
        category: "low-applicant-flow",
        title: "Low applicant flow",
        detail: `${job.name} has only ${jobCandidates.length} applicant(s) in the current sync.`,
        jobId: job.jobId,
        positionName: job.name,
        state: job.state,
        city: job.city,
      });
    }
  }

  for (const [cityLabel, stats] of cityApplicantCounts) {
    if (stats.jobs >= 2 && stats.applicants7d === 0) {
      items.push({
        id: `low-flow-city-${cityLabel}`,
        severity: "critical",
        category: "low-applicant-flow-city",
        title: "Low applicant flow city",
        detail: `${cityLabel}: ${stats.jobs} open jobs with zero applicants in the last 7 days.`,
        city: cityLabel.split(",")[0]?.trim(),
        state: cityLabel.split(",")[1]?.trim(),
      });
    }
  }

  return items.sort(
    (a, b) =>
      severityRank(a.severity) - severityRank(b.severity) ||
      riskRank(a.category as FillRiskCategory) - riskRank(b.category as FillRiskCategory) ||
      a.title.localeCompare(b.title),
  );
}

export function highestFillRiskAlerts(alerts: DmAttentionItem[], limit = 12): DmAttentionItem[] {
  return alerts.slice(0, limit);
}
