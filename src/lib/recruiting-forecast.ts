import type { BreezyCandidate } from "@/lib/breezy-api";
import { buildCandidateIntelligence } from "@/lib/candidate-intelligence";
import type { SheetRow } from "@/lib/google-sheet-csv";
import {
  buildMarketKey,
  resolveMarketIdentity,
} from "@/lib/market-identity";
import type { MelProjectRow } from "@/lib/mel-projects-sheet";
import {
  isCompletedStoreCallStatus,
  resolveMelProjectColumnKeys,
} from "@/lib/mel-projects-metrics";
import {
  calendarAgeDays,
  parseApplicantCount,
  parseCreatedDate,
} from "@/lib/post-automation";
import type { ChartBar } from "@/lib/recruiting-intelligence";
import type { Kpi } from "@/lib/recruiting-sample-data";
import { isOpenPostStatus, resolveKpiSheetColumnKeys } from "@/lib/sheet-kpi-metrics";
import { computeMarketIntelligence, type CityMarketRow } from "@/lib/market-intelligence";

export type ForecastHorizonDays = 7 | 14 | 30;

export type ForecastUrgency =
  | "Stable"
  | "Watch"
  | "Elevated"
  | "High Risk"
  | "Critical Forecast";

export type ForecastRecommendation =
  | "Increase posting now"
  | "Open backup market"
  | "Expand radius early"
  | "Push opportunities now"
  | "Escalate before deadline";

export type ForecastMarketRow = {
  market: string;
  city: string;
  state: string;
  dm: string;
  horizonDays: ForecastHorizonDays;
  forecastRiskScore: number;
  urgency: ForecastUrgency;
  openStoreCalls: number;
  completionPercent: number | null;
  applicantVelocity: number;
  candidateConversionPercent: number;
  activeReps: number;
  nearestDeadlineDays: number | null;
  historicalDemandScore: number;
  zeroApplicantTrend: number;
  projectedDemand: number;
  projectedApplicants: number;
  projectedRepCoverage: number;
  projectedRepShortage: number;
  projectedApplicantShortage: number;
  recommendations: ForecastRecommendation[];
};

export type ForecastProjectRiskRow = {
  projectNo: string;
  projectName: string;
  market: string;
  dm: string;
  nearestDeadlineDays: number | null;
  completionPercent: number | null;
  openStoreCalls: number;
  activeReps: number;
  forecastRiskScore: number;
  urgency: ForecastUrgency;
  recommendations: ForecastRecommendation[];
};

export type RecruitingForecastSnapshot = {
  kpis: Kpi[];
  forecast7Day: ForecastMarketRow[];
  forecast14Day: ForecastMarketRow[];
  forecast30Day: ForecastMarketRow[];
  marketsLikelyToFailStaffing: ForecastMarketRow[];
  projectsAtRisk: ForecastProjectRiskRow[];
  futureCriticalRecruitingMarkets: ForecastMarketRow[];
  projectedRepShortages: ForecastMarketRow[];
  projectedApplicantShortages: ForecastMarketRow[];
  marketsTrendingWorse: ForecastMarketRow[];
  demandTrendForecast: ChartBar[];
  applicantTrendForecast: ChartBar[];
  repCoverageTrend: ChartBar[];
  staffingRiskTrend: ChartBar[];
  columnHint: string;
};

const HORIZONS: ForecastHorizonDays[] = [7, 14, 30];
const TABLE_LIMIT = 25;
const END_DATE_ALIASES = ["end date", "due date", "project end", "deadline"];
const MEL_CITY_ALIASES = ["city", "location city", "store city"];
const INTERVIEW_STAGE_WORDS = ["interview", "onsite", "phone screen", "screen", "assessment"];
const OFFER_STAGE_WORDS = ["offer"];
const HIRE_STAGE_WORDS = ["hired"];

type MarketSignals = {
  nearestDeadlineDays: number | null;
  zeroApplicantTrend: number;
  applicantVelocity: number;
  candidateConversionPercent: number;
};

type ProjectAgg = {
  projectNo: string;
  projectName: string;
  market: string;
  dm: string;
  openStoreCalls: number;
  totalCalls: number;
  completedCalls: number;
  activeReps: Set<string>;
  deadlineDays: number[];
};

function normHeader(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function pickColumn(headers: string[], aliases: string[]): string | undefined {
  const set = new Map<string, string>();
  for (const h of headers) {
    set.set(normHeader(h), h);
  }
  for (const alias of aliases) {
    const direct = set.get(normHeader(alias));
    if (direct) return direct;
  }
  for (const h of headers) {
    const n = normHeader(h);
    for (const alias of aliases) {
      const a = normHeader(alias);
      if (n === a || n.includes(a) || a.includes(n)) return h;
    }
  }
  return undefined;
}

function cell(row: SheetRow | MelProjectRow, key: string | undefined): string {
  if (!key) return "";
  return (row[key] ?? "").trim();
}

function daysUntil(date: Date, from = new Date()): number {
  const start = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const end = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((end - start) / (24 * 60 * 60 * 1000));
}

function minNullable(values: number[]): number | null {
  return values.length > 0 ? Math.min(...values) : null;
}

function includesAny(value: string, words: string[]): boolean {
  const normalized = value.toLowerCase();
  return words.some((word) => normalized.includes(word));
}

function isConversionStage(status: string): boolean {
  return includesAny(status, [...INTERVIEW_STAGE_WORDS, ...OFFER_STAGE_WORDS, ...HIRE_STAGE_WORDS]);
}

function urgencyForScore(score: number): ForecastUrgency {
  if (score >= 80) return "Critical Forecast";
  if (score >= 65) return "High Risk";
  if (score >= 45) return "Elevated";
  if (score >= 25) return "Watch";
  return "Stable";
}

function isAssignedRep(staffName: string): boolean {
  const name = staffName.trim().toLowerCase();
  return Boolean(name && name !== "open" && name !== "—");
}

function deadlinePressure(deadlineDays: number | null, horizonDays: ForecastHorizonDays): number {
  if (deadlineDays === null) return 0;
  if (deadlineDays < 0) return 100;
  if (deadlineDays <= Math.max(3, Math.floor(horizonDays / 2))) return 85;
  if (deadlineDays <= horizonDays) return 70;
  if (deadlineDays <= horizonDays * 2) return 35;
  return 0;
}

function completionDrag(completionPercent: number | null): number {
  if (completionPercent === null) return 18;
  return Math.max(0, 100 - completionPercent);
}

function computeForecastRiskScore(input: {
  historicalDemandScore: number;
  projectedDemand: number;
  projectedRepShortage: number;
  projectedApplicantShortage: number;
  completionPercent: number | null;
  nearestDeadlineDays: number | null;
  horizonDays: ForecastHorizonDays;
  zeroApplicantTrend: number;
  candidateConversionPercent: number;
}): number {
  const demandScore = Math.min(100, input.projectedDemand * 8);
  const repShortageScore =
    input.projectedDemand > 0
      ? Math.min(100, (input.projectedRepShortage / Math.max(input.projectedDemand, 1)) * 100)
      : 0;
  const applicantShortageScore =
    input.projectedDemand > 0
      ? Math.min(100, (input.projectedApplicantShortage / Math.max(input.projectedDemand * 2, 1)) * 100)
      : 0;
  const conversionDrag = Math.max(0, 25 - input.candidateConversionPercent) * 2;
  const zeroApplicantScore = Math.min(100, input.zeroApplicantTrend * 25);

  const score =
    input.historicalDemandScore * 0.22 +
    demandScore * 0.12 +
    repShortageScore * 0.22 +
    applicantShortageScore * 0.18 +
    completionDrag(input.completionPercent) * 0.1 +
    deadlinePressure(input.nearestDeadlineDays, input.horizonDays) * 0.1 +
    zeroApplicantScore * 0.04 +
    conversionDrag * 0.02;

  return Math.min(100, Math.round(score));
}

function recommendationEngine(row: Omit<ForecastMarketRow, "recommendations">): ForecastRecommendation[] {
  const recs = new Set<ForecastRecommendation>();

  if (row.projectedApplicantShortage > 0 && row.openStoreCalls > 0) {
    recs.add("Increase posting now");
  }

  if (row.forecastRiskScore >= 65 && row.projectedRepShortage > 0) {
    recs.add("Open backup market");
  }

  if (
    row.projectedApplicantShortage > 0 &&
    row.nearestDeadlineDays !== null &&
    row.nearestDeadlineDays <= row.horizonDays * 2
  ) {
    recs.add("Expand radius early");
  }

  if (row.projectedApplicants > 0 && row.candidateConversionPercent >= 15 && row.projectedRepShortage > 0) {
    recs.add("Push opportunities now");
  }

  if (
    row.forecastRiskScore >= 80 ||
    (row.nearestDeadlineDays !== null && row.nearestDeadlineDays <= row.horizonDays && row.openStoreCalls > 0)
  ) {
    recs.add("Escalate before deadline");
  }

  return [...recs];
}

function chartAverage(rows: ForecastMarketRow[], label: string, pick: (row: ForecastMarketRow) => number): ChartBar {
  const value = rows.length > 0 ? Math.round(rows.reduce((sum, row) => sum + pick(row), 0) / rows.length) : 0;
  return { label, value };
}

function buildCandidateSignals(candidates: BreezyCandidate[]): Map<string, { velocity: number; conversion: number }> {
  const snapshot = buildCandidateIntelligence(candidates);
  const byMarket = new Map<string, { total: number; recent: number; converted: number }>();

  for (const row of snapshot.rows) {
    const key = row.state === "—" ? "" : buildMarketKey(row.city, row.state);
    if (!key) continue;
    const agg = byMarket.get(key) ?? { total: 0, recent: 0, converted: 0 };
    agg.total += 1;
    if (row.ageDays !== null && row.ageDays <= 7) agg.recent += 1;
    if (isConversionStage(row.status)) agg.converted += 1;
    byMarket.set(key, agg);
  }

  const signals = new Map<string, { velocity: number; conversion: number }>();
  for (const [key, agg] of byMarket.entries()) {
    signals.set(key, {
      velocity: Math.round((agg.recent / 7) * 100) / 100,
      conversion: agg.total > 0 ? Math.round((agg.converted / agg.total) * 1000) / 10 : 0,
    });
  }

  return signals;
}

function buildMarketSignals(input: {
  recruitingRows: SheetRow[];
  recruitingHeaders: string[];
  melRows: MelProjectRow[];
  melHeaders: string[];
  candidates: BreezyCandidate[];
}): { signals: Map<string, MarketSignals>; projects: ProjectAgg[]; hints: string[] } {
  const recKeys = resolveKpiSheetColumnKeys(input.recruitingHeaders);
  const melKeys = resolveMelProjectColumnKeys(input.melHeaders);
  const melCityKey = pickColumn(input.melHeaders, MEL_CITY_ALIASES);
  const endDateKey = pickColumn(input.melHeaders, END_DATE_ALIASES);
  const candidateSignals = buildCandidateSignals(input.candidates);
  const deadlineByMarket = new Map<string, number[]>();
  const zeroApplicantByMarket = new Map<string, number>();
  const projectsByKey = new Map<string, ProjectAgg>();
  const hints: string[] = [];

  if (!melCityKey) hints.push("MEL City column not found (using location name)");
  if (!endDateKey) hints.push("MEL deadline column not found");
  if (!recKeys.createdDate) hints.push("Recruiting Created Date column not found");

  if (melKeys.status && melKeys.state) {
    for (const row of input.melRows) {
      const identity = resolveMarketIdentity({
        city: cell(row, melCityKey) || cell(row, melKeys.storeName),
        state: cell(row, melKeys.state),
        manager: cell(row, melKeys.manager),
        source: "mel",
      });
      if (!identity.key) continue;

      const deadline = parseCreatedDate(cell(row, endDateKey));
      if (deadline) {
        const days = daysUntil(deadline);
        const marketDeadlines = deadlineByMarket.get(identity.key) ?? [];
        marketDeadlines.push(days);
        deadlineByMarket.set(identity.key, marketDeadlines);
      }

      const completed = isCompletedStoreCallStatus(cell(row, melKeys.status));
      const projectNo = cell(row, melKeys.projectNo) || "Unknown project";
      const projectName = cell(row, melKeys.projectName) || "Untitled project";
      const projectKey = `${projectNo}|${projectName}|${identity.key}`;
      const project = projectsByKey.get(projectKey) ?? {
        projectNo,
        projectName,
        market: identity.marketName,
        dm: identity.dm,
        openStoreCalls: 0,
        totalCalls: 0,
        completedCalls: 0,
        activeReps: new Set<string>(),
        deadlineDays: [],
      };
      project.totalCalls += 1;
      if (deadline) project.deadlineDays.push(daysUntil(deadline));
      if (completed) {
        project.completedCalls += 1;
      } else {
        project.openStoreCalls += 1;
        const staffName = cell(row, melKeys.staffName);
        const repKey = cell(row, melKeys.staffNumber) || staffName;
        if (isAssignedRep(staffName)) project.activeReps.add(repKey);
      }
      projectsByKey.set(projectKey, project);
    }
  }

  if (recKeys.status && recKeys.applicantCount && recKeys.city && recKeys.state) {
    for (const row of input.recruitingRows) {
      if (!isOpenPostStatus(cell(row, recKeys.status))) continue;
      const identity = resolveMarketIdentity({
        city: cell(row, recKeys.city),
        state: cell(row, recKeys.state),
        manager: cell(row, recKeys.manager),
        source: "recruiting",
      });
      if (!identity.key) continue;
      const applicants = parseApplicantCount(cell(row, recKeys.applicantCount));
      if (applicants > 0) continue;
      const created = parseCreatedDate(cell(row, recKeys.createdDate));
      const age = created ? Math.max(0, calendarAgeDays(created)) : 7;
      zeroApplicantByMarket.set(identity.key, (zeroApplicantByMarket.get(identity.key) ?? 0) + Math.max(1, age / 7));
    }
  }

  const allKeys = new Set([...deadlineByMarket.keys(), ...zeroApplicantByMarket.keys(), ...candidateSignals.keys()]);
  const signals = new Map<string, MarketSignals>();
  for (const key of allKeys) {
    const candidate = candidateSignals.get(key);
    signals.set(key, {
      nearestDeadlineDays: minNullable(deadlineByMarket.get(key) ?? []),
      zeroApplicantTrend: Math.round((zeroApplicantByMarket.get(key) ?? 0) * 10) / 10,
      applicantVelocity: candidate?.velocity ?? 0,
      candidateConversionPercent: candidate?.conversion ?? 0,
    });
  }

  return { signals, projects: [...projectsByKey.values()], hints };
}

function forecastMarket(row: CityMarketRow, signal: MarketSignals, horizonDays: ForecastHorizonDays): ForecastMarketRow {
  const velocityApplicants = signal.applicantVelocity * horizonDays;
  const projectedApplicants = Math.round((row.applicants + velocityApplicants) * 10) / 10;
  const deadlineBoost =
    signal.nearestDeadlineDays !== null && signal.nearestDeadlineDays <= horizonDays
      ? Math.max(1, Math.ceil(row.openStoreCalls * 0.15))
      : 0;
  const incompleteWork = row.completionPercent === null ? 0.2 : Math.max(0, (100 - row.completionPercent) / 100);
  const projectedDemand = Math.max(
    0,
    Math.round((row.openStoreCalls + deadlineBoost + row.openStoreCalls * incompleteWork * (horizonDays / 30)) * 10) /
      10,
  );
  const expectedCandidateReps = Math.floor(
    (projectedApplicants * Math.max(signal.candidateConversionPercent, 5)) / 100,
  );
  const projectedRepCoverage = row.activeReps + expectedCandidateReps;
  const projectedRepShortage = Math.max(0, Math.ceil(projectedDemand - projectedRepCoverage));
  const desiredApplicantPool = Math.max(projectedDemand * 2, row.openRecruitingPosts);
  const projectedApplicantShortage = Math.max(0, Math.ceil(desiredApplicantPool - projectedApplicants));
  const baseRow = {
    market: row.label,
    city: row.city,
    state: row.stateCode,
    dm: row.manager,
    horizonDays,
    forecastRiskScore: 0,
    urgency: "Stable" as ForecastUrgency,
    openStoreCalls: row.openStoreCalls,
    completionPercent: row.completionPercent,
    applicantVelocity: signal.applicantVelocity,
    candidateConversionPercent: signal.candidateConversionPercent,
    activeReps: row.activeReps,
    nearestDeadlineDays: signal.nearestDeadlineDays,
    historicalDemandScore: row.marketRiskScore,
    zeroApplicantTrend: signal.zeroApplicantTrend,
    projectedDemand,
    projectedApplicants,
    projectedRepCoverage,
    projectedRepShortage,
    projectedApplicantShortage,
  };
  const forecastRiskScore = computeForecastRiskScore(baseRow);
  const withRisk = {
    ...baseRow,
    forecastRiskScore,
    urgency: urgencyForScore(forecastRiskScore),
  };
  return {
    ...withRisk,
    recommendations: recommendationEngine(withRisk),
  };
}

function buildProjectRiskRows(projects: ProjectAgg[], forecast30Day: ForecastMarketRow[]): ForecastProjectRiskRow[] {
  const forecastByMarket = new Map(forecast30Day.map((row) => [row.market, row]));

  return projects
    .map((project) => {
      const completionPercent =
        project.totalCalls > 0 ? Math.round((project.completedCalls / project.totalCalls) * 1000) / 10 : null;
      const forecast = forecastByMarket.get(project.market);
      const nearestDeadlineDays = minNullable(project.deadlineDays);
      const shortageScore =
        project.openStoreCalls > 0
          ? Math.min(100, (Math.max(0, project.openStoreCalls - project.activeReps.size) / project.openStoreCalls) * 100)
          : 0;
      const forecastRiskScore = Math.min(
        100,
        Math.round(
          (forecast?.forecastRiskScore ?? 0) * 0.45 +
            deadlinePressure(nearestDeadlineDays, 30) * 0.25 +
            completionDrag(completionPercent) * 0.15 +
            shortageScore * 0.15,
        ),
      );
      const urgency = urgencyForScore(forecastRiskScore);
      return {
        projectNo: project.projectNo,
        projectName: project.projectName,
        market: project.market,
        dm: project.dm,
        nearestDeadlineDays,
        completionPercent,
        openStoreCalls: project.openStoreCalls,
        activeReps: project.activeReps.size,
        forecastRiskScore,
        urgency,
        recommendations: forecast?.recommendations ?? [],
      };
    })
    .filter((row) => row.openStoreCalls > 0 && row.forecastRiskScore >= 45)
    .sort((a, b) => b.forecastRiskScore - a.forecastRiskScore || b.openStoreCalls - a.openStoreCalls)
    .slice(0, TABLE_LIMIT);
}

function forecastKpis(input: {
  forecast14Day: ForecastMarketRow[];
  forecast30Day: ForecastMarketRow[];
  projectsAtRisk: ForecastProjectRiskRow[];
}): Kpi[] {
  const critical = input.forecast30Day.filter((row) => row.urgency === "Critical Forecast").length;
  const repShortages = input.forecast30Day.filter((row) => row.projectedRepShortage > 0).length;
  const applicantGaps = input.forecast30Day.filter((row) => row.projectedApplicantShortage > 0).length;
  const worsening = input.forecast30Day.filter((row) => {
    const current = input.forecast14Day.find((f) => f.market === row.market);
    return current ? row.forecastRiskScore - current.forecastRiskScore >= 8 : false;
  }).length;

  return [
    {
      id: "forecasted-critical-markets",
      label: "Forecasted Critical Markets",
      value: critical.toLocaleString(),
      change: "30d",
      changeDirection: critical > 0 ? "down" : "flat",
      hint: "Markets projected to hit Critical Forecast within 30 days",
    },
    {
      id: "projects-at-risk",
      label: "Projects At Risk",
      value: input.projectsAtRisk.length.toLocaleString(),
      change: "Live",
      changeDirection: input.projectsAtRisk.length > 0 ? "down" : "flat",
      hint: "Projects forecasted to miss staffing or completion targets",
    },
    {
      id: "predicted-rep-shortages",
      label: "Predicted Rep Shortages",
      value: repShortages.toLocaleString(),
      change: "30d",
      changeDirection: repShortages > 0 ? "down" : "flat",
      hint: "Markets where projected demand exceeds rep coverage",
    },
    {
      id: "predicted-applicant-gaps",
      label: "Predicted Applicant Gaps",
      value: applicantGaps.toLocaleString(),
      change: "30d",
      changeDirection: applicantGaps > 0 ? "down" : "flat",
      hint: "Markets where applicant pool is projected below demand",
    },
    {
      id: "markets-trending-worse",
      label: "Markets Trending Worse",
      value: worsening.toLocaleString(),
      change: "14→30d",
      changeDirection: worsening > 0 ? "down" : "flat",
      hint: "Forecast risk score increases by 8+ points from 14 to 30 days",
    },
  ];
}

export function buildRecruitingForecast(input: {
  recruitingRows: SheetRow[];
  recruitingHeaders: string[];
  melRows: MelProjectRow[];
  melHeaders: string[];
  candidates: BreezyCandidate[];
}): RecruitingForecastSnapshot {
  const marketSnapshot = computeMarketIntelligence(
    input.recruitingRows,
    input.recruitingHeaders,
    input.melRows,
    input.melHeaders,
  );
  const { signals, projects, hints } = buildMarketSignals(input);
  const forecastByHorizon = new Map<ForecastHorizonDays, ForecastMarketRow[]>();

  for (const horizon of HORIZONS) {
    const rows = marketSnapshot.cities
      .filter((row) => row.openStoreCalls > 0 || row.openRecruitingPosts > 0 || row.applicants > 0)
      .map((row) => forecastMarket(row, signals.get(buildMarketKey(row.city, row.stateCode)) ?? {
        nearestDeadlineDays: null,
        zeroApplicantTrend: 0,
        applicantVelocity: 0,
        candidateConversionPercent: 0,
      }, horizon))
      .sort((a, b) => b.forecastRiskScore - a.forecastRiskScore || b.projectedRepShortage - a.projectedRepShortage);
    forecastByHorizon.set(horizon, rows);
  }

  const forecast7Day = forecastByHorizon.get(7) ?? [];
  const forecast14Day = forecastByHorizon.get(14) ?? [];
  const forecast30Day = forecastByHorizon.get(30) ?? [];
  const projectsAtRisk = buildProjectRiskRows(projects, forecast30Day);
  const marketsTrendingWorse = forecast30Day
    .filter((row) => {
      const current = forecast14Day.find((f) => f.market === row.market);
      return current ? row.forecastRiskScore - current.forecastRiskScore >= 8 : false;
    })
    .slice(0, TABLE_LIMIT);

  const labels = ["7d", "14d", "30d"];
  const trendRows = [forecast7Day, forecast14Day, forecast30Day];

  return {
    kpis: forecastKpis({ forecast14Day, forecast30Day, projectsAtRisk }),
    forecast7Day,
    forecast14Day,
    forecast30Day,
    marketsLikelyToFailStaffing: forecast30Day
      .filter((row) => row.forecastRiskScore >= 65 && (row.projectedRepShortage > 0 || row.projectedApplicantShortage > 0))
      .slice(0, TABLE_LIMIT),
    projectsAtRisk,
    futureCriticalRecruitingMarkets: forecast30Day
      .filter((row) => row.urgency === "Critical Forecast" || row.forecastRiskScore >= 80)
      .slice(0, TABLE_LIMIT),
    projectedRepShortages: forecast30Day.filter((row) => row.projectedRepShortage > 0).slice(0, TABLE_LIMIT),
    projectedApplicantShortages: forecast30Day
      .filter((row) => row.projectedApplicantShortage > 0)
      .slice(0, TABLE_LIMIT),
    marketsTrendingWorse,
    demandTrendForecast: trendRows.map((rows, index) =>
      chartAverage(rows, labels[index]!, (row) => row.projectedDemand),
    ),
    applicantTrendForecast: trendRows.map((rows, index) =>
      chartAverage(rows, labels[index]!, (row) => row.projectedApplicants),
    ),
    repCoverageTrend: trendRows.map((rows, index) =>
      chartAverage(rows, labels[index]!, (row) => row.projectedRepCoverage),
    ),
    staffingRiskTrend: trendRows.map((rows, index) =>
      chartAverage(rows, labels[index]!, (row) => row.forecastRiskScore),
    ),
    columnHint:
      hints.length > 0
        ? `Forecast joins normalized markets · ${hints.join(" · ")}`
        : "Forecast joins normalized market identity across recruiting, MEL, and Breezy candidates",
  };
}

export const FORECAST_URGENCY_BADGE_STYLES: Record<ForecastUrgency, string> = {
  Stable: "bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-500/30",
  Watch: "bg-sky-500/15 text-sky-200 ring-1 ring-sky-500/30",
  Elevated: "bg-yellow-500/15 text-yellow-200 ring-1 ring-yellow-500/30",
  "High Risk": "bg-orange-500/15 text-orange-200 ring-1 ring-orange-500/30",
  "Critical Forecast": "bg-red-500/15 text-red-200 ring-1 ring-red-500/30",
};
