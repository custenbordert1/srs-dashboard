import { scoreCandidate, type AiScoreTier } from "@/lib/candidate-ai-scoring";
import { buildBreezyAtsMetrics, countBreezyApplicantsToday } from "@/lib/breezy-ats-metrics";
import {
  countCandidatesLast7Days,
  isPartialBreezyPositionSync,
  type BreezyCandidate,
  type BreezyCandidatesSuccess,
  type BreezyJobsSuccess,
} from "@/lib/breezy-api";
import type { Kpi } from "@/lib/recruiting-sample-data";
import {
  buildJobsByPositionId,
  scoreCandidateIntelligence,
  type ChartBar,
  type CandidateMatchLevel,
} from "@/lib/recruiting-intelligence";

const MS_PER_HOUR = 60 * 60 * 1000;

export const TRACKED_SOURCE_CHANNELS = [
  {
    id: "indeed-organic",
    label: "Indeed Organic",
    patterns: ["indeed organic", "organic indeed"],
  },
  {
    id: "monster",
    label: "Monster",
    patterns: ["monster"],
  },
  {
    id: "directemployers",
    label: "DirectEmployers",
    patterns: ["directemployers", "direct employers"],
  },
  {
    id: "indeed-apply",
    label: "Indeed Apply",
    patterns: ["indeed apply", "indeed easy apply", "indeed sponsored"],
  },
] as const;

export type CommandCenterFunnelStage = "applied" | "interviewing" | "hired";

export type CommandCenterRankedRow = {
  candidateId: string;
  name: string;
  stage: string;
  source: string;
  position: string;
  state: string;
  location: string;
  appliedDate: string;
  appliedDateLabel: string;
  appliedHoursAgo: number | null;
  agingClassName: string;
  aiScore: number;
  aiTier: AiScoreTier;
  aiTierLabel: string;
  matchPercent: number;
  matchLevel: CandidateMatchLevel;
  isTopMatch: boolean;
  hasResume: boolean;
  skillTags: string[];
};

export type CommandCenterFilterOptions = {
  states: string[];
  sources: string[];
  stages: string[];
  matchLevels: CandidateMatchLevel[];
};

export type CommandCenterSnapshot = {
  kpis: Kpi[];
  funnel: ChartBar[];
  rankedCandidates: CommandCenterRankedRow[];
  topCandidates: CommandCenterRankedRow[];
  filterOptions: CommandCenterFilterOptions;
  sourceBreakdown: ChartBar[];
  applicantsToday: number;
  applicantsLast7Days: number;
  activeJobs: number;
  interviewing: number;
  topSource: string;
  positionsScanned: number;
  totalPositionsAvailable: number;
  partialPositionSync: boolean;
  lastSyncLabel: string;
  fetchedAt: string;
  truncated: boolean;
  connected: boolean;
};

function parseAppliedDate(raw: string): Date | null {
  if (!raw.trim()) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatAppliedDate(raw: string): string {
  const date = parseAppliedDate(raw);
  if (!date) return raw.trim() || "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

export function formatCommandCenterSyncTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function candidateName(candidate: BreezyCandidate): string {
  const name = `${candidate.firstName} ${candidate.lastName}`.trim();
  return name || candidate.email || "Unknown candidate";
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function classifyFunnelStage(stage: string): CommandCenterFunnelStage {
  const normalized = normalizeText(stage);
  if (
    normalized.includes("hired") ||
    normalized.includes("offer") ||
    normalized.includes("onboard") ||
    normalized.includes("active rep")
  ) {
    return "hired";
  }
  if (
    normalized.includes("interview") ||
    normalized.includes("screen") ||
    normalized.includes("assessment") ||
    normalized.includes("qualified") ||
    normalized.includes("review")
  ) {
    return "interviewing";
  }
  return "applied";
}

function isInterviewingStage(stage: string): boolean {
  return classifyFunnelStage(stage) === "interviewing";
}

function classifyTrackedSourceId(source: string): (typeof TRACKED_SOURCE_CHANNELS)[number]["id"] | null {
  const normalized = normalizeText(source);
  if (normalized.includes("indeed apply") || normalized.includes("indeed easy apply")) {
    return "indeed-apply";
  }
  if (normalized.includes("indeed organic") || normalized.includes("organic indeed")) {
    return "indeed-organic";
  }
  if (normalized.includes("monster")) return "monster";
  if (normalized.includes("directemployers") || normalized.includes("direct employers")) {
    return "directemployers";
  }
  if (normalized.includes("indeed")) return "indeed-apply";
  return null;
}

function countTrackedSources(candidates: BreezyCandidate[]): ChartBar[] {
  const counts = new Map<string, number>();
  for (const channel of TRACKED_SOURCE_CHANNELS) {
    counts.set(channel.id, 0);
  }
  for (const candidate of candidates) {
    const id = classifyTrackedSourceId(candidate.source);
    if (!id) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return TRACKED_SOURCE_CHANNELS.map((channel) => ({
    label: channel.label,
    value: counts.get(channel.id) ?? 0,
  }));
}

export function appliedAgingHours(appliedDate: string, reference: Date): number | null {
  const applied = parseAppliedDate(appliedDate);
  if (!applied) return null;
  return Math.max(0, Math.round((reference.getTime() - applied.getTime()) / MS_PER_HOUR));
}

export function appliedAgingClassName(hours: number | null): string {
  if (hours === null) return "text-zinc-500";
  if (hours < 24) return "font-medium text-emerald-300";
  if (hours <= 72) return "font-medium text-amber-300";
  return "font-medium text-red-300";
}

function flatKpi(id: string, label: string, value: string, hint: string): Kpi {
  return {
    id,
    label,
    value,
    change: "—",
    changeDirection: "flat",
    hint,
  };
}

function topSourceLabel(candidates: BreezyCandidate[]): string {
  const counts = new Map<string, number>();
  for (const candidate of candidates) {
    const label = candidate.source.trim() || "Unknown source";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (sorted.length === 0) return "—";
  return `${sorted[0][0]} (${sorted[0][1].toLocaleString()})`;
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}

function buildFilterOptions(candidates: BreezyCandidate[]): CommandCenterFilterOptions {
  return {
    states: sortedUnique(candidates.map((candidate) => candidate.state)),
    sources: sortedUnique(candidates.map((candidate) => candidate.source)),
    stages: sortedUnique(candidates.map((candidate) => candidate.stage)),
    matchLevels: ["high", "medium", "low", "no_resume"],
  };
}

function buildRankedCandidates(
  candidates: BreezyCandidate[],
  reference: Date,
  jobsByPositionId: Map<string, { city: string; state: string; zip?: string }>,
): CommandCenterRankedRow[] {
  return candidates
    .map((candidate) => {
      const city = candidate.city.trim();
      const state = candidate.state.trim();
      const hours = appliedAgingHours(candidate.appliedDate, reference);
      const ai = scoreCandidate(candidate, "Needs Review", { resumeText: candidate.resumeText });
      const job = jobsByPositionId.get(candidate.positionId);
      const intelligence = scoreCandidateIntelligence(candidate, {
        referenceIso: reference.toISOString(),
        job: job ?? { city: candidate.city, state: candidate.state },
      });
      return {
        candidateId: candidate.candidateId,
        name: candidateName(candidate),
        stage: candidate.stage.trim() || "—",
        source: candidate.source.trim() || "—",
        position: candidate.positionName.trim() || "—",
        state: state || "—",
        location: [city, state].filter(Boolean).join(", ") || "—",
        appliedDate: candidate.appliedDate,
        appliedDateLabel: formatAppliedDate(candidate.appliedDate),
        appliedHoursAgo: hours,
        agingClassName: appliedAgingClassName(hours),
        aiScore: ai.numericScore,
        aiTier: ai.tier,
        aiTierLabel: ai.tierLabel,
        matchPercent: intelligence.matchPercent,
        matchLevel: intelligence.matchLevel,
        isTopMatch: intelligence.isTopMatch,
        hasResume: intelligence.hasResume,
        skillTags: intelligence.skillTagLabels,
      };
    })
    .sort(
      (a, b) =>
        b.matchPercent - a.matchPercent ||
        b.aiScore - a.aiScore ||
        a.name.localeCompare(b.name),
    );
}

export function buildRecruitingCommandCenter(
  candidatesData: BreezyCandidatesSuccess,
  jobsData: BreezyJobsSuccess,
): CommandCenterSnapshot {
  const ats = buildBreezyAtsMetrics(candidatesData, jobsData);
  const {
    candidates,
    fetchedAt,
    positionsScanned = ats.positionsScanned,
    totalPositionsAvailable = ats.totalPositionsAvailable,
    candidatesLast7Days,
  } = candidatesData;
  const partialPositionSync = isPartialBreezyPositionSync(candidatesData);
  const syncTime = new Date(fetchedAt);
  const lastSyncLabel = ats.lastSuccessfulSyncLabel;

  const applicantsToday = countBreezyApplicantsToday(candidates, fetchedAt);
  const applicantsLast7Days =
    candidatesLast7Days ?? countCandidatesLast7Days(candidates, fetchedAt);
  const activeJobs = ats.publishedJobs;
  const interviewing = candidates.filter((candidate) => isInterviewingStage(candidate.stage)).length;
  const topSource = topSourceLabel(candidates);

  const funnelCounts: Record<CommandCenterFunnelStage, number> = {
    applied: 0,
    interviewing: 0,
    hired: 0,
  };
  for (const candidate of candidates) {
    funnelCounts[classifyFunnelStage(candidate.stage)] += 1;
  }

  const funnel: ChartBar[] = [
    { label: "Applied", value: funnelCounts.applied },
    { label: "Interviewing", value: funnelCounts.interviewing },
    { label: "Hired", value: funnelCounts.hired },
  ];

  const sourceBreakdown = countTrackedSources(candidates);

  const kpis: Kpi[] = [
    flatKpi("cc-today", "Applicants Today", applicantsToday.toLocaleString(), "Applied in the last 24 hours"),
    flatKpi(
      "cc-7d",
      "Applicants Last 7 Days",
      applicantsLast7Days.toLocaleString(),
      "Applied in the last 7 days (relative to sync)",
    ),
    flatKpi("cc-jobs", "Active Jobs", activeJobs.toLocaleString(), "Published positions from Breezy jobs API"),
    flatKpi("cc-interviewing", "Interviewing", interviewing.toLocaleString(), "Candidates in interview pipeline stages"),
    flatKpi("cc-top-source", "Top Source", topSource, "Highest-volume applicant source in current pull"),
    flatKpi(
      "cc-positions",
      "Positions Scanned",
      `${positionsScanned.toLocaleString()} / ${totalPositionsAvailable.toLocaleString()}`,
      partialPositionSync
        ? `${ats.positionsNotScanned.toLocaleString()} published position(s) not scanned yet`
        : "All published positions included in candidate aggregation",
    ),
    flatKpi("cc-sync", "Last successful sync", lastSyncLabel, "Last successful Breezy candidates sync"),
  ];

  const jobsByPositionId = buildJobsByPositionId(jobsData.jobs);
  const rankedCandidates = buildRankedCandidates(candidates, syncTime, jobsByPositionId);

  return {
    kpis,
    funnel,
    rankedCandidates,
    topCandidates: rankedCandidates.slice(0, 8),
    filterOptions: buildFilterOptions(candidates),
    sourceBreakdown,
    applicantsToday,
    applicantsLast7Days,
    activeJobs,
    interviewing,
    topSource,
    positionsScanned,
    totalPositionsAvailable,
    partialPositionSync,
    lastSyncLabel,
    fetchedAt,
    truncated: partialPositionSync,
    connected: true,
  };
}
