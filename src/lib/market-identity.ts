import {
  DM_TERRITORY_MAP,
  getDmForState,
  resolveDmName,
  type DistrictManager,
} from "@/lib/dm-territory-map";
import type { SheetRow } from "@/lib/google-sheet-csv";
import type { MelProjectRow } from "@/lib/mel-projects-sheet";
import { resolveMelProjectColumnKeys } from "@/lib/mel-projects-metrics";
import { resolveKpiSheetColumnKeys } from "@/lib/sheet-kpi-metrics";

export type MarketSource = "recruiting" | "mel";

export type MarketIdentity = {
  city: string;
  normalizedCity: string;
  state: string;
  key: string;
  dm: string;
  marketName: string;
  source: MarketSource;
  complete: boolean;
};

export type MarketIdentityDiagnostics = {
  totalRows: number;
  matchedRows: number;
  matchedMarketPercent: number;
  unmatchedRows: number;
  duplicateMarketCount: number;
  unmatchedMarkets: string[];
  unmatchedDms: string[];
  incompleteRows: number;
};

const STATE_NAMES: Record<string, string> = {
  ALABAMA: "AL",
  ALASKA: "AK",
  ARIZONA: "AZ",
  ARKANSAS: "AR",
  CALIFORNIA: "CA",
  COLORADO: "CO",
  CONNECTICUT: "CT",
  DELAWARE: "DE",
  "DISTRICT OF COLUMBIA": "DC",
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

export function normalizeCity(raw?: string | null): string {
  return String(raw ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function titleCaseCity(normalized: string): string {
  return normalized
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function normalizeState(raw?: string | null): string {
  const value = String(raw ?? "").trim().toUpperCase().replace(/\./g, "");
  if (!value) return "";
  if (value.length === 2) return value;
  return STATE_NAMES[value] ?? value.slice(0, 2);
}

export function buildMarketKey(city?: string | null, state?: string | null): string {
  const normalizedCity = normalizeCity(city);
  const normalizedState = normalizeState(state);
  if (!normalizedCity || !normalizedState) return "";
  return `${normalizedCity}|${normalizedState}`;
}

export function resolveDMByState(state?: string | null): DistrictManager | undefined {
  return getDmForState(normalizeState(state));
}

export function resolveMarketIdentity(input: {
  city?: string | null;
  state?: string | null;
  manager?: string | null;
  source: MarketSource;
}): MarketIdentity {
  const normalizedCity = normalizeCity(input.city);
  const state = normalizeState(input.state);
  const city = normalizedCity ? titleCaseCity(normalizedCity) : "—";
  const key = buildMarketKey(normalizedCity, state);
  const dm = resolveDmName(String(input.manager ?? ""), state);

  return {
    city,
    normalizedCity,
    state,
    key,
    dm,
    marketName: key ? `${city}, ${state}` : "Incomplete market",
    source: input.source,
    complete: Boolean(normalizedCity && state),
  };
}

function cell(row: SheetRow, key: string | undefined): string {
  if (!key) return "";
  return (row[key] ?? "").trim();
}

function countDuplicates(keys: string[]): number {
  const counts = new Map<string, number>();
  for (const key of keys) {
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.values()].filter((count) => count > 1).length;
}

export function analyzeMarketIdentityQuality(input: {
  recruitingRows: SheetRow[];
  recruitingHeaders: string[];
  melRows: MelProjectRow[];
  melHeaders: string[];
}): MarketIdentityDiagnostics {
  const recruitingKeys = resolveKpiSheetColumnKeys(input.recruitingHeaders);
  const melKeys = resolveMelProjectColumnKeys(input.melHeaders);
  const recruitingIdentities: MarketIdentity[] = [];
  const melIdentities: MarketIdentity[] = [];

  for (const row of input.recruitingRows) {
    recruitingIdentities.push(
      resolveMarketIdentity({
        city: cell(row, recruitingKeys.city),
        state: cell(row, recruitingKeys.state),
        manager: cell(row, recruitingKeys.manager),
        source: "recruiting",
      }),
    );
  }

  for (const row of input.melRows) {
    melIdentities.push(
      resolveMarketIdentity({
        city: cell(row, "City"),
        state: cell(row, melKeys.state),
        manager: cell(row, melKeys.manager),
        source: "mel",
      }),
    );
  }

  const recruitingKeysSet = new Set(recruitingIdentities.filter((m) => m.complete).map((m) => m.key));
  const melKeysSet = new Set(melIdentities.filter((m) => m.complete).map((m) => m.key));
  const allIdentities = [...recruitingIdentities, ...melIdentities];
  const incompleteRows = allIdentities.filter((m) => !m.complete).length;
  const unmatchedMarkets = allIdentities
    .filter((m) => m.complete)
    .filter((m) => (m.source === "recruiting" ? !melKeysSet.has(m.key) : !recruitingKeysSet.has(m.key)))
    .map((m) => m.marketName);
  const unmatchedDms = allIdentities
    .filter((m) => m.dm === "Unassigned" || !(m.state in DM_TERRITORY_MAP))
    .map((m) => m.marketName);
  const unmatchedRows = incompleteRows + unmatchedMarkets.length;
  const totalRows = allIdentities.length;
  const matchedRows = Math.max(0, totalRows - unmatchedRows);

  return {
    totalRows,
    matchedRows,
    matchedMarketPercent: totalRows > 0 ? Math.round((matchedRows / totalRows) * 1000) / 10 : 0,
    unmatchedRows,
    duplicateMarketCount: countDuplicates(allIdentities.map((m) => m.key)),
    unmatchedMarkets: [...new Set(unmatchedMarkets)].slice(0, 25),
    unmatchedDms: [...new Set(unmatchedDms)].slice(0, 25),
    incompleteRows,
  };
}
