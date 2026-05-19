/**
 * Read-only Breezy HR API client (GET requests only).
 * https://developer.breezy.hr/reference/overview
 */

const BREEZY_API_BASE = "https://api.breezy.hr/v3";
const BREEZY_REQUEST_TIMEOUT_MS = 15_000;
const BREEZY_CANDIDATE_REQUEST_TIMEOUT_MS = 10_000;
/** Server scan budget — keep below route maxDuration. */
const BREEZY_CANDIDATE_SCAN_BUDGET_MS = 110_000;
const BREEZY_CACHE_TTL_MS = 60_000;

/** Candidates fetched per position during aggregation (Breezy max page_size is 50). */
const CANDIDATES_PAGE_SIZE = 50;
/** Safety cap per position to avoid runaway pagination. */
const MAX_CANDIDATE_PAGES_PER_POSITION = 200;
/** Concurrent position candidate fetches during full sync. */
const CANDIDATE_POSITION_CONCURRENCY = 10;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type BreezyCompany = {
  _id: string;
  name?: string;
  [key: string]: unknown;
};

export type BreezyJob = {
  jobId: string;
  name: string;
  city: string;
  state: string;
  status: string;
  createdDate: string;
  updatedDate: string;
  candidateCount?: number;
};

export type BreezyCandidate = {
  candidateId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  source: string;
  stage: string;
  appliedDate: string;
  positionId: string;
  positionName: string;
  city: string;
  state: string;
  score?: number;
};

export type BreezyJobsSuccess = {
  ok: true;
  jobs: BreezyJob[];
  fetchedAt: string;
  companyId: string;
  companyName?: string;
  state: string;
};

export type BreezyCandidatesSuccess = {
  ok: true;
  candidates: BreezyCandidate[];
  fetchedAt: string;
  companyId: string;
  companyName?: string;
  positionId?: string;
  /** Published positions available for the requested job state. */
  totalPositionsAvailable?: number;
  positionsScanned?: number;
  /** Same as candidates.length — explicit for dashboard consumers. */
  totalCandidatesPulled?: number;
  /** Applicants with creation_date in the rolling 7 days before fetchedAt. */
  candidatesLast7Days?: number;
  truncated?: boolean;
  warnings?: string[];
};

export type BreezyApiFailure = {
  ok: false;
  error: string;
  fetchedAt: string;
};

export type BreezyJobsResult = BreezyJobsSuccess | BreezyApiFailure;
export type BreezyCandidatesResult = BreezyCandidatesSuccess | BreezyApiFailure;

type CacheEntry<T> = {
  expiresAt: number;
  promise: Promise<T>;
};

const jobsCache = new Map<string, CacheEntry<BreezyJobsResult>>();
const candidatesCache = new Map<string, CacheEntry<BreezyCandidatesResult>>();

type BreezyErrorBody = {
  error?: { message?: string; type?: string };
};

type RawBreezyPosition = Record<string, unknown> & {
  _id?: string;
  name?: string;
  friendly_id?: string;
  state?: string;
};

type RawBreezyCandidate = Record<string, unknown> & {
  _id?: string;
  name?: string;
  email_address?: string;
  phone_number?: string;
  position_id?: string;
};

export function getBreezyApiKey(): string | undefined {
  const key = process.env.BREEZY_API_KEY?.trim();
  const normalized = key?.toLowerCase();
  if (
    normalized === "your-breezy-access-token" ||
    normalized === "your-breezy-api-key" ||
    normalized === "placeholder"
  ) {
    return undefined;
  }
  return key && key.length > 0 ? key : undefined;
}

export function getBreezyCompanyIdOverride(): string | undefined {
  const id = process.env.BREEZY_COMPANY_ID?.trim();
  return id && id.length > 0 ? id : undefined;
}

function missingApiKeyFailure(): BreezyApiFailure {
  return {
    ok: false,
    error: "Waiting on Breezy API key.",
    fetchedAt: new Date().toISOString(),
  };
}

function parseBreezyError(body: unknown, status: number): string {
  if (status === 401 || status === 403) {
    return "Breezy authentication failed. Check that BREEZY_API_KEY is active and has access to this company.";
  }
  if (status === 429) {
    return "Breezy rate limit reached. Retry after Breezy allows additional requests.";
  }
  if (status >= 500) {
    return `Breezy appears unavailable right now (HTTP ${status}). Retry shortly.`;
  }
  if (body && typeof body === "object" && "error" in body) {
    const err = (body as BreezyErrorBody).error;
    if (err?.message) return err.message;
    if (err?.type) return err.type;
  }
  return `Breezy API request failed (HTTP ${status})`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function stringField(record: Record<string, unknown> | null, keys: string[]): string {
  if (!record) return "";
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
}

function numberField(record: Record<string, unknown> | null, keys: string[]): number | undefined {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number.parseFloat(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function nestedString(record: Record<string, unknown> | null, paths: string[][]): string {
  for (const path of paths) {
    let current: unknown = record;
    for (const segment of path) {
      current = asRecord(current)?.[segment];
    }
    if (typeof current === "string" && current.trim()) return current.trim();
    if (typeof current === "number") return String(current);
  }
  return "";
}

function splitName(rawName: string): { firstName: string; lastName: string } {
  const parts = rawName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
  };
}

function sanitizeJob(raw: RawBreezyPosition): BreezyJob | null {
  const record = raw as Record<string, unknown>;
  const jobId = stringField(record, ["_id", "id", "friendly_id"]);
  if (!jobId) return null;

  return {
    jobId,
    name: stringField(record, ["name", "title"]) || "Untitled job",
    city: stringField(record, ["city"]) || nestedString(record, [["location", "city"], ["address", "city"]]),
    state:
      stringField(record, ["state", "region"]) ||
      nestedString(record, [["location", "state"], ["address", "state"]]),
    status: stringField(record, ["state", "status"]) || "unknown",
    createdDate: stringField(record, ["creation_date", "created_at", "created"]) || "",
    updatedDate: stringField(record, ["updated_date", "updated_at", "modified_at"]) || "",
    candidateCount: numberField(record, ["candidate_count", "candidates_count", "applicants_count"]),
  };
}

function sanitizeCandidate(
  raw: RawBreezyCandidate,
  position: Pick<BreezyJob, "jobId" | "name" | "city" | "state"> | undefined,
): BreezyCandidate | null {
  const record = raw as Record<string, unknown>;
  const candidateId = stringField(record, ["_id", "id"]);
  if (!candidateId) return null;

  const explicitFirstName = stringField(record, ["first_name", "firstName"]);
  const explicitLastName = stringField(record, ["last_name", "lastName"]);
  const fallbackName = splitName(stringField(record, ["name", "full_name"]));

  return {
    candidateId,
    firstName: explicitFirstName || fallbackName.firstName,
    lastName: explicitLastName || fallbackName.lastName,
    email: stringField(record, ["email_address", "email"]),
    phone: stringField(record, ["phone_number", "phone"]),
    source:
      nestedString(record, [["source", "name"]]) ||
      stringField(record, ["source", "origin", "candidate_source"]) ||
      "Unknown source",
    stage:
      nestedString(record, [["stage", "name"], ["status", "name"]]) ||
      stringField(record, ["stage_name", "status"]) ||
      "Unknown stage",
    appliedDate: stringField(record, ["creation_date", "created_at", "created", "applied_date"]) || "",
    positionId: stringField(record, ["position_id"]) || position?.jobId || "",
    positionName:
      nestedString(record, [["position", "name"], ["position", "title"]]) ||
      stringField(record, ["position_name", "position_title"]) ||
      position?.name ||
      "Unknown position",
    city:
      stringField(record, ["city", "location_city"]) ||
      nestedString(record, [["address", "city"], ["location", "city"], ["position", "location", "city"]]) ||
      position?.city ||
      "",
    state:
      stringField(record, ["state", "region", "location_state"]) ||
      nestedString(record, [["address", "state"], ["location", "state"], ["position", "location", "state"]]) ||
      position?.state ||
      "",
    score: numberField(record, ["score", "rating"]),
  };
}

async function breezyGet<T>(
  path: string,
  options?: { timeoutMs?: number },
): Promise<{ ok: true; data: T } | BreezyApiFailure> {
  const apiKey = getBreezyApiKey();
  if (!apiKey) return missingApiKeyFailure();

  let response: Response;
  try {
    response = await fetch(`${BREEZY_API_BASE}${path}`, {
      method: "GET",
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(options?.timeoutMs ?? BREEZY_REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to reach Breezy API",
      fetchedAt: new Date().toISOString(),
    };
  }

  const fetchedAt = new Date().toISOString();
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return {
      ok: false,
      error: `Breezy API returned non-JSON response (HTTP ${response.status})`,
      fetchedAt,
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      error: parseBreezyError(body, response.status),
      fetchedAt,
    };
  }

  return { ok: true, data: body as T };
}

function cached<T>(cache: Map<string, CacheEntry<T>>, key: string, load: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const existing = cache.get(key);
  if (existing && existing.expiresAt > now) return existing.promise;

  const promise = load();
  cache.set(key, {
    expiresAt: now + BREEZY_CACHE_TTL_MS,
    promise,
  });
  return promise;
}

export async function resolveBreezyCompany(): Promise<
  { ok: true; companyId: string; companyName?: string } | BreezyApiFailure
> {
  const override = getBreezyCompanyIdOverride();
  if (override) {
    return { ok: true, companyId: override };
  }

  const companiesResult = await breezyGet<BreezyCompany[]>("/companies");
  if (!companiesResult.ok) return companiesResult;

  const companies = Array.isArray(companiesResult.data) ? companiesResult.data : [];
  if (companies.length === 0) {
    return {
      ok: false,
      error: "No Breezy companies found for this API key.",
      fetchedAt: new Date().toISOString(),
    };
  }

  const first = companies[0];
  if (!first?._id) {
    return {
      ok: false,
      error: "Breezy company response is missing _id.",
      fetchedAt: new Date().toISOString(),
    };
  }

  return { ok: true, companyId: first._id, companyName: first.name };
}

export async function fetchBreezyJobs(state = "published"): Promise<BreezyJobsResult> {
  const cacheKey = `jobs:${state}`;
  return cached(jobsCache, cacheKey, () => fetchBreezyJobsUncached(state));
}

async function fetchBreezyJobsUncached(state = "published"): Promise<BreezyJobsResult> {
  const apiKey = getBreezyApiKey();
  if (!apiKey) return missingApiKeyFailure();

  const companyResult = await resolveBreezyCompany();
  if (!companyResult.ok) return companyResult;

  const { companyId, companyName } = companyResult;
  const params = new URLSearchParams({ state });
  const positionsResult = await breezyGet<RawBreezyPosition[]>(
    `/company/${encodeURIComponent(companyId)}/positions?${params.toString()}`,
  );

  if (!positionsResult.ok) return positionsResult;

  const jobs = (Array.isArray(positionsResult.data) ? positionsResult.data : [])
    .map(sanitizeJob)
    .filter((job): job is BreezyJob => Boolean(job));

  return {
    ok: true,
    jobs,
    fetchedAt: new Date().toISOString(),
    companyId,
    companyName,
    state,
  };
}

function parseCandidateAppliedDate(raw: string): Date | null {
  if (!raw.trim()) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Rolling 7×24h window ending at fetchedAt (matches Breezy “Last 7 Days” style filters). */
export function isPartialBreezyPositionSync(data: BreezyCandidatesSuccess): boolean {
  const total = data.totalPositionsAvailable ?? 0;
  const scanned = data.positionsScanned ?? 0;
  return total > 0 && scanned < total;
}

export function countCandidatesLast7Days(candidates: BreezyCandidate[], fetchedAtIso: string): number {
  const end = new Date(fetchedAtIso);
  if (Number.isNaN(end.getTime())) return 0;
  const start = new Date(end.getTime() - 7 * MS_PER_DAY);
  return candidates.filter((candidate) => {
    const applied = parseCandidateAppliedDate(candidate.appliedDate);
    return applied !== null && applied >= start && applied <= end;
  }).length;
}

export async function fetchBreezyCandidates(options?: {
  positionId?: string;
  state?: string;
  pageSize?: number;
  maxPages?: number;
  /** When omitted, all published positions are scanned. */
  maxPositions?: number;
}): Promise<BreezyCandidatesResult> {
  const positionId = options?.positionId?.trim() ?? "";
  const state = options?.state ?? "published";
  const pageSize = Math.max(1, Math.min(options?.pageSize ?? CANDIDATES_PAGE_SIZE, CANDIDATES_PAGE_SIZE));
  const maxPages = options?.maxPages
    ? Math.max(1, Math.min(options.maxPages, MAX_CANDIDATE_PAGES_PER_POSITION))
    : MAX_CANDIDATE_PAGES_PER_POSITION;
  const maxPositions = options?.maxPositions;
  const cacheKey = `candidates:v2:${positionId || "all"}:${state}:${pageSize}:${maxPages}:${maxPositions ?? "all"}`;
  return cached(candidatesCache, cacheKey, () => fetchBreezyCandidatesUncached(options));
}

type PositionScanResult = {
  candidates: BreezyCandidate[];
  incompletePagination: boolean;
  timedOut: boolean;
  failed: boolean;
  error?: string;
};

async function fetchCandidatesForPosition(
  companyId: string,
  position: BreezyJob,
  pageSize: number,
  maxPages: number,
  deadlineMs: number,
): Promise<PositionScanResult> {
  const posId = position.jobId;
  const candidates: BreezyCandidate[] = [];
  let incompletePagination = false;
  let timedOut = false;

  for (let page = 1; page <= maxPages; page += 1) {
    if (Date.now() >= deadlineMs) {
      timedOut = true;
      break;
    }

    const listResult = await breezyGet<RawBreezyCandidate[]>(
      `/company/${encodeURIComponent(companyId)}/position/${encodeURIComponent(posId)}/candidates?page_size=${pageSize}&page=${page}&sort=created`,
      { timeoutMs: BREEZY_CANDIDATE_REQUEST_TIMEOUT_MS },
    );
    if (!listResult.ok) {
      return {
        candidates,
        incompletePagination,
        timedOut,
        failed: true,
        error: listResult.error,
      };
    }

    const batch = Array.isArray(listResult.data) ? listResult.data : [];
    for (const candidate of batch) {
      const clean = sanitizeCandidate({ ...candidate, position_id: posId }, position);
      if (clean) candidates.push(clean);
    }
    if (batch.length < pageSize) break;
    if (page === maxPages) incompletePagination = true;
  }

  return { candidates, incompletePagination, timedOut, failed: false };
}

async function fetchBreezyCandidatesUncached(options?: {
  positionId?: string;
  state?: string;
  pageSize?: number;
  maxPages?: number;
  maxPositions?: number;
}): Promise<BreezyCandidatesResult> {
  const apiKey = getBreezyApiKey();
  if (!apiKey) return missingApiKeyFailure();

  const companyResult = await resolveBreezyCompany();
  if (!companyResult.ok) return companyResult;

  const { companyId, companyName } = companyResult;
  const positionId = options?.positionId?.trim();
  const fetchedAt = new Date().toISOString();
  const pageSize = Math.max(1, Math.min(options?.pageSize ?? CANDIDATES_PAGE_SIZE, CANDIDATES_PAGE_SIZE));
  const maxPages = options?.maxPages
    ? Math.max(1, Math.min(options.maxPages, MAX_CANDIDATE_PAGES_PER_POSITION))
    : MAX_CANDIDATE_PAGES_PER_POSITION;

  if (positionId) {
    const deadlineMs = Date.now() + BREEZY_CANDIDATE_SCAN_BUDGET_MS;
    const positionResult = await fetchCandidatesForPosition(
      companyId,
      { jobId: positionId, name: "", city: "", state: "", status: "published", createdDate: "", updatedDate: "" },
      pageSize,
      maxPages,
      deadlineMs,
    );
    if (positionResult.failed && positionResult.candidates.length === 0) {
      return {
        ok: false,
        error: positionResult.error ?? "Failed to load Breezy candidates for position",
        fetchedAt,
      };
    }

    const candidates = positionResult.candidates;
    return {
      ok: true,
      candidates,
      fetchedAt,
      companyId,
      companyName,
      positionId,
      totalPositionsAvailable: 1,
      positionsScanned: 1,
      totalCandidatesPulled: candidates.length,
      candidatesLast7Days: countCandidatesLast7Days(candidates, fetchedAt),
      truncated: positionResult.incompletePagination || positionResult.timedOut || positionResult.failed,
    };
  }

  const state = options?.state ?? "published";
  const jobsResult = await fetchBreezyJobs(state);
  if (!jobsResult.ok) return jobsResult;

  const positions = jobsResult.jobs.filter((position) => position.jobId);
  const totalPositionsAvailable = positions.length;
  const scanLimit =
    options?.maxPositions !== undefined
      ? Math.min(positions.length, Math.max(1, options.maxPositions))
      : positions.length;

  const candidates: BreezyCandidate[] = [];
  const warnings: string[] = [];
  const scanStartedAt = Date.now();
  const deadlineMs = scanStartedAt + BREEZY_CANDIDATE_SCAN_BUDGET_MS;
  let positionsScanned = 0;
  let incompletePagination = false;
  let timedOut = false;
  let scanFailed = false;

  for (let offset = 0; offset < scanLimit; offset += CANDIDATE_POSITION_CONCURRENCY) {
    if (Date.now() >= deadlineMs) {
      timedOut = true;
      warnings.push("Candidate scan stopped early to stay within the server runtime budget.");
      break;
    }

    const batch = positions.slice(offset, Math.min(offset + CANDIDATE_POSITION_CONCURRENCY, scanLimit));
    const results = await Promise.all(
      batch.map((position) => fetchCandidatesForPosition(companyId, position, pageSize, maxPages, deadlineMs)),
    );

    for (const result of results) {
      positionsScanned += 1;
      candidates.push(...result.candidates);
      if (result.incompletePagination) incompletePagination = true;
      if (result.timedOut) timedOut = true;
      if (result.failed) {
        scanFailed = true;
        if (result.error) warnings.push(result.error);
      }
    }

    if (timedOut) break;
  }

  const truncated =
    positionsScanned < totalPositionsAvailable || incompletePagination || timedOut || scanFailed;

  if (positionsScanned < totalPositionsAvailable && !timedOut) {
    warnings.push(
      `Scanned ${positionsScanned.toLocaleString()} of ${totalPositionsAvailable.toLocaleString()} published positions.`,
    );
  }

  return {
    ok: true,
    candidates,
    fetchedAt,
    companyId,
    companyName,
    totalPositionsAvailable,
    positionsScanned,
    totalCandidatesPulled: candidates.length,
    candidatesLast7Days: countCandidatesLast7Days(candidates, fetchedAt),
    truncated,
    warnings: warnings.length > 0 ? [...new Set(warnings)] : undefined,
  };
}

export function getJobs(state = "published"): Promise<BreezyJobsResult> {
  return fetchBreezyJobs(state);
}

export function getOpenJobs(): Promise<BreezyJobsResult> {
  return fetchBreezyJobs("published");
}

export function getCandidates(options?: {
  state?: string;
  pageSize?: number;
  maxPages?: number;
  maxPositions?: number;
}): Promise<BreezyCandidatesResult> {
  return fetchBreezyCandidates(options);
}

export function getCandidatesByPosition(
  positionId: string,
  options?: { pageSize?: number; maxPages?: number },
): Promise<BreezyCandidatesResult> {
  return fetchBreezyCandidates({ positionId, ...options });
}
