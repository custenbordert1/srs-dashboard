import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import { getDmForState, normalizeStateCode } from "@/lib/dm-territory-map";
import {
  MS_PER_DAY,
  cityKey,
  countBuckets,
  daysSince,
  parseDate,
} from "@/lib/dm-dashboard/territory-shared";
import type { ChartBar } from "@/lib/recruiting-intelligence";

export type TerritoryCoverageSnapshot = {
  topProblemCities: ChartBar[];
  hardestToFillTerritories: ChartBar[];
  candidateShortagesByState: ChartBar[];
  hiringVelocityTrends: ChartBar[];
};

function problemScoreForCity(jobs: BreezyJob[], candidates: BreezyCandidate[], reference: Date): number {
  const since7d = new Date(reference.getTime() - 7 * MS_PER_DAY);
  let score = 0;
  for (const job of jobs) {
    const age = daysSince(job.createdDate || job.updatedDate, reference);
    if (age !== null && age >= 21) score += 3;
    else if (age !== null && age >= 14) score += 2;
  }
  const recent = candidates.filter((c) => {
    const applied = parseDate(c.appliedDate);
    return applied !== null && applied >= since7d;
  }).length;
  if (jobs.length > 0 && recent === 0) score += 5;
  if (jobs.length > candidates.length) score += 2;
  return score;
}

export function buildCoverageIntelligence(
  jobs: BreezyJob[],
  candidates: BreezyCandidate[],
  referenceIso: string,
): TerritoryCoverageSnapshot {
  const reference = new Date(referenceIso);
  const jobsByCity = new Map<string, BreezyJob[]>();
  const candidatesByCity = new Map<string, BreezyCandidate[]>();

  for (const job of jobs) {
    const key = cityKey(job.city, job.state);
    const list = jobsByCity.get(key) ?? [];
    list.push(job);
    jobsByCity.set(key, list);
  }

  for (const candidate of candidates) {
    const key = cityKey(candidate.city, candidate.state);
    const list = candidatesByCity.get(key) ?? [];
    list.push(candidate);
    candidatesByCity.set(key, list);
  }

  const cityProblems: ChartBar[] = [...jobsByCity.entries()]
    .map(([label, cityJobs]) => ({
      label,
      value: problemScoreForCity(cityJobs, candidatesByCity.get(label) ?? [], reference),
    }))
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
    .slice(0, 8);

  const territoryDifficulty = new Map<string, number>();
  for (const job of jobs) {
    const dm = getDmForState(job.state) ?? "Unassigned";
    const jobCandidates = candidates.filter(
      (c) => normalizeStateCode(c.state) === normalizeStateCode(job.state),
    );
    const age = daysSince(job.createdDate || job.updatedDate, reference) ?? 0;
    const difficulty = age + (jobCandidates.length === 0 ? 10 : Math.max(0, 5 - jobCandidates.length));
    territoryDifficulty.set(dm, (territoryDifficulty.get(dm) ?? 0) + difficulty);
  }

  const hardestToFillTerritories: ChartBar[] = [...territoryDifficulty.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8)
    .map(([label, value]) => ({ label, value }));

  const jobsByState = countBuckets(
    jobs.map((j) => ({ label: normalizeStateCode(j.state) || "—" })),
    (r) => r.label,
    12,
  );
  const candidatesByState = countBuckets(
    candidates.map((c) => ({ label: normalizeStateCode(c.state) || "—" })),
    (r) => r.label,
    12,
  );
  const candidateMap = new Map(candidatesByState.map((r) => [r.label, r.value]));

  const candidateShortagesByState: ChartBar[] = jobsByState
    .map((row) => {
      const candidateCount = candidateMap.get(row.label) ?? 0;
      const gap = Math.max(0, row.value - candidateCount);
      return { label: row.label, value: gap };
    })
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
    .slice(0, 8);

  const weekBuckets = new Map<string, number>();
  for (let week = 7; week >= 0; week -= 1) {
    const start = new Date(reference.getTime() - (week + 1) * 7 * MS_PER_DAY);
    const end = new Date(reference.getTime() - week * 7 * MS_PER_DAY);
    const label =
      week === 0
        ? "This week"
        : week === 1
          ? "Last week"
          : `${week}w ago`;
    weekBuckets.set(label, 0);
    for (const candidate of candidates) {
      const applied = parseDate(candidate.appliedDate);
      if (applied && applied >= start && applied < end) {
        weekBuckets.set(label, (weekBuckets.get(label) ?? 0) + 1);
      }
    }
  }

  const hiringVelocityTrends: ChartBar[] = [...weekBuckets.entries()].map(([label, value]) => ({
    label,
    value,
  }));

  return {
    topProblemCities: cityProblems,
    hardestToFillTerritories,
    candidateShortagesByState,
    hiringVelocityTrends,
  };
}
