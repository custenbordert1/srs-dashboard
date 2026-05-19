import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import { DISTRICT_MANAGERS, getAssignedStatesForDm, normalizeStateCode } from "@/lib/dm-territory-map";
import { buildTerritoryHealthScore } from "@/lib/dm-dashboard/territory-health-score";
import { countBuckets, parseDate, MS_PER_DAY } from "@/lib/dm-dashboard/territory-shared";
import { buildTerritoryFillRiskAlerts } from "@/lib/dm-dashboard/fill-risk-alerts";
import type { ChartBar } from "@/lib/recruiting-intelligence";

export type DailyExecutiveSnapshot = {
  generatedAt: string;
  totalApplicants: number;
  applicantsLast7Days: number;
  hottestTerritories: ChartBar[];
  highestRiskTerritories: ChartBar[];
  bestRecruitingSources: ChartBar[];
  projectedFillRisks: Array<{ title: string; detail: string; severity: "critical" | "warning" }>;
  summaryBullets: string[];
};

export function buildDailyExecutiveSnapshot(
  jobs: BreezyJob[],
  candidates: BreezyCandidate[],
  fetchedAt: string,
): DailyExecutiveSnapshot {
  const reference = new Date(fetchedAt);
  const since7d = new Date(reference.getTime() - 7 * MS_PER_DAY);
  const applicantsLast7Days = candidates.filter((c) => {
    const applied = parseDate(c.appliedDate);
    return applied !== null && applied >= since7d;
  }).length;

  const territoryHeat: ChartBar[] = DISTRICT_MANAGERS.map((dmName) => {
    const states = new Set(getAssignedStatesForDm(dmName));
    const dmCandidates = candidates.filter((c) => states.has(normalizeStateCode(c.state)));
    const recent = dmCandidates.filter((c) => {
      const applied = parseDate(c.appliedDate);
      return applied !== null && applied >= since7d;
    }).length;
    return { label: dmName, value: recent };
  }).sort((a, b) => b.value - a.value);

  const territoryRisk: ChartBar[] = DISTRICT_MANAGERS.map((dmName) => {
    const states = new Set(getAssignedStatesForDm(dmName));
    const dmJobs = jobs.filter((j) => states.has(normalizeStateCode(j.state)));
    const dmCandidates = candidates.filter((c) => states.has(normalizeStateCode(c.state)));
    const health = buildTerritoryHealthScore(dmJobs, dmCandidates, fetchedAt);
    return { label: dmName, value: 100 - health.score };
  }).sort((a, b) => b.value - a.value);

  const fillAlerts = buildTerritoryFillRiskAlerts(jobs, candidates, fetchedAt);
  const projectedFillRisks = fillAlerts.slice(0, 8).map((item) => ({
    title: item.title,
    detail: item.detail,
    severity: item.severity,
  }));

  const bestRecruitingSources = countBuckets(
    candidates.map((c) => ({ label: c.source.trim() || "Unknown" })),
    (r) => r.label,
    6,
  );

  const summaryBullets = [
    `${candidates.length.toLocaleString()} total applicants in sync · ${applicantsLast7Days.toLocaleString()} in the last 7 days.`,
    `Hottest territory: ${territoryHeat[0]?.label ?? "—"} (${territoryHeat[0]?.value ?? 0} recent applicants).`,
    `Highest risk: ${territoryRisk[0]?.label ?? "—"} (risk index ${territoryRisk[0]?.value ?? 0}).`,
    `${projectedFillRisks.length} projected fill-risk signals require review today.`,
  ];

  return {
    generatedAt: fetchedAt,
    totalApplicants: candidates.length,
    applicantsLast7Days,
    hottestTerritories: territoryHeat.slice(0, 5),
    highestRiskTerritories: territoryRisk.slice(0, 5),
    bestRecruitingSources,
    projectedFillRisks,
    summaryBullets,
  };
}
