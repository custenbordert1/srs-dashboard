import {
  DISTRICT_MANAGERS,
  getAssignedStatesForDm,
} from "@/lib/dm-territory-map";
import type { SheetRow } from "@/lib/google-sheet-csv";
import { resolveMarketIdentity } from "@/lib/market-identity";
import type { MelProjectRow } from "@/lib/mel-projects-sheet";
import { isCompletedStoreCallStatus, resolveMelProjectColumnKeys } from "@/lib/mel-projects-metrics";
import { computeMarketIntelligence } from "@/lib/market-intelligence";
import { parseApplicantCount } from "@/lib/post-automation";
import { isOpenPostStatus, resolveKpiSheetColumnKeys } from "@/lib/sheet-kpi-metrics";

export type DmScorecardRow = {
  rank: number;
  manager: string;
  assignedStates: string[];
  openPosts: number;
  zeroApplicantPosts: number;
  totalApplicants: number;
  melOpenStoreCalls: number;
  activeReps: number;
  demandScore: number;
  criticalMarketsCount: number;
};

function cell(row: SheetRow, key: string | undefined): string {
  if (!key) return "";
  return (row[key] ?? "").trim();
}

function isAssignedRep(staffName: string): boolean {
  const name = staffName.trim().toLowerCase();
  return Boolean(name && name !== "open" && name !== "—");
}

function blankRow(manager: string): Omit<DmScorecardRow, "rank"> {
  return {
    manager,
    assignedStates: getAssignedStatesForDm(manager),
    openPosts: 0,
    zeroApplicantPosts: 0,
    totalApplicants: 0,
    melOpenStoreCalls: 0,
    activeReps: 0,
    demandScore: 0,
    criticalMarketsCount: 0,
  };
}

export function buildDmScorecards(
  recruitingRows: SheetRow[],
  recruitingHeaders: string[],
  melRows: MelProjectRow[],
  melHeaders: string[],
): DmScorecardRow[] {
  const recKeys = resolveKpiSheetColumnKeys(recruitingHeaders);
  const melKeys = resolveMelProjectColumnKeys(melHeaders);
  const rowsByManager = new Map<string, Omit<DmScorecardRow, "rank">>();
  const activeRepKeysByManager = new Map<string, Set<string>>();

  for (const manager of DISTRICT_MANAGERS) {
    rowsByManager.set(manager, blankRow(manager));
    activeRepKeysByManager.set(manager, new Set<string>());
  }

  if (recKeys.status && recKeys.applicantCount && recKeys.state) {
    for (const row of recruitingRows) {
      if (!isOpenPostStatus(cell(row, recKeys.status))) continue;

      const state = cell(row, recKeys.state);
      const manager = resolveMarketIdentity({
        city: cell(row, recKeys.city),
        state,
        manager: cell(row, recKeys.manager),
        source: "recruiting",
      }).dm;
      const scorecard = rowsByManager.get(manager) ?? blankRow(manager);
      const applicants = parseApplicantCount(cell(row, recKeys.applicantCount));

      scorecard.openPosts += 1;
      scorecard.totalApplicants += applicants;
      if (applicants === 0) scorecard.zeroApplicantPosts += 1;
      rowsByManager.set(manager, scorecard);
    }
  }

  if (melKeys.status && melKeys.state) {
    for (const row of melRows) {
      if (isCompletedStoreCallStatus(cell(row, melKeys.status))) continue;

      const state = cell(row, melKeys.state);
      const manager = resolveMarketIdentity({
        city: cell(row, "City"),
        state,
        manager: cell(row, melKeys.manager),
        source: "mel",
      }).dm;
      const scorecard = rowsByManager.get(manager) ?? blankRow(manager);
      const staffName = cell(row, melKeys.staffName);
      const staffNumber = cell(row, melKeys.staffNumber);

      scorecard.melOpenStoreCalls += 1;

      if (isAssignedRep(staffName)) {
        const activeReps = activeRepKeysByManager.get(manager) ?? new Set<string>();
        activeReps.add(staffNumber || staffName);
        activeRepKeysByManager.set(manager, activeReps);
        scorecard.activeReps = activeReps.size;
      }

      rowsByManager.set(manager, scorecard);
    }
  }

  const marketSnapshot = computeMarketIntelligence(
    recruitingRows,
    recruitingHeaders,
    melRows,
    melHeaders,
  );

  for (const scorecard of rowsByManager.values()) {
    const markets = marketSnapshot.cities.filter((city) => city.manager === scorecard.manager);
    scorecard.criticalMarketsCount = markets.filter((city) => city.urgency === "Critical").length;

    const weighted = markets.reduce(
      (acc, city) => {
        const weight = Math.max(1, city.openStoreCalls + city.openRecruitingPosts);
        return {
          score: acc.score + city.marketRiskScore * weight,
          weight: acc.weight + weight,
        };
      },
      { score: 0, weight: 0 },
    );

    scorecard.demandScore = weighted.weight > 0 ? Math.round(weighted.score / weighted.weight) : 0;
  }

  return [...rowsByManager.values()]
    .sort(
      (a, b) =>
        b.demandScore - a.demandScore ||
        b.criticalMarketsCount - a.criticalMarketsCount ||
        b.melOpenStoreCalls - a.melOpenStoreCalls ||
        b.openPosts - a.openPosts,
    )
    .map((row, index) => ({ ...row, rank: index + 1 }));
}
