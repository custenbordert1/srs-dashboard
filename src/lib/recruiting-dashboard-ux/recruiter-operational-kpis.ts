import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import {
  candidatesForJob,
  daysSince,
  isHiredStage,
  parseDate,
} from "@/lib/dm-dashboard/territory-shared";
import type { RecruiterEscalationQueueItem } from "@/lib/operational-escalation/operational-escalation-types";
import type { RecruitingIntelligenceSnapshot } from "@/lib/recruiting-automation/build-recruiting-intelligence";

export type RecruiterOperationalKpi = {
  id: string;
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "good" | "warn" | "critical";
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function avgDaysToFirstApplicant(jobs: BreezyJob[], candidates: BreezyCandidate[]): number | null {
  const samples: number[] = [];
  for (const job of jobs) {
    const jobCandidates = candidatesForJob(job, candidates);
    if (jobCandidates.length === 0) continue;
    let first: Date | null = null;
    for (const candidate of jobCandidates) {
      const applied = parseDate(candidate.appliedDate);
      if (applied && (!first || applied < first)) first = applied;
    }
    const created = parseDate(job.createdDate || job.updatedDate);
    if (first && created) {
      samples.push(Math.max(0, (first.getTime() - created.getTime()) / MS_PER_DAY));
    }
  }
  if (samples.length === 0) return null;
  return Math.round(samples.reduce((sum, n) => sum + n, 0) / samples.length);
}

function avgDaysToHire(candidates: BreezyCandidate[]): number | null {
  const hired = candidates.filter((c) => isHiredStage(c.stage));
  if (hired.length === 0) return null;
  const daySpans: number[] = [];
  for (const candidate of hired) {
    const applied = parseDate(candidate.appliedDate);
    if (!applied) continue;
    daySpans.push(Math.max(1, Math.round((Date.now() - applied.getTime()) / MS_PER_DAY)));
  }
  if (daySpans.length === 0) return null;
  return Math.round(daySpans.reduce((a, b) => a + b, 0) / daySpans.length);
}

function escalationResponseLabel(escalations: RecruiterEscalationQueueItem[]): string {
  const reviewed = escalations.filter(
    (row) => row.status === "in_review" || row.status === "completed",
  );
  if (reviewed.length === 0) return "—";
  const spans = reviewed.map((row) => {
    const created = new Date(row.createdAt).getTime();
    const updated = new Date(row.updatedAt).getTime();
    return Math.max(0, (updated - created) / (60 * 60 * 1000));
  });
  return `${Math.round(spans.reduce((a, b) => a + b, 0) / spans.length)}h avg`;
}

export function buildRecruiterOperationalKpis(
  snapshot: RecruitingIntelligenceSnapshot,
  jobs: BreezyJob[],
  candidates: BreezyCandidate[],
  escalations: RecruiterEscalationQueueItem[] = [],
): RecruiterOperationalKpi[] {
  const reference = snapshot.fetchedAt;
  const decision = snapshot.decisionIntelligence;

  const agingJobs =
    jobs.length > 0
      ? jobs.filter((job) => {
          const age = daysSince(job.createdDate || job.updatedDate, new Date(reference));
          return age !== null && age >= 21;
        }).length
      : (decision?.coverageRecommendations.filter((row) => (row.jobAgeDays ?? 0) >= 21).length ??
        0);

  const openEscalations = escalations.filter(
    (row) => row.status === "new" || row.status === "in_review",
  ).length;
  const completedEscalations = escalations.filter((row) => row.status === "completed").length;

  const variantRows = decision?.variantPerformance ?? [];
  const topVariant = [...variantRows].sort((a, b) => b.applicants - a.applicants)[0];
  const topMetro =
    decision?.territory.topOpportunityCities[0]?.label ??
    decision?.territory.strongestMarkets[0]?.label ??
    "—";
  const highestRisk =
    decision?.territory.highestRiskTerritory ??
    decision?.territory.topRiskCities[0]?.state ??
    "—";

  const avgFirstApplicant = avgDaysToFirstApplicant(jobs, candidates);
  const avgHire = avgDaysToHire(candidates);

  return [
    {
      id: "first-applicant",
      label: "Avg time to 1st applicant",
      value: avgFirstApplicant !== null ? `${avgFirstApplicant}d` : "—",
      hint: "Posted job → first application",
      tone: avgFirstApplicant !== null && avgFirstApplicant > 7 ? "warn" : "neutral",
    },
    {
      id: "time-to-hire",
      label: "Avg time to hire",
      value: avgHire !== null ? `${avgHire}d` : "—",
      hint: "Applied → hired (approx.)",
      tone: "neutral",
    },
    {
      id: "escalation-response",
      label: "Escalation response",
      value: escalationResponseLabel(escalations),
      hint: `${openEscalations} open · ${completedEscalations} completed`,
      tone: openEscalations > 5 ? "critical" : openEscalations > 0 ? "warn" : "good",
    },
    {
      id: "aging-jobs",
      label: "Aging jobs (21d+)",
      value: String(agingJobs),
      hint: "Territory published roles",
      tone: agingJobs > 10 ? "critical" : agingJobs > 3 ? "warn" : "good",
    },
    {
      id: "top-variant",
      label: "Top variant",
      value: topVariant ? `#${topVariant.variantIndex + 1} · ${topVariant.applicants} appl` : "—",
      hint: topVariant?.cityTarget,
      tone: "good",
    },
    {
      id: "top-metro",
      label: "Top performing metro",
      value: topMetro,
      tone: "good",
    },
    {
      id: "highest-risk",
      label: "Highest-risk territory",
      value: highestRisk,
      tone: "warn",
    },
    {
      id: "queue-completion",
      label: "Queue resolved",
      value:
        escalations.length > 0
          ? `${Math.round((completedEscalations / escalations.length) * 100)}%`
          : "—",
      hint: "Recruiter escalation queue",
      tone: "neutral",
    },
  ];
}
