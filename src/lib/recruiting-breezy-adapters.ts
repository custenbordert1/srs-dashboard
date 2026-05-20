import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import { calendarAgeDays } from "@/lib/post-automation";
import {
  computeAPlusScore,
  computeRecruitingRiskLevel,
  isRuralState,
  type ChartBar,
  type IntelligenceOpenPost,
  type RecruitingIntelligenceSnapshot,
} from "@/lib/recruiting-intelligence";
import type { Kpi } from "@/lib/recruiting-sample-data";
import type { SheetKpiSnapshot } from "@/lib/sheet-kpi-metrics";
import { sheetSnapshotToKpis } from "@/lib/sheet-kpi-metrics";

function parseBreezyDate(iso: string): Date | null {
  if (!iso.trim()) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function weekBucketLabel(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(d);
}

export function countApplicantsByPosition(candidates: BreezyCandidate[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const c of candidates) {
    const id = c.positionId?.trim();
    if (!id) continue;
    map.set(id, (map.get(id) ?? 0) + 1);
  }
  return map;
}

export function breezyJobsToOpenPosts(
  jobs: BreezyJob[],
  applicantByPosition: Map<string, number>,
): IntelligenceOpenPost[] {
  const titleCounts = new Map<string, number>();
  for (const job of jobs) {
    const title = job.name || "Untitled role";
    titleCounts.set(title, (titleCounts.get(title) ?? 0) + 1);
  }

  const posts: IntelligenceOpenPost[] = [];
  for (const job of jobs) {
    const jobTitle = job.name || "Untitled role";
    const city = job.city || "—";
    const state = job.state || "—";
    const applicantCount = job.candidateCount ?? applicantByPosition.get(job.jobId) ?? 0;
    const created = parseBreezyDate(job.createdDate || job.updatedDate);
    const daysOpen = created ? calendarAgeDays(created) : null;
    const storeCount = titleCounts.get(jobTitle) ?? 1;
    const rural = isRuralState(state);
    const riskLevel = computeRecruitingRiskLevel({
      applicantCount,
      daysOpen,
      state,
      openings: 1,
    });
    const aPlusScore = computeAPlusScore({
      applicantCount,
      daysOpen,
      storeCount,
      isRural: rural,
    });

    posts.push({
      jobTitle,
      city,
      state,
      manager: job.department || "—",
      applicantCount,
      daysOpen,
      openings: 1,
      storeCount,
      isRural: rural,
      aPlusScore,
      riskLevel,
    });
  }

  return posts.sort((a, b) => b.aPlusScore - a.aPlusScore);
}

function incrementMap(map: Map<string, number>, key: string, delta = 1) {
  const k = key.trim() || "—";
  map.set(k, (map.get(k) ?? 0) + delta);
}

function topEntries(map: Map<string, number>, limit: number): ChartBar[] {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([label, value]) => ({ label, value }));
}

export function computeRecruitingIntelligenceFromBreezy(
  jobs: BreezyJob[],
  candidates: BreezyCandidate[],
): RecruitingIntelligenceSnapshot {
  const published = jobs.filter((j) => {
    const s = (j.status || "").toLowerCase();
    return s === "published" || s === "unknown" || !s;
  });

  const applicantByPosition = countApplicantsByPosition(candidates);
  const openPosts = breezyJobsToOpenPosts(published, applicantByPosition);

  const stateOpenings = new Map<string, number>();
  const stateApplicants = new Map<string, number>();
  const managerOpenings = new Map<string, number>();
  const zeroByWeek = new Map<string, number>();

  let zeroApplicantPosts = 0;
  let totalApplicants = 0;
  let postsWithApplicants = 0;

  for (const post of openPosts) {
    totalApplicants += post.applicantCount;
    if (post.applicantCount === 0) zeroApplicantPosts += 1;
    else postsWithApplicants += 1;
    incrementMap(stateOpenings, post.state, post.openings);
    incrementMap(stateApplicants, post.state, post.applicantCount);
    incrementMap(managerOpenings, post.manager, post.openings);
    if (post.applicantCount === 0 && post.daysOpen !== null) {
      incrementMap(zeroByWeek, weekBucketLabel(new Date()), 1);
    }
  }

  const aPlusOpportunities = openPosts.filter((p) => p.aPlusScore >= 40).slice(0, 50);

  return {
    openPosts: openPosts.length,
    zeroApplicantPosts,
    avgApplicantsPerOpening:
      openPosts.length > 0 ? Math.round((totalApplicants / openPosts.length) * 10) / 10 : null,
    topStates: topEntries(stateOpenings, 8),
    topManagers: topEntries(managerOpenings, 8),
    conversionEstimatePercent:
      postsWithApplicants > 0
        ? Math.round((postsWithApplicants / Math.max(1, openPosts.length)) * 1000) / 10
        : null,
    applicantsByState: topEntries(stateApplicants, 10),
    openingsByManager: topEntries(managerOpenings, 10),
    zeroApplicantTrend: topEntries(zeroByWeek, 8),
    aPlusOpportunities,
    columnHint: "Live data from Breezy HR (published jobs + candidate sync)",
  };
}

export function computeBreezyKpiSnapshot(
  jobs: BreezyJob[],
  candidates: BreezyCandidate[],
): SheetKpiSnapshot {
  const published = jobs.filter((j) => {
    const s = (j.status || "").toLowerCase();
    return s === "published" || s === "unknown" || !s;
  });
  const applicantByPosition = countApplicantsByPosition(candidates);

  let totalApplicants = 0;
  let zeroApplicantPosts = 0;

  for (const job of published) {
    const count = job.candidateCount ?? applicantByPosition.get(job.jobId) ?? 0;
    totalApplicants += count;
    if (count === 0) zeroApplicantPosts += 1;
  }

  return {
    openPosts: published.length,
    totalApplicants,
    zeroApplicantPosts,
    breezyLinkedPercent: published.length > 0 ? 100 : null,
    breezyLinkedCount: published.length,
    columnHints: "Live Breezy published jobs (100% ATS-linked)",
  };
}

export function breezyKpisFromSnapshot(
  jobs: BreezyJob[],
  candidates: BreezyCandidate[],
  error?: string,
): Kpi[] {
  return sheetSnapshotToKpis(computeBreezyKpiSnapshot(jobs, candidates), error);
}

export type BreezyOverviewJob = {
  id: string;
  title: string;
  location: string;
  status: string;
  applicants: number;
  posted: string;
  source: string;
};

export function breezyJobsToOverviewRows(
  jobs: BreezyJob[],
  applicantByPosition: Map<string, number>,
): BreezyOverviewJob[] {
  return jobs
    .filter((j) => {
      const s = (j.status || "").toLowerCase();
      return s === "published" || s === "unknown" || !s;
    })
    .slice(0, 12)
    .map((job) => ({
      id: job.jobId,
      title: job.name,
      location: job.displayLocation || [job.city, job.state].filter(Boolean).join(", ") || "—",
      status: job.status || "published",
      applicants: job.candidateCount ?? applicantByPosition.get(job.jobId) ?? 0,
      posted: job.createdDate
        ? new Date(job.createdDate).toLocaleDateString()
        : "—",
      source: job.source ?? "Breezy",
    }));
}
