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

export type MarketIdentityIssueType =
  | "Missing State"
  | "Missing City"
  | "Alias Conflict"
  | "Duplicate Key"
  | "Malformed Market"
  | "Unknown State"
  | "Multi Match";

export type MarketIdentityIssue = {
  type: MarketIdentityIssueType;
  message: string;
};

export type MarketIdentity = {
  city: string;
  normalizedCity: string;
  state: string;
  key: string;
  dm: string;
  marketName: string;
  source: MarketSource;
  complete: boolean;
  confidence: number;
  issues: MarketIdentityIssue[];
  issueTypes: MarketIdentityIssueType[];
  autoFixable: boolean;
  rawCity: string;
  rawState: string;
};

export type MarketIdentityDiagnostics = {
  totalRows: number;
  matchedRows: number;
  matchedMarketPercent: number;
  unmatchedRows: number;
  duplicateMarketCount: number;
  duplicateNormalizedKeys: string[];
  duplicateAliases: Array<{
    normalizedKey: string;
    aliases: string[];
    count: number;
  }>;
  unmatchedMarkets: string[];
  topUnmatchedMarkets: Array<{
    market: string;
    normalizedKey: string;
    source: MarketSource;
    count: number;
    avgConfidence: number;
    issueTypes: MarketIdentityIssueType[];
  }>;
  unmatchedDms: string[];
  incompleteRows: number;
  malformedRows: number;
  rowsMissingCityState: number;
  autoFixableRows: number;
  averageConfidence: number;
  confidenceBuckets: {
    high: number;
    medium: number;
    low: number;
  };
  issueCounts: Record<MarketIdentityIssueType, number>;
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

const VALID_STATE_CODES = new Set(Object.values(STATE_NAMES));

function addIssue(issues: MarketIdentityIssue[], type: MarketIdentityIssueType, message: string) {
  if (!issues.some((issue) => issue.type === type && issue.message === message)) {
    issues.push({ type, message });
  }
}

function normalizeText(raw?: string | null): string {
  return String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/[_-]+/g, " ")
    .replace(/[\u2010-\u2015]/g, " ")
    .replace(/[^\w\s,]/g, " ")
    .replace(/\s*,\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeCity(raw?: string | null): string {
  return normalizeText(raw)
    .replace(/\b[A-Z]{2}\b$/g, "")
    .replace(/\b(?:ALABAMA|ALASKA|ARIZONA|ARKANSAS|CALIFORNIA|COLORADO|CONNECTICUT|DELAWARE|FLORIDA|GEORGIA|HAWAII|IDAHO|ILLINOIS|INDIANA|IOWA|KANSAS|KENTUCKY|LOUISIANA|MAINE|MARYLAND|MASSACHUSETTS|MICHIGAN|MINNESOTA|MISSISSIPPI|MISSOURI|MONTANA|NEBRASKA|NEVADA|OHIO|OKLAHOMA|OREGON|PENNSYLVANIA|TENNESSEE|TEXAS|UTAH|VERMONT|VIRGINIA|WASHINGTON|WISCONSIN|WYOMING)\b$/g, "")
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
  if (value.length === 2 && /^[A-Z]{2}$/.test(value)) {
    return VALID_STATE_CODES.has(value) ? value : "";
  }
  return STATE_NAMES[value] ?? "";
}

export function normalizeMarketKey(raw?: string | null, state?: string | null): string {
  const explicitState = normalizeState(state);
  if (explicitState) {
    const city = normalizeCity(raw);
    return city ? `${city.replace(/\s+/g, "_")}_${explicitState}` : "";
  }

  const value = normalizeText(raw);
  if (!value) return "";

  const tokens = value.split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return "";
  let maybeState = normalizeState(tokens.at(-1));
  let cityTokens = tokens.slice(0, -1);
  if (!maybeState && tokens.length >= 3) {
    const twoWordState = normalizeState(tokens.slice(-2).join(" "));
    if (twoWordState) {
      maybeState = twoWordState;
      cityTokens = tokens.slice(0, -2);
    }
  }
  const city = normalizeCity(cityTokens.join(" "));
  return city && maybeState ? `${city.replace(/\s+/g, "_")}_${maybeState}` : "";
}

export function buildMarketKey(city?: string | null, state?: string | null): string {
  return normalizeMarketKey(city, state);
}

export function resolveDMByState(state?: string | null): DistrictManager | undefined {
  return getDmForState(normalizeState(state));
}

function parseMarketParts(input: {
  city?: string | null;
  state?: string | null;
}): {
  normalizedCity: string;
  state: string;
  key: string;
  confidence: number;
  issues: MarketIdentityIssue[];
  autoFixable: boolean;
} {
  const rawCity = String(input.city ?? "").trim();
  const rawState = String(input.state ?? "").trim();
  const issues: MarketIdentityIssue[] = [];
  let confidence = 100;
  let state = normalizeState(rawState);
  let normalizedCity = normalizeCity(rawCity);
  let autoFixable = false;

  if (!rawCity) {
    addIssue(issues, "Missing City", "City is blank or unmapped.");
    confidence -= 45;
  }

  if (rawState && !state) {
    addIssue(issues, "Unknown State", `State value "${rawState}" could not be normalized.`);
    confidence -= 35;
  }

  if (!rawState) {
    const inferredKey = normalizeMarketKey(rawCity);
    if (inferredKey) {
      const parts = inferredKey.split("_");
      state = parts.at(-1) ?? "";
      normalizedCity = parts.slice(0, -1).join(" ");
      autoFixable = true;
      addIssue(issues, "Missing State", "State was inferred from combined market text.");
      confidence -= 12;
    } else {
      addIssue(issues, "Missing State", "State is blank or unmapped.");
      confidence -= 45;
    }
  }

  if (rawCity && /[,/_-]/.test(rawCity)) {
    autoFixable = true;
    confidence -= 4;
  }

  if (rawCity && normalizeText(rawCity).split(/\s+/).length > 6) {
    addIssue(issues, "Malformed Market", "Market has unusually many tokens after cleanup.");
    confidence -= 20;
  }

  if (normalizedCity && /\d/.test(normalizedCity)) {
    addIssue(issues, "Malformed Market", "City contains numeric characters.");
    confidence -= 20;
  }

  const key = normalizedCity && state ? `${normalizedCity.replace(/\s+/g, "_")}_${state}` : "";
  if (!key && (normalizedCity || state)) {
    addIssue(issues, "Malformed Market", "Could not produce canonical CITY_STATE key.");
    confidence -= 20;
  }

  return {
    normalizedCity,
    state,
    key,
    confidence: Math.max(0, Math.min(100, Math.round(confidence))),
    issues,
    autoFixable,
  };
}

export function resolveMarketIdentity(input: {
  city?: string | null;
  state?: string | null;
  manager?: string | null;
  source: MarketSource;
}): MarketIdentity {
  const parsed = parseMarketParts(input);
  const { normalizedCity, state, key } = parsed;
  const city = normalizedCity ? titleCaseCity(normalizedCity) : "—";
  const dm = resolveDmName(String(input.manager ?? ""), state);

  return {
    city,
    normalizedCity,
    state,
    key,
    dm,
    marketName: key ? `${city}, ${state}` : "Incomplete market",
    source: input.source,
    complete: Boolean(key),
    confidence: parsed.confidence,
    issues: parsed.issues,
    issueTypes: parsed.issues.map((issue) => issue.type),
    autoFixable: parsed.autoFixable,
    rawCity: String(input.city ?? ""),
    rawState: String(input.state ?? ""),
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

function duplicateAliases(identities: MarketIdentity[]): MarketIdentityDiagnostics["duplicateAliases"] {
  const aliasesByKey = new Map<string, Set<string>>();
  const countsByKey = new Map<string, number>();
  for (const identity of identities) {
    if (!identity.key) continue;
    const rawAlias = normalizeText([identity.rawCity, identity.rawState].filter(Boolean).join(" "));
    const aliases = aliasesByKey.get(identity.key) ?? new Set<string>();
    if (rawAlias) aliases.add(rawAlias);
    aliasesByKey.set(identity.key, aliases);
    countsByKey.set(identity.key, (countsByKey.get(identity.key) ?? 0) + 1);
  }

  return [...aliasesByKey.entries()]
    .filter(([, aliases]) => aliases.size > 1)
    .sort((a, b) => (countsByKey.get(b[0]) ?? 0) - (countsByKey.get(a[0]) ?? 0))
    .map(([normalizedKey, aliases]) => ({
      normalizedKey,
      aliases: [...aliases].slice(0, 6),
      count: countsByKey.get(normalizedKey) ?? aliases.size,
    }))
    .slice(0, 25);
}

function issueCounts(identities: MarketIdentity[]): Record<MarketIdentityIssueType, number> {
  const counts: Record<MarketIdentityIssueType, number> = {
    "Missing State": 0,
    "Missing City": 0,
    "Alias Conflict": 0,
    "Duplicate Key": 0,
    "Malformed Market": 0,
    "Unknown State": 0,
    "Multi Match": 0,
  };
  for (const identity of identities) {
    for (const type of new Set(identity.issueTypes)) {
      counts[type] += 1;
    }
  }
  return counts;
}

function confidenceBuckets(identities: MarketIdentity[]): MarketIdentityDiagnostics["confidenceBuckets"] {
  return identities.reduce(
    (buckets, identity) => {
      if (identity.confidence >= 85) buckets.high += 1;
      else if (identity.confidence >= 60) buckets.medium += 1;
      else buckets.low += 1;
      return buckets;
    },
    { high: 0, medium: 0, low: 0 },
  );
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
  const counts = new Map<string, {
    market: string;
    normalizedKey: string;
    source: MarketSource;
    count: number;
    confidenceTotal: number;
    issueTypes: Set<MarketIdentityIssueType>;
  }>();
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
      confidenceTotal: 0,
      issueTypes: new Set<MarketIdentityIssueType>(),
    };
    existing.count += 1;
    existing.confidenceTotal += identity.confidence;
    for (const type of identity.issueTypes) existing.issueTypes.add(type);
    counts.set(countKey, existing);
  }

  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.normalizedKey.localeCompare(b.normalizedKey))
    .slice(0, 15)
    .map((market) => ({
      market: market.market,
      normalizedKey: market.normalizedKey,
      source: market.source,
      count: market.count,
      avgConfidence: market.count > 0 ? Math.round(market.confidenceTotal / market.count) : 0,
      issueTypes: [...market.issueTypes],
    }));
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
  const keyCounts = new Map<string, number>();
  const sourcesByKey = new Map<string, Set<MarketSource>>();
  const aliases = duplicateAliases(allIdentities);

  for (const identity of allIdentities) {
    if (!identity.key) continue;
    keyCounts.set(identity.key, (keyCounts.get(identity.key) ?? 0) + 1);
    const sources = sourcesByKey.get(identity.key) ?? new Set<MarketSource>();
    sources.add(identity.source);
    sourcesByKey.set(identity.key, sources);
  }

  const aliasConflictKeys = new Set(aliases.map((alias) => alias.normalizedKey));
  for (const identity of allIdentities) {
    if (!identity.key) continue;
    if ((keyCounts.get(identity.key) ?? 0) > 1) {
      addIssue(identity.issues, "Duplicate Key", "Multiple rows normalize to the same canonical key.");
    }
    if (aliasConflictKeys.has(identity.key)) {
      addIssue(identity.issues, "Alias Conflict", "Multiple raw aliases normalize to this key.");
    }
    if ((sourcesByKey.get(identity.key)?.size ?? 0) > 1) {
      addIssue(identity.issues, "Multi Match", "Canonical key appears in multiple source systems.");
    }
    identity.issueTypes = identity.issues.map((issue) => issue.type);
  }

  const incompleteRows = allIdentities.filter((m) => !m.complete).length;
  const rowsMissingCityState = allIdentities.filter((m) =>
    m.issueTypes.includes("Missing City") || m.issueTypes.includes("Missing State")
  ).length;
  const malformedRows = allIdentities.filter((m) => m.issueTypes.includes("Malformed Market")).length;
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
  const averageConfidence =
    totalRows > 0
      ? Math.round(allIdentities.reduce((sum, identity) => sum + identity.confidence, 0) / totalRows)
      : 0;

  return {
    totalRows,
    matchedRows,
    matchedMarketPercent: totalRows > 0 ? Math.round((matchedRows / totalRows) * 1000) / 10 : 0,
    unmatchedRows,
    duplicateMarketCount: countDuplicates(allIdentities.map((m) => m.key)),
    duplicateNormalizedKeys: duplicateKeys(allIdentities.map((m) => m.key)),
    duplicateAliases: aliases,
    unmatchedMarkets: [...new Set(unmatchedMarkets)].slice(0, 25),
    topUnmatchedMarkets: topUnmatchedMarkets(allIdentities, recruitingKeysSet, melKeysSet),
    unmatchedDms: [...new Set(unmatchedDms)].slice(0, 25),
    incompleteRows,
    malformedRows,
    rowsMissingCityState,
    autoFixableRows: allIdentities.filter((m) => m.autoFixable).length,
    averageConfidence,
    confidenceBuckets: confidenceBuckets(allIdentities),
    issueCounts: issueCounts(allIdentities),
  };
}
