import { countCandidatesLast7Days } from "@/lib/breezy-api";
import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import type { AuthSession } from "@/lib/auth/types";
import {
  buildDmNeedsAttention,
  buildFillRiskAlerts,
  topScoredCandidates,
  type DmAttentionItem,
} from "@/lib/dm-dashboard/dm-needs-attention";
import { getAssignedStatesForDm } from "@/lib/dm-territory-map";
import type { ChartBar } from "@/lib/recruiting-intelligence";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type DmDashboardKpi = {
  id: string;
  label: string;
  value: string;
  hint: string;
};

export type DmDashboardSnapshot = {
  dmName: string;
  territoryStates: string[];
  territoryLabel: string;
  fetchedAt: string;
  kpis: DmDashboardKpi[];
  activeJobs: number;
  candidatesLast7Days: number;
  interviewing: number;
  agingJobs: number;
  topHiringCities: ChartBar[];
  candidateSources: ChartBar[];
  fillRiskAlerts: DmAttentionItem[];
  needsAttention: DmAttentionItem[];
  topCandidates: Array<{
    candidateId: string;
    name: string;
    score: number;
    tierLabel: string;
    position: string;
    city: string;
    state: string;
    stage: string;
    source: string;
  }>;
  jobs: BreezyJob[];
  candidates: BreezyCandidate[];
};

function parseDate(raw: string): Date | null {
  if (!raw.trim()) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
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

function countBuckets(
  rows: Array<{ label: string }>,
  labelFn: (row: { label: string }) => string,
): ChartBar[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const label = labelFn(row) || "Unknown";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8)
    .map(([label, value]) => ({ label, value }));
}

function candidateName(candidate: BreezyCandidate): string {
  const name = `${candidate.firstName} ${candidate.lastName}`.trim();
  return name || candidate.email || "Unknown";
}

export function buildDmDashboardSnapshot(
  session: AuthSession,
  jobs: BreezyJob[],
  candidates: BreezyCandidate[],
  fetchedAt: string,
): DmDashboardSnapshot {
  const dmName = session.dmName ?? session.name;
  const territoryStates =
    session.role === "dm" ? session.territoryStates : getAssignedStatesForDm(dmName);
  const territoryLabel =
    territoryStates.length > 0 ? territoryStates.join(", ") : "All territories";

  const reference = new Date(fetchedAt);
  const agingJobs = jobs.filter((job) => {
    const created = parseDate(job.createdDate || job.updatedDate);
    if (!created) return false;
    const days = Math.round((reference.getTime() - created.getTime()) / MS_PER_DAY);
    return days >= 21;
  }).length;

  const interviewing = candidates.filter((candidate) => isInterviewingStage(candidate.stage)).length;
  const candidatesLast7Days = countCandidatesLast7Days(candidates, fetchedAt);
  const needsAttention = buildDmNeedsAttention(jobs, candidates, fetchedAt);
  const fillRiskAlerts = buildFillRiskAlerts(needsAttention);

  const topHiringCities = countBuckets(
    jobs.map((job) => ({ label: `${job.city}, ${job.state}`.trim() })),
    (row) => row.label,
  );

  const candidateSources = countBuckets(
    candidates.map((candidate) => ({ label: candidate.source.trim() || "Unknown" })),
    (row) => row.label,
  );

  const kpis: DmDashboardKpi[] = [
    {
      id: "active-jobs",
      label: "Active jobs",
      value: jobs.length.toLocaleString(),
      hint: "Published Breezy positions in your territory",
    },
    {
      id: "candidates-7d",
      label: "Candidates last 7 days",
      value: candidatesLast7Days.toLocaleString(),
      hint: "Applicants with creation date in rolling 7-day window",
    },
    {
      id: "interviewing",
      label: "Interviewing",
      value: interviewing.toLocaleString(),
      hint: "Candidates in interview pipeline stages",
    },
    {
      id: "aging-jobs",
      label: "Aging jobs",
      value: agingJobs.toLocaleString(),
      hint: "Open jobs older than 21 days",
    },
    {
      id: "fill-risk",
      label: "Fill-risk alerts",
      value: fillRiskAlerts.length.toLocaleString(),
      hint: "Critical hiring risk signals",
    },
    {
      id: "attention",
      label: "Needs attention",
      value: needsAttention.length.toLocaleString(),
      hint: "Combined attention queue items",
    },
  ];

  const topCandidates = topScoredCandidates(candidates, 8).map(({ candidate, ai }) => ({
    candidateId: candidate.candidateId,
    name: candidateName(candidate),
    score: ai.numericScore,
    tierLabel: ai.tierLabel,
    position: candidate.positionName || "—",
    city: candidate.city || "—",
    state: candidate.state || "—",
    stage: candidate.stage || "—",
    source: candidate.source || "—",
  }));

  return {
    dmName,
    territoryStates,
    territoryLabel,
    fetchedAt,
    kpis,
    activeJobs: jobs.length,
    candidatesLast7Days,
    interviewing,
    agingJobs,
    topHiringCities,
    candidateSources,
    fillRiskAlerts,
    needsAttention,
    topCandidates,
    jobs,
    candidates,
  };
}
