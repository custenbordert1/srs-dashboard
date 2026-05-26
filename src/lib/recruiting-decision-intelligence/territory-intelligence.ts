import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import { cityKey, candidatesForJob, parseDate } from "@/lib/dm-dashboard/territory-shared";
import type { RecruiterEscalationQueueItem } from "@/lib/operational-escalation/operational-escalation-types";
import type {
  TerritoryIntelligenceSnapshot,
  TerritoryMarketRow,
} from "@/lib/recruiting-decision-intelligence/types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function buildCityRows(
  jobs: BreezyJob[],
  candidates: BreezyCandidate[],
  escalations: RecruiterEscalationQueueItem[],
  reference: Date,
): TerritoryMarketRow[] {
  const since7d = new Date(reference.getTime() - 7 * MS_PER_DAY);
  const byCity = new Map<string, TerritoryMarketRow>();

  for (const job of jobs) {
    const key = cityKey(job.city, job.state);
    const row =
      byCity.get(key) ??
      ({
        label: `${job.city}, ${job.state}`,
        city: job.city,
        state: job.state,
        score: 0,
        openJobs: 0,
        applicants7d: 0,
        escalationCount: 0,
      } satisfies TerritoryMarketRow);
    row.openJobs += 1;
    const jobCandidates = candidatesForJob(job, candidates);
    row.applicants7d += jobCandidates.filter((c) => {
      const applied = parseDate(c.appliedDate);
      return applied !== null && applied >= since7d;
    }).length;
    byCity.set(key, row);
  }

  for (const escalation of escalations) {
    const key = cityKey(escalation.city, escalation.state);
    const row = byCity.get(key);
    if (!row) continue;
    row.escalationCount += 1;
    row.score += (escalation.priorityScore ?? 0) + 10;
  }

  for (const row of byCity.values()) {
    row.score += row.openJobs * 5 - row.applicants7d * 2 + row.escalationCount * 15;
  }

  return [...byCity.values()];
}

function conversionByState(jobs: BreezyJob[], candidates: BreezyCandidate[]): Map<string, number> {
  const totals = new Map<string, { applicants: number; hires: number }>();
  for (const job of jobs) {
    const state = job.state.trim().toUpperCase();
    const bucket = totals.get(state) ?? { applicants: 0, hires: 0 };
    const jobCandidates = candidatesForJob(job, candidates);
    bucket.applicants += jobCandidates.length;
    bucket.hires += jobCandidates.filter((c) => c.stage.toLowerCase().includes("hired")).length;
    totals.set(state, bucket);
  }
  const rates = new Map<string, number>();
  for (const [state, bucket] of totals) {
    rates.set(state, bucket.applicants > 0 ? bucket.hires / bucket.applicants : 0);
  }
  return rates;
}

export function buildTerritoryIntelligenceSnapshot(input: {
  territoryLabel: string;
  territoryStates: string[];
  jobs: BreezyJob[];
  candidates: BreezyCandidate[];
  escalations: RecruiterEscalationQueueItem[];
  referenceIso: string;
}): TerritoryIntelligenceSnapshot {
  const reference = new Date(input.referenceIso);
  const cityRows = buildCityRows(input.jobs, input.candidates, input.escalations, reference);

  const strongestMarkets = [...cityRows]
    .sort((a, b) => b.applicants7d - a.applicants7d)
    .slice(0, 5);
  const weakestMarkets = [...cityRows]
    .sort((a, b) => a.applicants7d - b.applicants7d || b.openJobs - a.openJobs)
    .slice(0, 5);
  const fastestGrowingMarkets = [...cityRows]
    .sort((a, b) => b.applicants7d - a.applicants7d)
    .slice(0, 5);
  const highestEscalationZones = [...cityRows]
    .filter((row) => row.escalationCount > 0)
    .sort((a, b) => b.escalationCount - a.escalationCount)
    .slice(0, 5);

  const stateConversion = conversionByState(input.jobs, input.candidates);
  let bestConversionTerritory: string | null = null;
  let bestRate = -1;
  let highestRiskTerritory: string | null = null;
  let highestRisk = -1;
  for (const [state, rate] of stateConversion) {
    if (rate > bestRate) {
      bestRate = rate;
      bestConversionTerritory = state;
    }
    const risk = 1 - rate;
    if (risk > highestRisk) {
      highestRisk = risk;
      highestRiskTerritory = state;
    }
  }

  const staffingPressureScore = Math.min(
    100,
    Math.round(
      cityRows.reduce((sum, row) => sum + row.score, 0) / Math.max(1, cityRows.length),
    ),
  );

  const topRiskCities = [...cityRows].sort((a, b) => b.score - a.score).slice(0, 6);
  const topOpportunityCities = [...cityRows]
    .sort((a, b) => b.applicants7d - a.applicants7d || a.openJobs - b.openJobs)
    .slice(0, 6);

  return {
    territoryLabel: input.territoryLabel,
    territoryStates: input.territoryStates,
    staffingPressureScore,
    strongestMarkets,
    weakestMarkets,
    fastestGrowingMarkets,
    highestEscalationZones,
    bestConversionTerritory,
    highestRiskTerritory,
    topRiskCities,
    topOpportunityCities,
  };
}
