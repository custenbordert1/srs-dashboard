/**
 * P216 — Position.Location is the authoritative source for posting geography.
 * Title parsing (locationSource="job_name") is diagnostic only and must never
 * drive coverage, DM assignment, distance, paperwork eligibility, or gates.
 */

import type { BreezyJobLocationSource } from "@/lib/breezy-job-location";

export const P216_PHASE = "P216" as const;

/** Sources that may drive geography gates / DM / coverage / eligibility. */
export const P216_AUTHORITATIVE_LOCATION_SOURCES = new Set<BreezyJobLocationSource>([
  "location.city+location.state",
  "location.name",
  "address",
  "top_level.city+region",
  "location_string",
]);

/** Diagnostic-only — never authoritative for gates. */
export const P216_DIAGNOSTIC_LOCATION_SOURCES = new Set<BreezyJobLocationSource>(["job_name", "missing"]);

export type P216PostingGeography = {
  city: string;
  state: string;
  zip: string;
  displayLocation: string;
  locationSource: BreezyJobLocationSource;
  /** True only when city+state come from an authoritative (non-title) source. */
  authoritative: boolean;
  positionId: string | null;
  positionName: string | null;
  positionStatus: string | null;
};

export type P216ResolvePostingInput = {
  positionId?: string | null;
  positionName?: string | null;
  positionStatus?: string | null;
  /** Normalized city from Position.Location / BreezyJob (may be title-derived). */
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  displayLocation?: string | null;
  locationSource?: BreezyJobLocationSource | string | null;
  /** Candidate home — used only when posting geography is not authoritative. */
  homeCity?: string | null;
  homeState?: string | null;
};

export type P216RoutingResult = {
  posting: P216PostingGeography;
  /** State used for Market → Territory → DM (posting first, then home). */
  routingState: string;
  expectedDm: string;
  usedHomeFallback: boolean;
};

export function isAuthoritativeBreezyLocationSource(
  source: BreezyJobLocationSource | string | null | undefined,
): boolean {
  if (!source) return false;
  return P216_AUTHORITATIVE_LOCATION_SOURCES.has(source as BreezyJobLocationSource);
}

/**
 * Strip title-derived geography. If locationSource is job_name (or missing
 * with empty city/state), the posting has no authoritative location.
 */
export function resolveAuthoritativePostingGeography(
  input: P216ResolvePostingInput,
): P216PostingGeography {
  const source = (input.locationSource ?? "missing") as BreezyJobLocationSource;
  const city = String(input.city ?? "").trim();
  const state = String(input.state ?? "").trim().toUpperCase();
  const zip = String(input.zip ?? "").trim();
  const authoritative =
    isAuthoritativeBreezyLocationSource(source) && Boolean(city && state);

  if (authoritative) {
    return {
      city,
      state,
      zip,
      displayLocation:
        String(input.displayLocation ?? "").trim() || [city, state].filter(Boolean).join(", "),
      locationSource: source,
      authoritative: true,
      positionId: input.positionId?.trim() || null,
      positionName: input.positionName?.trim() || null,
      positionStatus: input.positionStatus?.trim() || null,
    };
  }

  // Title-derived or incomplete — expose diagnostic source but empty geo for gates.
  return {
    city: "",
    state: "",
    zip: "",
    displayLocation: "",
    locationSource: source === "job_name" ? "job_name" : city || state ? source : "missing",
    authoritative: false,
    positionId: input.positionId?.trim() || null,
    positionName: input.positionName?.trim() || null,
    positionStatus: input.positionStatus?.trim() || null,
  };
}

/**
 * Hierarchy for routing state (DM / territory):
 *   Applied Position.Location → Candidate Home → (empty)
 * Title parsing never contributes.
 */
export function resolveP216Routing(
  input: P216ResolvePostingInput,
  getDmForState: (state: string) => string | undefined,
): P216RoutingResult {
  const posting = resolveAuthoritativePostingGeography(input);
  const homeState = String(input.homeState ?? "").trim().toUpperCase();
  const usedHomeFallback = !posting.authoritative && Boolean(homeState);
  const routingState = posting.authoritative ? posting.state : homeState;
  const expectedDm = routingState ? String(getDmForState(routingState) ?? "") : "";
  return { posting, routingState, expectedDm, usedHomeFallback };
}

/** Geo-posting gate: only authoritative Position.Location (or independent market verification). */
export function hasAuthoritativeGeoPosting(
  posting: Pick<P216PostingGeography, "authoritative" | "city" | "state">,
  marketIndependentlyVerified = false,
): boolean {
  if (marketIndependentlyVerified) return true;
  return posting.authoritative && Boolean(posting.city.trim() && posting.state.trim());
}

export const P216_EXPECTED_DM_BY_CITY_STATE: Record<string, string> = {
  "columbus|oh": "Mindie Rodriguez",
  "kansas city|mo": "Amy Harp",
};

export function expectedDmForCityState(city: string, state: string): string | null {
  const key = `${city.trim().toLowerCase()}|${state.trim().toLowerCase()}`;
  return P216_EXPECTED_DM_BY_CITY_STATE[key] ?? null;
}
