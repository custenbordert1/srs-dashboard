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
  duplicateNormalizedKeys: string[];
  unmatchedMarkets: string[];
  topUnmatchedMarkets: Array<{
    market: string;
    normalizedKey: string;
    source: MarketSource;
    count: number;
  }>;
  unmatchedDms: string[];
  incompleteRows: number;
  malformedRows: number;
  rowsMissingCityState: number;
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

function normalizeText(raw?: string | null): string {
  return String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeCity(raw?: string | null): string {
  return normalizeText(raw)
    .replace(/,/g, " ")
    .replace(/\b[A-Z]{2}\b$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCaseCity(normalized: string): string {
  return normalized
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function normalizeState(raw?: string | null): string {
  const value = normalizeText(raw).replace(/\./g, "");
  if (!value) return "";
  if (value.length === 2 && /^[A-Z]{2}$/.test(value)) return value;
  return STATE_NAMES[value] ?? value.slice(0, 2);
}

export function normalizeMarketKey(raw?: string | null, state?: string | null): string {
  const explicitState = normalizeState(state);
  if (explicitState) {
    const city = normalizeCity(raw);
    return city ? `${city.replace(/\s+/g, "_")}_${explicitState}` : "";
  }

  const value = normalizeText(raw);
  if (!value) return "";

  const commaParts = value.split(",").map((part) => part.trim()).filter(Boolean);
  if (commaParts.length >= 2) {
    const maybeState = normalizeState(commaParts.at(-1));
    const city = normalizeCity(commaParts.slice(0, -1).join(" "));
    return city && maybeState ? `${city.replace(/\s+/g, "_")}_${maybeState}` : "";
  }

  const tokens = value.replace(/,/g, " ").split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return "";
  const maybeState = normalizeState(tokens.at(-1));
  const city = normalizeCity(tokens.slice(0, -1).join(" "));
  return city && maybeState ? `${city.replace(/\s+/g, "_")}_${maybeState}` : "";
}

export function buildMarketKey(city?: string | null, state?: string | null): string {
  return normalizeMarketKey(city, state);
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
  const key = normalizeMarketKey(normalizedCity, state);
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

function duplicateKeys(keys: string[]): string[] {
  const counts = new Map<string, number>();
  for (const key of keys) {
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key]) => key)
    .slice(0, 25);
}

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

function topUnmatchedMarkets(
  identities: MarketIdentity[],
  recruitingKeysSet: Set<string>,
  melKeysSet: Set<string>,
): MarketIdentityDiagnostics["topUnmatchedMarkets"] {
  const counts = new Map<string, { market: string; normalizedKey: string; source: MarketSource; count: number }>();
  for (const identity of identities) {
    if (!identity.complete) continue;
    const unmatched =
      identity.source === "recruiting"
        ? !melKeysSet.has(identity.key)
        : !recruitingKeysSet.has(identity.key);
    if (!unmatched) continue;
    const countKey = `${identity.source}|${identity.key}`;
    const existing = counts.get(countKey) ?? {
      market: identity.marketName,
      normalizedKey: identity.key,
      source: identity.source,
      count: 0,
    };
    existing.count += 1;
    counts.set(countKey, existing);
  }

  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.normalizedKey.localeCompare(b.normalizedKey))
    .slice(0, 15);
}

export function analyzeMarketIdentityQuality(input: {
  recruitingRows: SheetRow[];
  recruitingHeaders: string[];
  melRows: MelProjectRow[];
  melHeaders: string[];
}): MarketIdentityDiagnostics {
  const recruitingKeys = resolveKpiSheetColumnKeys(input.recruitingHeaders);
  const melKeys = resolveMelProjectColumnKeys(input.melHeaders);
  const melCityKey = pickColumn(input.melHeaders, ["city", "location city", "store city"]);
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
        city: cell(row, melCityKey) || cell(row, melKeys.storeName),
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
  const rowsMissingCityState = allIdentities.filter((m) => !m.normalizedCity || !m.state).length;
  const malformedRows = allIdentities.filter((m) => (m.normalizedCity || m.state) && !m.complete).length;
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
    duplicateNormalizedKeys: duplicateKeys(allIdentities.map((m) => m.key)),
    unmatchedMarkets: [...new Set(unmatchedMarkets)].slice(0, 25),
    topUnmatchedMarkets: topUnmatchedMarkets(allIdentities, recruitingKeysSet, melKeysSet),
    unmatchedDms: [...new Set(unmatchedDms)].slice(0, 25),
    incompleteRows,
    malformedRows,
    rowsMissingCityState,
  };
}
