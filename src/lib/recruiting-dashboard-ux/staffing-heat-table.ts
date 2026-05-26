import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import { cityKey, candidatesForJob } from "@/lib/dm-dashboard/territory-shared";
import type { RecruiterEscalationQueueItem } from "@/lib/operational-escalation/operational-escalation-types";
import type { RecruitingIntelligenceSnapshot } from "@/lib/recruiting-automation/build-recruiting-intelligence";
import { expandMetroCities } from "@/lib/job-management/job-metro-expansion";

export type StaffingHeatLevel = "healthy" | "moderate" | "critical";

export type StaffingHeatTrend = "improving" | "declining" | "stable";

export type StaffingHeatRow = {
  id: string;
  level: StaffingHeatLevel;
  label: string;
  scope: "state" | "metro" | "city";
  openJobs: number;
  zeroApplicantJobs: number;
  activeReps: number;
  escalationCount: number;
  applicants7d: number;
  healthScore: number;
  demandScore: number;
  rank?: number;
  staffingPressureScore?: number;
  trend?: StaffingHeatTrend;
  trendDelta?: number;
  isHighestRisk?: boolean;
};

const LEVEL_RANK: Record<StaffingHeatLevel, number> = {
  critical: 0,
  moderate: 1,
  healthy: 2,
};

function classifyHealth(score: number): StaffingHeatLevel {
  if (score >= 70) return "critical";
  if (score >= 40) return "moderate";
  return "healthy";
}

export function buildStaffingHeatRows(input: {
  jobs: BreezyJob[];
  candidates: BreezyCandidate[];
  escalations: RecruiterEscalationQueueItem[];
  snapshot: RecruitingIntelligenceSnapshot;
  activeRepsByState: Map<string, number>;
  melDemandByState?: Map<string, number>;
}): StaffingHeatRow[] {
  const since7d = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const cityAgg = new Map<
    string,
    {
      label: string;
      city: string;
      state: string;
      openJobs: number;
      zeroApplicantJobs: number;
      applicants7d: number;
      escalationCount: number;
    }
  >();

  for (const job of input.jobs) {
    const key = cityKey(job.city, job.state);
    const row =
      cityAgg.get(key) ??
      ({
        label: `${job.city}, ${job.state}`,
        city: job.city,
        state: job.state,
        openJobs: 0,
        zeroApplicantJobs: 0,
        applicants7d: 0,
        escalationCount: 0,
      } satisfies (typeof cityAgg extends Map<string, infer V> ? V : never));

    row.openJobs += 1;
    const jobCandidates = candidatesForJob(job, input.candidates);
    if (jobCandidates.length === 0) row.zeroApplicantJobs += 1;
    row.applicants7d += jobCandidates.filter((c) => {
      const applied = Date.parse(c.appliedDate);
      return Number.isFinite(applied) && applied >= since7d;
    }).length;
    cityAgg.set(key, row);
  }

  for (const escalation of input.escalations) {
    const key = cityKey(escalation.city, escalation.state);
    const row = cityAgg.get(key);
    if (row) row.escalationCount += 1;
  }

  const territoryPressure = input.snapshot.decisionIntelligence?.territory.staffingPressureScore ?? 50;

  const cityRows: StaffingHeatRow[] = [...cityAgg.values()].map((row) => {
    const reps = input.activeRepsByState.get(row.state.trim().toUpperCase()) ?? 0;
    const melDemand = input.melDemandByState?.get(row.state.trim().toUpperCase()) ?? 0;
    const zeroRate = row.openJobs > 0 ? row.zeroApplicantJobs / row.openJobs : 0;
    const healthScore = Math.min(
      100,
      Math.round(
        zeroRate * 40 +
          row.escalationCount * 12 +
          Math.max(0, 8 - row.applicants7d) * 4 +
          territoryPressure * 0.2 +
          melDemand * 2,
      ),
    );
    const demandScore = row.openJobs * 5 + melDemand * 3 - row.applicants7d;
    return {
      id: `city:${cityKey(row.city, row.state)}`,
      level: classifyHealth(healthScore),
      label: row.label,
      scope: "city",
      openJobs: row.openJobs,
      zeroApplicantJobs: row.zeroApplicantJobs,
      activeReps: reps,
      escalationCount: row.escalationCount,
      applicants7d: row.applicants7d,
      healthScore,
      demandScore,
    };
  });

  const metroRows: StaffingHeatRow[] = [];
  const metrosSeen = new Set<string>();
  for (const job of input.jobs.slice(0, 40)) {
    const metroKey = `${job.city}|${job.state}`;
    if (metrosSeen.has(metroKey)) continue;
    metrosSeen.add(metroKey);
    const cities = expandMetroCities(job.city, job.state, 5);
    const cluster = cityRows.filter((row) =>
      cities.some((c) => row.label.toLowerCase().startsWith(c.toLowerCase())),
    );
    if (cluster.length === 0) continue;
    const openJobs = cluster.reduce((sum, row) => sum + row.openJobs, 0);
    const zeroApplicantJobs = cluster.reduce((sum, row) => sum + row.zeroApplicantJobs, 0);
    const escalationCount = cluster.reduce((sum, row) => sum + row.escalationCount, 0);
    const applicants7d = cluster.reduce((sum, row) => sum + row.applicants7d, 0);
    const healthScore = Math.round(
      cluster.reduce((sum, row) => sum + row.healthScore, 0) / cluster.length,
    );
    metroRows.push({
      id: `metro:${metroKey}`,
      level: classifyHealth(healthScore),
      label: `Metro: ${job.city}, ${job.state}`,
      scope: "metro",
      openJobs,
      zeroApplicantJobs,
      activeReps: input.activeRepsByState.get(job.state.trim().toUpperCase()) ?? 0,
      escalationCount,
      applicants7d,
      healthScore,
      demandScore: openJobs * 5 - applicants7d,
    });
  }

  const stateAgg = new Map<string, StaffingHeatRow>();
  for (const row of cityRows) {
    const state = row.label.split(", ").pop()?.trim().toUpperCase() ?? row.id;
    const existing = stateAgg.get(state);
    if (!existing) {
      stateAgg.set(state, {
        id: `state:${state}`,
        level: row.level,
        label: state,
        scope: "state",
        openJobs: row.openJobs,
        zeroApplicantJobs: row.zeroApplicantJobs,
        activeReps: row.activeReps,
        escalationCount: row.escalationCount,
        applicants7d: row.applicants7d,
        healthScore: row.healthScore,
        demandScore: row.demandScore,
      });
      continue;
    }
    existing.openJobs += row.openJobs;
    existing.zeroApplicantJobs += row.zeroApplicantJobs;
    existing.escalationCount += row.escalationCount;
    existing.applicants7d += row.applicants7d;
    existing.healthScore = Math.round((existing.healthScore + row.healthScore) / 2);
    existing.level = classifyHealth(existing.healthScore);
  }

  const sorted = [...stateAgg.values(), ...metroRows, ...cityRows].sort(
    (a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level] || b.healthScore - a.healthScore,
  );
  return enrichStaffingHeatRows(sorted, territoryPressure);
}

export function enrichStaffingHeatRows(
  rows: StaffingHeatRow[],
  staffingPressureScore = 50,
): StaffingHeatRow[] {
  if (rows.length === 0) return rows;
  const maxScore = Math.max(...rows.map((row) => row.healthScore), 1);
  const topRiskId = rows[0]?.id;

  return rows.map((row, index) => {
    const zeroRate = row.openJobs > 0 ? row.zeroApplicantJobs / row.openJobs : 0;
    const applPerJob = row.openJobs > 0 ? row.applicants7d / row.openJobs : 0;
    let trend: StaffingHeatTrend = "stable";
    if (zeroRate >= 0.5 || row.escalationCount >= 2) trend = "declining";
    else if (applPerJob >= 1.5 && row.escalationCount === 0) trend = "improving";

    const trendDelta =
      trend === "declining"
        ? Math.round(zeroRate * 20 + row.escalationCount * 5)
        : trend === "improving"
          ? -Math.round(applPerJob * 8)
          : 0;

    return {
      ...row,
      rank: index + 1,
      staffingPressureScore,
      trend,
      trendDelta,
      isHighestRisk: row.id === topRiskId && row.level !== "healthy",
    };
  });
}

export const HEAT_LEVEL_STYLES: Record<StaffingHeatLevel, string> = {
  healthy: "border-emerald-500/30 bg-emerald-500/10 text-emerald-100",
  moderate: "border-amber-500/30 bg-amber-500/10 text-amber-100",
  critical: "border-red-500/30 bg-red-500/10 text-red-100",
};

/** Snapshot-only heat rows when raw Breezy arrays are unavailable. */
export function buildStaffingHeatRowsFromSnapshot(
  snapshot: RecruitingIntelligenceSnapshot,
  escalations: RecruiterEscalationQueueItem[] = [],
): StaffingHeatRow[] {
  const territory = snapshot.decisionIntelligence?.territory;
  if (!territory) return [];

  const cityRows: StaffingHeatRow[] = territory.topRiskCities.map((row, index) => ({
    id: `city-risk:${row.label}:${index}`,
    level: row.escalationCount > 0 ? "critical" : row.applicants7d === 0 ? "moderate" : "healthy",
    label: row.label,
    scope: "city",
    openJobs: row.openJobs,
    zeroApplicantJobs: Math.max(0, row.openJobs - Math.min(row.applicants7d, row.openJobs)),
    activeReps: 0,
    escalationCount: row.escalationCount,
    applicants7d: row.applicants7d,
    healthScore: Math.min(100, row.score),
    demandScore: row.openJobs * 5 - row.applicants7d,
  }));

  const stateRows: StaffingHeatRow[] = [];
  if (territory.highestRiskTerritory) {
    stateRows.push({
      id: `state:${territory.highestRiskTerritory}`,
      level: territory.staffingPressureScore >= 70 ? "critical" : "moderate",
      label: territory.highestRiskTerritory,
      scope: "state",
      openJobs: cityRows.reduce((sum, row) => sum + row.openJobs, 0),
      zeroApplicantJobs: cityRows.reduce((sum, row) => sum + row.zeroApplicantJobs, 0),
      activeReps: 0,
      escalationCount: escalations.filter((row) => row.status !== "completed").length,
      applicants7d: cityRows.reduce((sum, row) => sum + row.applicants7d, 0),
      healthScore: territory.staffingPressureScore,
      demandScore: territory.staffingPressureScore,
    });
  }

  const sorted = [...stateRows, ...cityRows].sort(
    (a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level] || b.healthScore - a.healthScore,
  );
  return enrichStaffingHeatRows(sorted, territory.staffingPressureScore);
}
