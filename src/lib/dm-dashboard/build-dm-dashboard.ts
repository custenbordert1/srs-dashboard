import { countCandidatesLast7Days } from "@/lib/breezy-api";
import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import type { AuthSession } from "@/lib/auth/types";
import {
  buildCandidatePipeline,
  recentApplicants,
  type CandidatePipelineSnapshot,
} from "@/lib/dm-dashboard/candidate-pipeline";
import { buildCoverageIntelligence, type TerritoryCoverageSnapshot } from "@/lib/dm-dashboard/coverage-intelligence";
import {
  buildTerritoryFillRiskAlerts,
  highestFillRiskAlerts,
} from "@/lib/dm-dashboard/fill-risk-alerts";
import { buildDmNeedsAttention, topScoredCandidates, type DmAttentionItem } from "@/lib/dm-dashboard/dm-needs-attention";
import {
  buildTerritoryHealthScore,
  type TerritoryHealthScore,
} from "@/lib/dm-dashboard/territory-health-score";
import { buildTerritoryHeatmapPayload, type TerritoryHeatmapPayload } from "@/lib/dm-dashboard/territory-heatmap-prep";
import {
  MS_PER_DAY,
  candidateDisplayName,
  countBuckets,
  isInterviewingStage,
  parseDate,
} from "@/lib/dm-dashboard/territory-shared";
import { isDmRole } from "@/lib/auth/roles";
import type { DmOnboardingSnapshot } from "@/lib/dm-dashboard/dm-onboarding-snapshot";
import { getAssignedStatesForDm } from "@/lib/dm-territory-map";
import {
  buildDmMelMatchingMetrics,
  type DmMelMatchingMetrics,
} from "@/lib/mel-matching/mel-matching-metrics";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import type { ChartBar } from "@/lib/recruiting-intelligence";

export type DmDashboardKpi = {
  id: string;
  label: string;
  value: string;
  hint: string;
};

export type DmCandidateSummary = {
  candidateId: string;
  name: string;
  score: number;
  tierLabel: string;
  position: string;
  city: string;
  state: string;
  stage: string;
  source: string;
  appliedDate?: string;
};

/** Lightweight API payload — no raw Breezy job/candidate arrays. */
export type DmDashboardSnapshot = {
  dmName: string;
  territoryStates: string[];
  territoryLabel: string;
  fetchedAt: string;
  health: TerritoryHealthScore;
  kpis: DmDashboardKpi[];
  activeJobs: number;
  candidatesLast7Days: number;
  interviewing: number;
  agingJobs: number;
  topHiringCities: ChartBar[];
  candidateSources: ChartBar[];
  fillRiskAlerts: DmAttentionItem[];
  needsAttention: DmAttentionItem[];
  highestFillRisk: DmAttentionItem[];
  topCandidates: DmCandidateSummary[];
  recentApplicants: DmCandidateSummary[];
  coverage: TerritoryCoverageSnapshot;
  pipeline: CandidatePipelineSnapshot;
  heatmap: TerritoryHeatmapPayload;
  melMatching: DmMelMatchingMetrics;
  onboarding: DmOnboardingSnapshot;
};

export function buildDmDashboardSnapshot(
  session: AuthSession,
  jobs: BreezyJob[],
  candidates: BreezyCandidate[],
  fetchedAt: string,
  melOpportunities: MelOpportunity[] = [],
  onboarding: DmOnboardingSnapshot = {
    paperworkSent: 0,
    paperworkSigned: 0,
    ddNotRequested: 0,
    ddRequested: 0,
    ddReceived: 0,
    ddApproved: 0,
    awaitingDdVerification: 0,
  },
): DmDashboardSnapshot {
  const dmName = session.dmName ?? session.name;
  const territoryStates = isDmRole(session.role)
    ? session.territoryStates
    : getAssignedStatesForDm(dmName);
  const territoryLabel =
    territoryStates.length > 0 ? territoryStates.join(", ") : "All territories";

  const reference = new Date(fetchedAt);
  const health = buildTerritoryHealthScore(jobs, candidates, fetchedAt);
  const needsAttention = buildDmNeedsAttention(jobs, candidates, fetchedAt);
  const fillRiskAlerts = buildTerritoryFillRiskAlerts(jobs, candidates, fetchedAt);
  const highestFillRisk = highestFillRiskAlerts(fillRiskAlerts, 12);
  const coverage = buildCoverageIntelligence(jobs, candidates, fetchedAt);
  const pipeline = buildCandidatePipeline(candidates, fetchedAt);
  const heatmap = buildTerritoryHeatmapPayload(jobs, candidates, fetchedAt, territoryLabel);

  const agingJobs = jobs.filter((job) => {
    const created = parseDate(job.createdDate || job.updatedDate);
    if (!created) return false;
    const days = Math.round((reference.getTime() - created.getTime()) / MS_PER_DAY);
    return days >= 21;
  }).length;

  const interviewing = candidates.filter((c) => isInterviewingStage(c.stage)).length;
  const candidatesLast7Days = countCandidatesLast7Days(candidates, fetchedAt);

  const topHiringCities = countBuckets(
    jobs.map((job) => ({ label: `${job.city}, ${job.state}`.trim() })),
    (row) => row.label,
  );

  const candidateSources = countBuckets(
    candidates.map((c) => ({ label: c.source.trim() || "Unknown" })),
    (r) => r.label,
  );

  const kpis: DmDashboardKpi[] = [
    {
      id: "health",
      label: "Territory health",
      value: `${health.score}`,
      hint: `${health.label} — composite of flow, aging, interviews, volume, velocity`,
    },
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
      hint: "No applicants, no interviews, aging tiers, low-flow cities",
    },
    {
      id: "attention",
      label: "Needs attention",
      value: needsAttention.length.toLocaleString(),
      hint: "Combined attention queue items",
    },
    {
      id: "stalled",
      label: "Stalled pipeline",
      value: pipeline.counts.stalled.toLocaleString(),
      hint: "Candidates with 14+ days without stage progression",
    },
    {
      id: "paperwork-signed",
      label: "Paperwork signed",
      value: onboarding.paperworkSigned.toLocaleString(),
      hint: "Onboarding packets completed in territory",
    },
    {
      id: "dd-pending",
      label: "DD verification pending",
      value: onboarding.awaitingDdVerification.toLocaleString(),
      hint: "Awaiting direct deposit verification from candidate",
    },
  ];

  const mapCandidate = (
    candidate: BreezyCandidate,
    ai?: { numericScore: number; tierLabel: string },
    appliedDate?: string,
  ): DmCandidateSummary => ({
    candidateId: candidate.candidateId,
    name: candidateDisplayName(candidate),
    score: ai?.numericScore ?? candidate.score ?? 0,
    tierLabel: ai?.tierLabel ?? "—",
    position: candidate.positionName || "—",
    city: candidate.city || "—",
    state: candidate.state || "—",
    stage: candidate.stage || "—",
    source: candidate.source || "—",
    appliedDate: appliedDate ?? candidate.appliedDate,
  });

  const topCandidates = topScoredCandidates(candidates, 12).map(({ candidate, ai }) =>
    mapCandidate(candidate, ai),
  );

  const recentApplicantRows = recentApplicants(candidates, fetchedAt, 15).map((row) => {
    const candidate = candidates.find((c) => c.candidateId === row.candidateId);
    return candidate
      ? mapCandidate(candidate, undefined, row.appliedDate)
      : {
          candidateId: row.candidateId,
          name: row.name,
          score: 0,
          tierLabel: "—",
          position: row.position,
          city: row.city,
          state: row.state,
          stage: row.stage,
          source: row.source,
          appliedDate: row.appliedDate,
        };
  });

  return {
    dmName,
    territoryStates,
    territoryLabel,
    fetchedAt,
    health,
    kpis,
    activeJobs: jobs.length,
    candidatesLast7Days,
    interviewing,
    agingJobs,
    topHiringCities,
    candidateSources,
    fillRiskAlerts,
    needsAttention,
    highestFillRisk,
    topCandidates,
    recentApplicants: recentApplicantRows,
    coverage,
    pipeline,
    heatmap,
    melMatching: buildDmMelMatchingMetrics(candidates, melOpportunities, territoryStates),
    onboarding,
  };
}
