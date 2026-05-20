/**
 * Normalize Breezy position location fields.
 * Top-level `state` on Breezy positions is pipeline status (published, draft, …), not US state.
 */

export const BREEZY_PIPELINE_STATUSES = new Set([
  "published",
  "draft",
  "closed",
  "archived",
  "pending",
  "paused",
  "open",
  "on_hold",
  "on-hold",
  "unknown",
]);

const US_STATE_CODES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS",
  "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY",
  "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV",
  "WI", "WY", "DC",
]);

const STATE_NAME_TO_CODE: Record<string, string> = {
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
  "DISTRICT OF COLUMBIA": "DC",
};

export type BreezyJobLocationSource =
  | "location.city+location.state"
  | "location.name"
  | "address"
  | "top_level.city+region"
  | "location_string"
  | "job_name"
  | "missing";

export type NormalizedBreezyJobLocation = {
  city: string;
  /** US state code when resolved — never pipeline status. */
  state: string;
  zip: string;
  displayLocation: string;
  pipelineStatus: string;
  locationSource: BreezyJobLocationSource;
};

export type BreezyJobLocationDiagnostics = {
  totalJobs: number;
  missingLocationCount: number;
  bySource: Partial<Record<BreezyJobLocationSource, number>>;
  samples: Array<{
    jobId: string;
    name: string;
    locationSource: BreezyJobLocationSource;
    city: string;
    state: string;
    displayLocation: string;
    pipelineStatus: string;
  }>;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function readString(value: unknown): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

export function isBreezyPipelineStatus(value: string): boolean {
  return BREEZY_PIPELINE_STATUSES.has(value.trim().toLowerCase());
}

export function normalizeGeoStateCode(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed || isBreezyPipelineStatus(trimmed)) return "";

  const upper = trimmed.toUpperCase();
  if (upper.length === 2 && US_STATE_CODES.has(upper)) return upper;

  const fromName = STATE_NAME_TO_CODE[upper];
  if (fromName) return fromName;

  const twoLetter = upper.match(/\b([A-Z]{2})\b/);
  if (twoLetter && US_STATE_CODES.has(twoLetter[1])) return twoLetter[1];

  return "";
}

function geoStateFromBreezyStateField(value: unknown): string {
  if (typeof value === "string") return normalizeGeoStateCode(value);
  const record = asRecord(value);
  if (!record) return "";
  const id = readString(record.id);
  const name = readString(record.name);
  if (id) {
    const fromId = normalizeGeoStateCode(id);
    if (fromId) return fromId;
  }
  if (name) return normalizeGeoStateCode(name);
  return "";
}

export function parseCityStateFromText(text: string): { city: string; state: string; zip: string } {
  const trimmed = text.trim();
  if (!trimmed) return { city: "", state: "", zip: "" };

  let work = trimmed;
  let zip = "";
  const zipTail = work.match(/,?\s*(\d{5}(?:-\d{4})?)\s*$/);
  if (zipTail) {
    zip = zipTail[1];
    work = work.slice(0, work.length - zipTail[0].length).trim().replace(/,\s*$/, "");
  }

  const parts = work.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const last = parts[parts.length - 1];
    const state = normalizeGeoStateCode(last);
    if (state) {
      return { city: parts.slice(0, -1).join(", "), state, zip };
    }
  }

  const cityStateTail = work.match(/^(.+?)[,\s]+([A-Za-z]{2})\s*$/);
  if (cityStateTail) {
    const state = normalizeGeoStateCode(cityStateTail[2]);
    if (state) return { city: cityStateTail[1].trim(), state, zip };
  }

  return { city: work, state: "", zip };
}

export function parseLocationFromJobName(name: string): { city: string; state: string } {
  const trimmed = name.trim();
  if (!trimmed) return { city: "", state: "" };

  const trailing = trimmed.match(/,\s*([^,]+),\s*([A-Za-z]{2})\s*(?:\([^)]*\))?\s*$/);
  if (trailing) {
    const state = normalizeGeoStateCode(trailing[2]);
    if (state) return { city: trailing[1].trim(), state };
  }

  const inline = trimmed.match(/\b([A-Za-z][\w\s.'-]+),\s*([A-Za-z]{2})\b/);
  if (inline) {
    const state = normalizeGeoStateCode(inline[2]);
    if (state) return { city: inline[1].trim(), state };
  }

  return { city: "", state: "" };
}

function buildDisplayLocation(city: string, state: string, zip: string): string {
  const parts: string[] = [];
  if (city) parts.push(city);
  if (state) parts.push(state);
  let base = parts.join(", ");
  if (zip) base = base ? `${base} ${zip}` : zip;
  return base;
}

function stringField(record: Record<string, unknown> | null, keys: string[]): string {
  if (!record) return "";
  for (const key of keys) {
    const value = readString(record[key]);
    if (value) return value;
  }
  return "";
}

function locationBlock(record: Record<string, unknown>): Record<string, unknown> | null {
  const location = record.location;
  if (Array.isArray(location)) {
    const first = location[0];
    return asRecord(first);
  }
  return asRecord(location);
}

function addressBlock(record: Record<string, unknown>): Record<string, unknown> | null {
  return asRecord(record.address);
}

/**
 * Extract normalized location from a raw Breezy position record.
 */
export function normalizeBreezyJobLocation(record: Record<string, unknown>): NormalizedBreezyJobLocation {
  const pipelineStatus =
    stringField(record, ["state", "status"]) || "unknown";

  const location = locationBlock(record);
  const address = addressBlock(record);

  let city = "";
  let state = "";
  let zip = "";
  let locationSource: BreezyJobLocationSource = "missing";

  if (location) {
    const locCity = stringField(location, ["city"]);
    const locState = geoStateFromBreezyStateField(location.state);
    const locZip = stringField(location, ["zip", "postal_code", "postalCode", "zip_code"]);
    if (locCity || locState) {
      city = locCity;
      state = locState;
      zip = locZip;
      locationSource = "location.city+location.state";
    } else {
      const locName = stringField(location, ["name"]);
      if (locName) {
        const parsed = parseCityStateFromText(locName);
        city = parsed.city;
        state = parsed.state;
        zip = parsed.zip || locZip;
        if (city || state) locationSource = "location.name";
      }
    }
  }

  if ((!city && !state) && address) {
    const addrCity = stringField(address, ["city"]);
    const addrState =
      geoStateFromBreezyStateField(address.state) || normalizeGeoStateCode(stringField(address, ["state"]));
    const addrZip = stringField(address, ["zip", "postal_code", "postalCode", "zip_code"]);
    if (addrCity || addrState) {
      city = addrCity;
      state = addrState;
      zip = addrZip;
      locationSource = "address";
    }
  }

  if (!city) {
    const topCity = stringField(record, ["city", "location_city"]);
    if (topCity && !isBreezyPipelineStatus(topCity)) city = topCity;
  }

  if (!state) {
    const region = stringField(record, ["region", "location_state"]);
    const geo = normalizeGeoStateCode(region);
    if (geo) {
      state = geo;
      if (city && locationSource === "missing") locationSource = "top_level.city+region";
    }
  }

  if ((!city || !state) && typeof record.location === "string") {
    const parsed = parseCityStateFromText(record.location);
    if (!city && parsed.city) city = parsed.city;
    if (!state && parsed.state) state = parsed.state;
    if (!zip && parsed.zip) zip = parsed.zip;
    if (parsed.city || parsed.state) locationSource = "location_string";
  }

  const jobName = stringField(record, ["name", "title"]);
  if ((!city || !state) && jobName) {
    const fromName = parseLocationFromJobName(jobName);
    if (!city && fromName.city) city = fromName.city;
    if (!state && fromName.state) state = fromName.state;
    if (fromName.city || fromName.state) locationSource = "job_name";
  }

  if (!city && !state) locationSource = "missing";

  return {
    city,
    state,
    zip,
    displayLocation: buildDisplayLocation(city, state, zip),
    pipelineStatus,
    locationSource,
  };
}

export function isBreezyJobLocationComplete(loc: Pick<NormalizedBreezyJobLocation, "city" | "state">): boolean {
  return Boolean(loc.city.trim() && loc.state.trim());
}

export function buildBreezyJobLocationDiagnostics(
  jobs: Array<{
    jobId: string;
    name: string;
    city: string;
    state: string;
    displayLocation: string;
    status: string;
    locationSource?: string;
  }>,
  sampleLimit = 5,
): BreezyJobLocationDiagnostics {
  const bySource: Partial<Record<BreezyJobLocationSource, number>> = {};
  let missingLocationCount = 0;

  for (const job of jobs) {
    const source = (job.locationSource as BreezyJobLocationSource | undefined) ?? "missing";
    bySource[source] = (bySource[source] ?? 0) + 1;
    if (!job.city.trim() || !job.state.trim()) missingLocationCount += 1;
  }

  const samples = jobs.slice(0, sampleLimit).map((job) => ({
    jobId: job.jobId,
    name: job.name,
    locationSource: (job.locationSource as BreezyJobLocationSource | undefined) ?? "missing",
    city: job.city,
    state: job.state,
    displayLocation: job.displayLocation || buildDisplayLocation(job.city, job.state, ""),
    pipelineStatus: job.status,
  }));

  return {
    totalJobs: jobs.length,
    missingLocationCount,
    bySource,
    samples,
  };
}
