import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import { scoreCandidate } from "@/lib/candidate-ai-scoring";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type DmAttentionSeverity = "critical" | "warning";

export type DmAttentionItem = {
  id: string;
  severity: DmAttentionSeverity;
  category:
    | "no-applicants-7d"
    | "job-aging"
    | "low-applicant-flow"
    | "low-interview-conversion";
  title: string;
  detail: string;
  jobId?: string;
  positionName?: string;
  state?: string;
  city?: string;
};

export type DmNeedsAttentionConfig = {
  jobAgingDays: number;
  lowApplicantThreshold: number;
  interviewConversionMinPercent: number;
};

export const DEFAULT_DM_ATTENTION_CONFIG: DmNeedsAttentionConfig = {
  jobAgingDays: 21,
  lowApplicantThreshold: 2,
  interviewConversionMinPercent: 15,
};

function parseDate(raw: string): Date | null {
  if (!raw.trim()) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysSince(raw: string, reference: Date): number | null {
  const date = parseDate(raw);
  if (!date) return null;
  return Math.max(0, Math.round((reference.getTime() - date.getTime()) / MS_PER_DAY));
}

function isInterviewingStage(stage: string): boolean {
  const normalized = stage.toLowerCase();
  return (
    normalized.includes("interview") ||
    normalized.includes("screen") ||
    normalized.includes("qualified") ||
    normalized.includes("assessment")
  );
}

function candidatesForJob(job: BreezyJob, candidates: BreezyCandidate[]): BreezyCandidate[] {
  return candidates.filter(
    (candidate) =>
      candidate.positionId === job.jobId ||
      (candidate.positionName && job.name && candidate.positionName === job.name),
  );
}

export function buildDmNeedsAttention(
  jobs: BreezyJob[],
  candidates: BreezyCandidate[],
  referenceIso: string,
  config: DmNeedsAttentionConfig = DEFAULT_DM_ATTENTION_CONFIG,
): DmAttentionItem[] {
  const reference = new Date(referenceIso);
  const since7d = new Date(reference.getTime() - 7 * MS_PER_DAY);
  const items: DmAttentionItem[] = [];

  for (const job of jobs) {
    const jobCandidates = candidatesForJob(job, candidates);
    const recentApplicants = jobCandidates.filter((candidate) => {
      const applied = parseDate(candidate.appliedDate);
      return applied !== null && applied >= since7d;
    });
    const interviewing = jobCandidates.filter((candidate) => isInterviewingStage(candidate.stage));
    const jobAgeDays = daysSince(job.createdDate || job.updatedDate, reference);

    if (recentApplicants.length === 0) {
      items.push({
        id: `no-apps-${job.jobId}`,
        severity: "critical",
        category: "no-applicants-7d",
        title: "No applicants in 7 days",
        detail: `${job.name} (${job.city}, ${job.state}) has had no new applicants this week.`,
        jobId: job.jobId,
        positionName: job.name,
        state: job.state,
        city: job.city,
      });
    }

    if (jobAgeDays !== null && jobAgeDays >= config.jobAgingDays) {
      items.push({
        id: `aging-${job.jobId}`,
        severity: jobAgeDays >= config.jobAgingDays + 14 ? "critical" : "warning",
        category: "job-aging",
        title: `Job aging ${jobAgeDays}d`,
        detail: `${job.name} has been open approximately ${jobAgeDays} days.`,
        jobId: job.jobId,
        positionName: job.name,
        state: job.state,
        city: job.city,
      });
    }

    if (jobCandidates.length > 0 && jobCandidates.length < config.lowApplicantThreshold) {
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

    if (jobCandidates.length >= 5) {
      const conversion = Math.round((interviewing.length / jobCandidates.length) * 100);
      if (conversion < config.interviewConversionMinPercent) {
        items.push({
          id: `low-conversion-${job.jobId}`,
          severity: "warning",
          category: "low-interview-conversion",
          title: "Low interview conversion",
          detail: `${job.name}: ${conversion}% interviewing (${interviewing.length}/${jobCandidates.length}).`,
          jobId: job.jobId,
          positionName: job.name,
          state: job.state,
          city: job.city,
        });
      }
    }
  }

  const severityRank: Record<DmAttentionSeverity, number> = { critical: 0, warning: 1 };
  return items.sort(
    (a, b) => severityRank[a.severity] - severityRank[b.severity] || a.title.localeCompare(b.title),
  );
}

export function buildFillRiskAlerts(attention: DmAttentionItem[]): DmAttentionItem[] {
  return attention.filter(
    (item) =>
      item.category === "no-applicants-7d" ||
      item.category === "job-aging" ||
      item.severity === "critical",
  );
}

export function topScoredCandidates(candidates: BreezyCandidate[], limit = 8) {
  return [...candidates]
    .map((candidate) => ({
      candidate,
      ai: scoreCandidate(candidate),
    }))
    .sort((a, b) => b.ai.numericScore - a.ai.numericScore)
    .slice(0, limit);
}
