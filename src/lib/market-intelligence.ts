import type { SheetRow } from "@/lib/google-sheet-csv";
import type { MelProjectRow } from "@/lib/mel-projects-sheet";
import {
  isCompletedStoreCallStatus,
  resolveMelProjectColumnKeys,
} from "@/lib/mel-projects-metrics";
import { parseApplicantCount } from "@/lib/post-automation";
import { isOpenPostStatus, resolveKpiSheetColumnKeys } from "@/lib/sheet-kpi-metrics";
import { isRuralState } from "@/lib/recruiting-intelligence";
import type { ChartBar } from "@/lib/recruiting-intelligence";

export type MarketUrgency = "Critical" | "High" | "Moderate" | "Stable";

export type MarketRecommendation =
  | "Increase posts"
  | "Expand radius"
  | "Increase pay"
  | "Reassign reps"
  | "Escalate recruiting";

export type ComparisonBar = {
  label: string;
  primary: number;
  secondary: number;
};

export type CityMarketRow = {
  city: string;
  stateCode: string;
  label: string;
  manager: string;
  marketRiskScore: number;
  urgency: MarketUrgency;
  openStoreCalls: number;
  activeReps: number;
  openRecruitingPosts: number;
  applicants: number;
  applicantsPerStoreCall: number | null;
  completionPercent: number | null;
  nearbyRepCoverageEstimate: number;
  staffingPressure: number;
  isRural: boolean;
  recommendations: MarketRecommendation[];
};

export type MarketIntelligenceSnapshot = {
  cities: CityMarketRow[];
  citiesNeedingRecruiting: CityMarketRow[];
  zeroApplicantCities: CityMarketRow[];
  highestStaffingPressure: CityMarketRow[];
  ruralLowCoverage: CityMarketRow[];
  storeCallsVsApplicants: ComparisonBar[];
  repCoverageVsDemand: ComparisonBar[];
  topCriticalMarkets: ChartBar[];
  columnHint: string;
};

const MEL_CITY_ALIASES = ["city", "location city", "store city"];
const TABLE_LIMIT = 25;
const CHART_CITY_LIMIT = 12;
const CRITICAL_CHART_LIMIT = 15;

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

function cell(row: SheetRow, key: string | undefined): string {
  if (!key) return "";
  return (row[key] ?? "").trim();
}

function normalizeStateKey(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const upper = trimmed.toUpperCase();
  if (upper.length === 2) return upper;
  const stateNames: Record<string, string> = {
    ALABAMA: "AL",
    ALASKA: "AK",
    ARIZONA: "AZ",
    ARKANSAS: "AR",
    CALIFORNIA: "CA",
    COLORADO: "CO",
    CONNECTICUT: "CT",
    DELAWARE: "DE",
    FLORIDA: "FL",
    GEORGIA: "GA",
    HAWAII: "HI",
    IDAHO: "ID",
    ILLINOIS: "IL",
    INDIANA: "IN",
    IOWA: "IA",
    KANSAS: "KS",
    KENTUCKY: "KY",
    LOUISIANA: "LA",
    MAINE: "ME",
    MARYLAND: "MD",
    MASSACHUSETTS: "MA",
    MICHIGAN: "MI",
    MINNESOTA: "MN",
    MISSISSIPPI: "MS",
    MISSOURI: "MO",
    MONTANA: "MT",
    NEBRASKA: "NE",
    NEVADA: "NV",
    "NEW HAMPSHIRE": "NH",
    "NEW JERSEY": "NJ",
    "NEW MEXICO": "NM",
    "NEW YORK": "NY",
    "NORTH CAROLINA": "NC",
    "NORTH DAKOTA": "ND",
    OHIO: "OH",
    OKLAHOMA: "OK",
    OREGON: "OR",
    PENNSYLVANIA: "PA",
    "RHODE ISLAND": "RI",
    "SOUTH CAROLINA": "SC",
    "SOUTH DAKOTA": "SD",
    TENNESSEE: "TN",
    TEXAS: "TX",
    UTAH: "UT",
    VERMONT: "VT",
    VIRGINIA: "VA",
    WASHINGTON: "WA",
    "WEST VIRGINIA": "WV",
    WISCONSIN: "WI",
    WYOMING: "WY",
  };
  return stateNames[upper] ?? upper.slice(0, 2);
}

function normalizeCity(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toLowerCase();
}

function cityStateKey(city: string, stateCode: string): string {
  const c = normalizeCity(city);
  const s = normalizeStateKey(stateCode);
  if (!c || !s) return "";
  return `${c}|${s}`;
}

function formatCityLabel(city: string, stateCode: string): string {
  const title = city
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
  return `${title}, ${stateCode}`;
}

function isAssignedRep(staffName: string): boolean {
  const name = staffName.trim().toLowerCase();
  return Boolean(name && name !== "open" && name !== "—");
}

function incrementCount(map: Map<string, number>, key: string) {
  const normalized = key.trim() || "Unassigned";
  map.set(normalized, (map.get(normalized) ?? 0) + 1);
}

function primaryManager(...maps: Array<Map<string, number> | undefined>): string {
  const merged = new Map<string, number>();

  for (const map of maps) {
    if (!map) continue;
    for (const [manager, count] of map.entries()) {
      merged.set(manager, (merged.get(manager) ?? 0) + count);
    }
  }

  return (
    [...merged.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ??
    "Unassigned"
  );
}

export function computeMarketUrgency(score: number): MarketUrgency {
  if (score >= 75) return "Critical";
  if (score >= 55) return "High";
  if (score >= 35) return "Moderate";
  return "Stable";
}

function computeMarketRiskScore(input: {
  openStoreCalls: number;
  activeReps: number;
  completionPercent: number | null;
  applicants: number;
  openRecruitingPosts: number;
  applicantsPerStoreCall: number | null;
  nearbyRepCoverageEstimate: number;
  staffingPressure: number;
}): number {
  let score = 0;

  score += Math.min(22, input.openStoreCalls * 0.45);

  score += Math.min(18, input.staffingPressure * 3.2);

  if (input.completionPercent !== null) {
    score += Math.min(14, (100 - input.completionPercent) * 0.14);
  }

  if (input.applicantsPerStoreCall !== null) {
    if (input.applicantsPerStoreCall === 0) score += 16;
    else if (input.applicantsPerStoreCall < 0.5) score += 12;
    else if (input.applicantsPerStoreCall < 1) score += 6;
  } else if (input.openStoreCalls > 0) {
    score += 14;
  }

  score += Math.min(12, Math.max(0, 100 - input.nearbyRepCoverageEstimate) * 0.12);

  if (input.openRecruitingPosts > 0 && input.applicants === 0) score += 10;

  return Math.min(100, Math.round(score));
}

function buildRecommendations(input: {
  urgency: MarketUrgency;
  openStoreCalls: number;
  activeReps: number;
  openRecruitingPosts: number;
  applicants: number;
  applicantsPerStoreCall: number | null;
  staffingPressure: number;
  nearbyRepCoverageEstimate: number;
  isRural: boolean;
}): MarketRecommendation[] {
  const recs = new Set<MarketRecommendation>();

  if (
    input.openRecruitingPosts > 0 &&
    (input.applicants === 0 || (input.applicantsPerStoreCall ?? 0) < 1)
  ) {
    recs.add("Increase posts");
  }

  if (
    input.openStoreCalls >= 3 &&
    (input.applicantsPerStoreCall === null || input.applicantsPerStoreCall < 0.5)
  ) {
    recs.add("Expand radius");
  }

  if (input.isRural && (input.urgency === "Critical" || input.urgency === "High")) {
    recs.add("Increase pay");
  }

  if (input.staffingPressure > 3.5 && input.activeReps < input.openStoreCalls) {
    recs.add("Reassign reps");
  }

  if (input.urgency === "Critical" || (input.openStoreCalls >= 5 && input.applicants === 0)) {
    recs.add("Escalate recruiting");
  }

  return [...recs];
}

type MelCityAgg = {
  city: string;
  stateCode: string;
  managerCounts: Map<string, number>;
  openStoreCalls: number;
  totalCalls: number;
  completedCalls: number;
  activeReps: Set<string>;
};

type RecruitingCityAgg = {
  city: string;
  stateCode: string;
  managerCounts: Map<string, number>;
  openRecruitingPosts: number;
  applicants: number;
};

type StateRepPool = Set<string>;

export function computeMarketIntelligence(
  recruitingRows: SheetRow[],
  recruitingHeaders: string[],
  melRows: MelProjectRow[],
  melHeaders: string[],
): MarketIntelligenceSnapshot {
  const recKeys = resolveKpiSheetColumnKeys(recruitingHeaders);
  const melKeys = resolveMelProjectColumnKeys(melHeaders);
  const melCityKey = pickColumn(melHeaders, MEL_CITY_ALIASES);

  const melByCity = new Map<string, MelCityAgg>();
  const recruitingByCity = new Map<string, RecruitingCityAgg>();
  const stateRepPools = new Map<string, StateRepPool>();

  if (melKeys.storeCall && melKeys.status && melKeys.state) {
    for (const row of melRows) {
      const cityRaw = melCityKey ? cell(row, melCityKey) : cell(row, melKeys.storeName);
      const stateCode = normalizeStateKey(cell(row, melKeys.state));
      const key = cityStateKey(cityRaw, stateCode);
      if (!key) continue;

      const completed = isCompletedStoreCallStatus(cell(row, melKeys.status));
      const agg = melByCity.get(key) ?? {
        city: cityRaw,
        stateCode,
        managerCounts: new Map<string, number>(),
        openStoreCalls: 0,
        totalCalls: 0,
        completedCalls: 0,
        activeReps: new Set<string>(),
      };
      agg.totalCalls += 1;
      incrementCount(agg.managerCounts, cell(row, melKeys.manager));

      const staffName = cell(row, melKeys.staffName);
      const staffNumber = cell(row, melKeys.staffNumber);
      const repKey = staffNumber || staffName;

      if (completed) {
        agg.completedCalls += 1;
      } else {
        agg.openStoreCalls += 1;
        if (isAssignedRep(staffName)) {
          agg.activeReps.add(repKey);
          const pool = stateRepPools.get(stateCode) ?? new Set<string>();
          pool.add(repKey);
          stateRepPools.set(stateCode, pool);
        }
      }
      melByCity.set(key, agg);
    }
  }

  if (recKeys.status && recKeys.applicantCount && recKeys.city && recKeys.state) {
    for (const row of recruitingRows) {
      if (!isOpenPostStatus(cell(row, recKeys.status))) continue;
      const cityRaw = cell(row, recKeys.city);
      const stateCode = normalizeStateKey(cell(row, recKeys.state));
      const key = cityStateKey(cityRaw, stateCode);
      if (!key) continue;

      const agg = recruitingByCity.get(key) ?? {
        city: cityRaw,
        stateCode,
        managerCounts: new Map<string, number>(),
        openRecruitingPosts: 0,
        applicants: 0,
      };
      agg.openRecruitingPosts += 1;
      incrementCount(agg.managerCounts, cell(row, recKeys.manager));
      agg.applicants += parseApplicantCount(cell(row, recKeys.applicantCount));
      recruitingByCity.set(key, agg);
    }
  }

  const allKeys = new Set([...melByCity.keys(), ...recruitingByCity.keys()]);
  const cities: CityMarketRow[] = [];

  for (const key of allKeys) {
    const mel = melByCity.get(key);
    const rec = recruitingByCity.get(key);
    if (!mel && !rec) continue;

    const city = mel?.city ?? rec?.city ?? "—";
    const stateCode = mel?.stateCode ?? rec?.stateCode ?? "—";
    const openStoreCalls = mel?.openStoreCalls ?? 0;
    const totalCalls = mel?.totalCalls ?? 0;
    const activeReps = mel?.activeReps.size ?? 0;
    const completionPercent =
      totalCalls > 0 && mel
        ? Math.round((mel.completedCalls / totalCalls) * 1000) / 10
        : null;

    const openRecruitingPosts = rec?.openRecruitingPosts ?? 0;
    const applicants = rec?.applicants ?? 0;
    const applicantsPerStoreCall =
      openStoreCalls > 0 ? Math.round((applicants / openStoreCalls) * 100) / 100 : null;

    const statePool = stateRepPools.get(stateCode) ?? new Set<string>();
    const nearbyReps = [...statePool].filter((rep) => !mel?.activeReps.has(rep)).length;
    const effectiveReps = activeReps + nearbyReps * 0.4;
    const nearbyRepCoverageEstimate = Math.min(
      100,
      Math.round((effectiveReps / Math.max(openStoreCalls, 1)) * 100),
    );

    const staffingPressure =
      Math.round((openStoreCalls / Math.max(activeReps, 1)) * 10) / 10;
    const isRural = isRuralState(stateCode);

    const marketRiskScore = computeMarketRiskScore({
      openStoreCalls,
      activeReps,
      completionPercent,
      applicants,
      openRecruitingPosts,
      applicantsPerStoreCall,
      nearbyRepCoverageEstimate,
      staffingPressure,
    });
    const urgency = computeMarketUrgency(marketRiskScore);
    const recommendations = buildRecommendations({
      urgency,
      openStoreCalls,
      activeReps,
      openRecruitingPosts,
      applicants,
      applicantsPerStoreCall,
      staffingPressure,
      nearbyRepCoverageEstimate,
      isRural,
    });

    cities.push({
      city,
      stateCode,
      label: formatCityLabel(city, stateCode),
      manager: primaryManager(mel?.managerCounts, rec?.managerCounts),
      marketRiskScore,
      urgency,
      openStoreCalls,
      activeReps,
      openRecruitingPosts,
      applicants,
      applicantsPerStoreCall,
      completionPercent,
      nearbyRepCoverageEstimate,
      staffingPressure,
      isRural,
      recommendations,
    });
  }

  cities.sort((a, b) => b.marketRiskScore - a.marketRiskScore || b.openStoreCalls - a.openStoreCalls);

  const citiesNeedingRecruiting = cities
    .filter((c) => c.marketRiskScore >= 35 && (c.openStoreCalls > 0 || c.openRecruitingPosts > 0))
    .slice(0, TABLE_LIMIT);

  const zeroApplicantCities = cities
    .filter(
      (c) =>
        c.applicants === 0 &&
        (c.openRecruitingPosts > 0 || c.openStoreCalls > 0),
    )
    .slice(0, TABLE_LIMIT);

  const highestStaffingPressure = [...cities]
    .filter((c) => c.openStoreCalls > 0)
    .sort((a, b) => b.staffingPressure - a.staffingPressure)
    .slice(0, TABLE_LIMIT);

  const ruralLowCoverage = cities
    .filter((c) => c.isRural && c.nearbyRepCoverageEstimate < 40 && c.openStoreCalls > 0)
    .sort((a, b) => a.nearbyRepCoverageEstimate - b.nearbyRepCoverageEstimate)
    .slice(0, TABLE_LIMIT);

  const chartCities = cities
    .filter((c) => c.openStoreCalls > 0 || c.applicants > 0)
    .slice(0, CHART_CITY_LIMIT);

  const storeCallsVsApplicants: ComparisonBar[] = chartCities.map((c) => ({
    label: c.label,
    primary: c.openStoreCalls,
    secondary: c.applicants,
  }));

  const repCoverageVsDemand: ComparisonBar[] = chartCities.map((c) => ({
    label: c.label,
    primary: c.nearbyRepCoverageEstimate,
    secondary: c.marketRiskScore,
  }));

  const topCriticalMarkets: ChartBar[] = cities
    .filter((c) => c.urgency === "Critical" || c.marketRiskScore >= 75)
    .slice(0, CRITICAL_CHART_LIMIT)
    .map((c) => ({ label: c.label, value: c.marketRiskScore }));

  if (topCriticalMarkets.length < CRITICAL_CHART_LIMIT) {
    const extra = cities
      .filter((c) => !topCriticalMarkets.some((t) => t.label === c.label))
      .slice(0, CRITICAL_CHART_LIMIT - topCriticalMarkets.length)
      .map((c) => ({ label: c.label, value: c.marketRiskScore }));
    topCriticalMarkets.push(...extra);
  }

  const hints: string[] = [];
  if (!melCityKey) hints.push("MEL City column not found (using location name)");
  if (!recKeys.city) hints.push("Recruiting City column not mapped");
  if (!recKeys.state) hints.push("Recruiting State column not mapped");
  if (melKeys.missingColumns.length > 0) {
    hints.push(`MEL missing: ${melKeys.missingColumns.join(", ")}`);
  }

  return {
    cities,
    citiesNeedingRecruiting,
    zeroApplicantCities,
    highestStaffingPressure,
    ruralLowCoverage,
    storeCallsVsApplicants,
    repCoverageVsDemand,
    topCriticalMarkets,
    columnHint:
      hints.length > 0
        ? `Joined by city + state · ${hints.join(" · ")}`
        : "MEL store calls joined to recruiting opens by city and state",
  };
}

export const URGENCY_BADGE_STYLES: Record<MarketUrgency, string> = {
  Critical: "bg-red-500/15 text-red-200 ring-1 ring-red-500/30",
  High: "bg-orange-500/15 text-orange-200 ring-1 ring-orange-500/30",
  Moderate: "bg-yellow-500/15 text-yellow-200 ring-1 ring-yellow-500/30",
  Stable: "bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-500/30",
};
