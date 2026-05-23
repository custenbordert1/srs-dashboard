/**
 * Read-only Breezy HR API client (GET requests only).
 * https://developer.breezy.hr/reference/overview
 */

import {
  buildBreezyJobLocationDiagnostics,
  normalizeBreezyJobLocation,
  type BreezyJobLocationSource,
} from "@/lib/breezy-job-location";
import {
  getBreezyApiKeySync,
  getBreezyCompanyIdSync,
  loadConfigSync,
} from "@/lib/config";
import { breezyConfigErrorMessage } from "@/lib/env-validation";
import {
  countRawBreezyListResponse,
  logCandidatesDebug,
  logFirstCandidateKeys,
} from "@/lib/candidates-debug";
import {
  extractResumeFieldsFromRaw,
  extractZipFromRaw,
} from "@/lib/recruiting-intelligence/resume-parser";

const BREEZY_API_BASE = "https://api.breezy.hr/v3";
const BREEZY_REQUEST_TIMEOUT_MS = 15_000;
const BREEZY_CANDIDATE_REQUEST_TIMEOUT_MS = 15_000;
/** Server scan budget — keep below route maxDuration (120s). */
const BREEZY_CANDIDATE_SCAN_BUDGET_MS = 115_000;
const BREEZY_GET_MAX_ATTEMPTS = 5;
const BREEZY_GET_RETRY_BASE_MS = 900;
const BREEZY_MAX_REQUESTS_PER_MINUTE = 40;
const breezyRequestTimestamps: number[] = [];
const BREEZY_CACHE_TTL_MS = 60_000;
/** Ok candidate snapshots — longer TTL for tab warm + reuse across dashboard opens. */
export const BREEZY_CANDIDATES_CACHE_TTL_MS = 300_000;
/** Default published positions scanned on fast-tier pass (recent jobs first). */
export const BREEZY_CANDIDATES_FAST_TIER_POSITIONS = 60;

export type BreezyCandidatesScanMode = "preview" | "fast" | "full" | "all";
/** Max published positions attempted during preview (within server budget). */
export const BREEZY_CANDIDATES_PREVIEW_MAX_POSITIONS = 30;
/** Stop preview scan once this many candidates are collected. */
export const BREEZY_CANDIDATES_PREVIEW_TARGET_CANDIDATES = 50;
/** Prefer preview to reach at least this many rows when Breezy has applicants. */
export const BREEZY_CANDIDATES_PREVIEW_MIN_CANDIDATES = 25;
/** Server budget for preview-tier aggregation (hard ceiling for tab first paint). */
export const BREEZY_CANDIDATES_PREVIEW_BUDGET_MS = 18_000;
/** Shorter delay between preview position batches to fit more jobs in budget. */
const CANDIDATE_PREVIEW_BATCH_DELAY_MS = 120;
const BREEZY_PARITY_CACHE_TTL_MS = 300_000;
/** Max closed positions scanned per parity run (recently updated first). */
const DEFAULT_MAX_CLOSED_POSITIONS = 40;
const DEFAULT_MAX_ARCHIVED_POSITIONS = 15;
/** Only consider closed/archived jobs updated within this many days before range end. */
const CLOSED_POSITION_RECENCY_DAYS = 120;

/** Candidates fetched per position during aggregation (Breezy max page_size is 50). */
const CANDIDATES_PAGE_SIZE = 50;
/** Safety cap per position to avoid runaway pagination (50 × 500 = 25k per job). */
const MAX_CANDIDATE_PAGES_PER_POSITION = 500;
/** Concurrent position candidate fetches during full sync (keep low to avoid 429s). */
const CANDIDATE_POSITION_CONCURRENCY = 3;
const CANDIDATE_POSITION_BATCH_DELAY_MS = 350;

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
  /** US state code from Breezy location — never pipeline status. */
  state: string;
  zip: string;
  displayLocation: string;
  /** Which raw Breezy field(s) supplied city/state. */
  locationSource: BreezyJobLocationSource;
  /** Breezy pipeline state (published, draft, closed, …). */
  status: string;
  createdDate: string;
  updatedDate: string;
  /** Breezy friendly_id when different from jobId (per-position API may require _id). */
  friendlyId?: string;
  candidateCount?: number;
  description?: string;
  payRate?: string;
  department?: string;
  source?: string;
};

export type BreezyCandidateResumeFields = {
  headline?: string;
  summary?: string;
  coverLetter?: string;
  resumeBody?: string;
  workHistoryText?: string;
  educationText?: string;
  customAttributesText?: string;
  tags?: string[];
};

export type BreezyCandidate = {
  candidateId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  source: string;
  stage: string;
  /** Breezy UI "Added Date" — always mapped from creation_date when present. */
  appliedDate: string;
  /** Raw Breezy creation_date (Added Date). */
  createdDate: string;
  /** Same as createdDate; explicit alias for Added Date comparisons. */
  addedDate: string;
  /** Breezy updated_date (last activity — not used for Added Date). */
  updatedDate: string;
  /** Which raw field populated addedDate/appliedDate. */
  addedDateSource: string;
  positionId: string;
  positionName: string;
  city: string;
  state: string;
  /** US postal code when present on candidate address. */
  zipCode: string;
  /** Combined resume/application text extracted from Breezy profile fields. */
  resumeText: string;
  /** True when resume or substantive application text was detected. */
  hasResume: boolean;
  /** Raw resume field fragments retained for scoring diagnostics. */
  resumeFields?: BreezyCandidateResumeFields;
  score?: number;
  /** Breezy position pipeline state when fetched (published, closed, archived, …). */
  positionPipelineStatus?: string;
};

export type BreezyJobsSuccess = {
  ok: true;
  jobs: BreezyJob[];
  fetchedAt: string;
  companyId: string;
  companyName?: string;
  state: string;
  locationDiagnostics?: import("@/lib/breezy-job-location").BreezyJobLocationDiagnostics;
};

export type { BreezyJobLocationDiagnostics, BreezyJobLocationSource } from "@/lib/breezy-job-location";

/** Counts explaining why fetched rows differ from Breezy UI filters. */
export type BreezySkippedCandidatesReason = {
  sanitizeRejected: number;
  missingAppliedDate: number;
  duplicateCandidateId: number;
  outsideDateRange: number;
  positionPaginationIncomplete: number;
  positionFetchFailed: number;
  positionScanTimedOut: number;
  positionsNotScanned: number;
  /** Set after territory guard (DM sessions). */
  territoryFiltered?: number;
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
  /** Alias for totalPositionsAvailable. */
  totalPositions?: number;
  positionsScanned?: number;
  /** Same as candidates.length — explicit for dashboard consumers. */
  totalCandidatesPulled?: number;
  /** Alias for totalCandidatesPulled (raw rows after dedupe). */
  totalCandidatesFetched?: number;
  /** Applicants with creation_date in the rolling 7 days before fetchedAt. */
  candidatesLast7Days?: number;
  /** Inclusive UTC calendar-day window (YYYY-MM-DD) when provided on the request. */
  dateRangeStart?: string;
  dateRangeEnd?: string;
  /** Candidates whose mapped appliedDate (Breezy creation_date) falls in dateRangeStart–dateRangeEnd. */
  candidatesInDateRange?: number;
  skippedCandidatesReason?: BreezySkippedCandidatesReason;
  /** Why API totals may differ from Breezy UI filters. */
  syncNotes?: string[];
  truncated?: boolean;
  warnings?: string[];
  /** Populated by Candidates sync layer (API + tab). */
  source?: string;
  sourcePath?: string;
  fromCache?: boolean;
  stale?: boolean;
  partial?: boolean;
  refreshError?: string;
  scanMode?: BreezyCandidatesScanMode;
  /** False while a background full-tier hydration is still expected. */
  hydrationComplete?: boolean;
  /** Preview-tier extraction diagnostics (normalized count === candidates.length). */
  previewDiagnostics?: BreezyPreviewScanDiagnostics;
  /** How candidates were loaded from Breezy (global list vs per-position scan). */
  candidateFetchStrategy?: string;
  candidateFetchEndpoint?: string;
};

export type BreezyPreviewScanDiagnostics = {
  rawBreezyResponseCount: number;
  extractedCandidatesCount: number;
  normalizedCandidateCount: number;
  servedFromServerCache: boolean;
  forceRequested: boolean;
  previewPageSize: number;
  previewMaxPages: number;
  jobsWithApplicantCount: number;
  jobsWithUnknownApplicantCount: number;
  jobsWithZeroApplicantCount: number;
  candidateFetchStrategy?: string;
  candidateFetchEndpoint?: string;
  globalPagesFetched?: number;
  /** Positions in the preview scan that returned at least one Breezy row. */
  previewCandidatePositionsFound?: number;
  /** Positions in the preview queue with candidateCount > 0 on the job list. */
  previewPositionsWithApplicants?: number;
  /** Positions scanned with zero extracted Breezy rows (non-failed). */
  previewEmptyPositions?: number;
  previewStoppedReason?:
    | "complete"
    | "server_budget"
    | "max_positions"
    | "target_candidates";
};

/** Normalize a raw Breezy candidate record (used by global list fetch). */
export function breezySanitizeCandidate(
  raw: RawBreezyCandidate,
  position?: Pick<BreezyJob, "jobId" | "name" | "city" | "state" | "status">,
): BreezyCandidate | null {
  return sanitizeCandidate(raw, position);
}

export type BreezyPositionStateCounts = {
  published: number;
  closed: number;
  archived: number;
  draft?: number;
  pending?: number;
};

export type BreezyPositionPipelineState = "published" | "closed" | "archived";

export type BreezyCandidatesDebugSuccess = BreezyCandidatesSuccess & {
  debug: true;
  parityScan: boolean;
  includeClosed: boolean;
  includeArchived: boolean;
  scanDurationMs: number;
  rateLimitHit: boolean;
  publishedCandidatesInRange: number;
  closedCandidatesInRange: number;
  archivedCandidatesInRange: number;
  positionsScannedByState: BreezyPositionStateCounts;
  positionsSkippedByState: BreezyPositionStateCounts;
  jobState: string;
  pageSize: number;
  maxPagesPerPosition: number;
  appliedDateField: string;
  candidatesInDateRangeSample: Array<{
    candidateId: string;
    name: string;
    appliedDate: string;
    createdDate: string;
    addedDate: string;
    updatedDate: string;
    addedDateSource: string;
    positionName: string;
    stage: string;
  }>;
  dateFieldBreakdown?: {
    inRangeByAddedDate: number;
    inRangeByCreatedDate: number;
    inRangeByUpdatedDate: number;
    last7CalendarDays: number;
  };
  uniqueCandidateIds: number;
  duplicateCandidateIds: number;
};

export type BreezyApiFailure = {
  ok: false;
  error: string;
  fetchedAt: string;
};

export type BreezyJobsResult = BreezyJobsSuccess | BreezyApiFailure;
export type BreezyCandidatesResult = BreezyCandidatesSuccess | BreezyApiFailure;
export type BreezyCandidatesDebugResult = BreezyCandidatesDebugSuccess | BreezyApiFailure;

/** Breezy UI "Added Date" = creation_date on list + full candidate objects. */
export const BREEZY_ADDED_DATE_PRIMARY_FIELD = "creation_date";
export const BREEZY_ADDED_DATE_FALLBACK_FIELDS = ["created_at", "created"] as const;
export const BREEZY_ADDED_DATE_FIELDS = [
  BREEZY_ADDED_DATE_PRIMARY_FIELD,
  ...BREEZY_ADDED_DATE_FALLBACK_FIELDS,
] as const;
/** Calendar-day comparisons for Added Date (Breezy accounts are US-based). */
export const BREEZY_ADDED_DATE_TIMEZONE =
  process.env.BREEZY_ADDED_DATE_TIMEZONE?.trim() || "America/Chicago";

/** Reference window used to validate parity with Breezy UI Added Date filters. */
export const BREEZY_UI_REFERENCE_DATE_RANGE = {
  start: "2026-05-12",
  end: "2026-05-20",
} as const;

type CacheEntry<T> = {
  expiresAt: number;
  promise: Promise<T>;
  /** Last resolved value for fast health probes (no await). */
  resolved?: T;
};

const jobsCache = new Map<string, CacheEntry<BreezyJobsResult>>();
const candidatesCache = new Map<string, CacheEntry<BreezyCandidatesResult>>();
const parityCache = new Map<string, CacheEntry<BreezyCandidatesDebugResult>>();

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

/** Breezy may return a bare array or `{ candidates: [...] }` depending on endpoint/version. */
/** Breezy positions list may be a bare array or `{ positions: [...] }`. */
export function extractRawBreezyPositionsFromListResponse(data: unknown): RawBreezyPosition[] {
  if (Array.isArray(data)) return data as RawBreezyPosition[];
  if (!data || typeof data !== "object") return [];
  const record = data as Record<string, unknown>;
  if (Array.isArray(record.positions)) return record.positions as RawBreezyPosition[];
  if (Array.isArray(record.data)) return record.data as RawBreezyPosition[];
  return [];
}

export function extractRawBreezyCandidatesFromListResponse(data: unknown): RawBreezyCandidate[] {
  if (Array.isArray(data)) return data as RawBreezyCandidate[];
  if (!data || typeof data !== "object") return [];

  const record = data as Record<string, unknown>;
  if (Array.isArray(record.candidates)) return record.candidates as RawBreezyCandidate[];
  if (Array.isArray(record.data)) return record.data as RawBreezyCandidate[];
  if (Array.isArray(record.results)) return record.results as RawBreezyCandidate[];
  if (Array.isArray(record.items)) return record.items as RawBreezyCandidate[];
  if (record.data && typeof record.data === "object") {
    const nested = record.data as Record<string, unknown>;
    if (Array.isArray(nested.candidates)) return nested.candidates as RawBreezyCandidate[];
  }
  return [];
}

/** @deprecated Prefer getBreezyApiKeySync() after loadConfig(). */
export function getBreezyApiKey(): string | undefined {
  return getBreezyApiKeySync();
}

export function getBreezyCompanyIdOverride(): string | undefined {
  return getBreezyCompanyIdSync();
}

function missingApiKeyFailure(): BreezyApiFailure {
  return {
    ok: false,
    error: breezyConfigErrorMessage(),
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

function payRateFromCustomAttributes(record: Record<string, unknown>): string {
  const attrs = record.custom_attributes;
  if (!Array.isArray(attrs)) return "";
  for (const item of attrs) {
    const attr = asRecord(item);
    if (!attr) continue;
    const name = stringField(attr, ["name", "label", "key"]);
    if (name.toLowerCase() !== "pay rate") continue;
    const value = stringField(attr, ["value", "text"]);
    if (value) return value;
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
  const breezyMongoId = stringField(record, ["_id"]);
  const friendlyId = stringField(record, ["friendly_id"]);
  const jobId =
    breezyMongoId || stringField(record, ["id"]) || friendlyId || stringField(record, ["_id", "id", "friendly_id"]);
  if (!jobId) return null;

  const location = normalizeBreezyJobLocation(record);

  const stats = asRecord(record.stats);
  const pipeline = asRecord(record.pipeline);
  const candidateCount =
    numberField(record, ["candidate_count", "candidates_count", "applicants_count", "applicant_count"]) ??
    numberField(stats, ["candidate_count", "candidates_count", "applicants_count", "count", "total"]) ??
    numberField(pipeline, ["candidate_count", "candidates_count"]);

  return {
    jobId,
    friendlyId: friendlyId && friendlyId !== jobId ? friendlyId : undefined,
    name: stringField(record, ["name", "title"]) || "Untitled job",
    city: location.city,
    state: location.state,
    zip: location.zip,
    displayLocation: location.displayLocation,
    locationSource: location.locationSource,
    status: location.pipelineStatus,
    createdDate: stringField(record, ["creation_date", "created_at", "created"]) || "",
    updatedDate: stringField(record, ["updated_date", "updated_at", "modified_at"]) || "",
    candidateCount,
    description: stringField(record, ["description", "summary", "job_description"]),
    payRate:
      payRateFromCustomAttributes(record) ||
      nestedString(record, [["compensation", "value"], ["salary", "value"]]) ||
      stringField(record, ["pay_rate", "compensation", "salary"]),
    department:
      nestedString(record, [["department", "name"]]) || stringField(record, ["department", "category"]),
    source: stringField(record, ["origin", "source"]) || "Breezy",
  };
}

function extractBreezyAddedDate(record: Record<string, unknown>): {
  addedDate: string;
  createdDate: string;
  updatedDate: string;
  addedDateSource: string;
} {
  const updatedDate = stringField(record, ["updated_date", "updated_at", "modified_at"]) || "";
  for (const field of BREEZY_ADDED_DATE_FIELDS) {
    const value = stringField(record, [field]);
    if (value) {
      return {
        addedDate: value,
        createdDate: value,
        updatedDate,
        addedDateSource: field,
      };
    }
  }
  return { addedDate: "", createdDate: "", updatedDate, addedDateSource: "" };
}

function sanitizeCandidate(
  raw: RawBreezyCandidate,
  position: Pick<BreezyJob, "jobId" | "name" | "city" | "state" | "status"> | undefined,
): BreezyCandidate | null {
  const record = raw as Record<string, unknown>;
  const candidateId = stringField(record, ["_id", "id"]);
  if (!candidateId) return null;

  const explicitFirstName = stringField(record, ["first_name", "firstName"]);
  const explicitLastName = stringField(record, ["last_name", "lastName"]);
  const fallbackName = splitName(stringField(record, ["name", "full_name"]));
  const dates = extractBreezyAddedDate(record);
  const resumeFields = extractResumeFieldsFromRaw(record);
  const zipCode = extractZipFromRaw(record);
  const resumeParts = [
    resumeFields?.headline,
    resumeFields?.summary,
    resumeFields?.coverLetter,
    resumeFields?.resumeBody,
    resumeFields?.workHistoryText,
    resumeFields?.educationText,
    resumeFields?.customAttributesText,
    resumeFields?.tags?.join(" "),
  ].filter(Boolean);
  const resumeText = resumeParts.join("\n").trim();
  const hasResume = resumeText.length >= 80 || (resumeText.length >= 40 && resumeParts.length >= 2);

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
    appliedDate: dates.addedDate,
    createdDate: dates.createdDate,
    addedDate: dates.addedDate,
    updatedDate: dates.updatedDate,
    addedDateSource: dates.addedDateSource,
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
    zipCode,
    resumeText,
    hasResume,
    resumeFields,
    score: numberField(record, ["score", "rating"]),
    positionPipelineStatus: position?.status || "",
  };
}

async function breezyGet<T>(
  path: string,
  options?: { timeoutMs?: number },
): Promise<{ ok: true; data: T } | BreezyApiFailure> {
  const apiKey = getBreezyApiKeySync();
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
    const error = parseBreezyError(body, response.status);
    if (response.status === 429 || error.toLowerCase().includes("rate limit")) {
      markBreezyRateLimitHit();
    }
    return {
      ok: false,
      error,
      fetchedAt,
    };
  }

  return { ok: true, data: body as T };
}

let breezyRateLimitHitFlag = false;

function resetBreezyRateLimitFlag(): void {
  breezyRateLimitHitFlag = false;
}

function markBreezyRateLimitHit(): void {
  breezyRateLimitHitFlag = true;
}

export function wasBreezyRateLimitHit(): boolean {
  return breezyRateLimitHitFlag;
}

function isRetryableBreezyError(error: string): boolean {
  const lower = error.toLowerCase();
  return (
    lower.includes("rate limit") ||
    lower.includes("429") ||
    lower.includes("unavailable") ||
    lower.includes("timeout") ||
    lower.includes("timed out")
  );
}

function breezyRetryDelayMs(attempt: number): number {
  return BREEZY_GET_RETRY_BASE_MS * 2 ** attempt;
}

async function throttleBreezyRequest(): Promise<void> {
  const now = Date.now();
  while (breezyRequestTimestamps.length > 0 && now - (breezyRequestTimestamps[0] ?? now) >= 60_000) {
    breezyRequestTimestamps.shift();
  }
  if (breezyRequestTimestamps.length >= BREEZY_MAX_REQUESTS_PER_MINUTE) {
    const oldest = breezyRequestTimestamps[0] ?? now;
    const waitMs = 60_000 - (now - oldest) + 50;
    await sleep(waitMs);
    return throttleBreezyRequest();
  }
  breezyRequestTimestamps.push(Date.now());
}

async function breezyGetWithRetry<T>(
  path: string,
  options?: { timeoutMs?: number },
): Promise<{ ok: true; data: T } | BreezyApiFailure> {
  let lastFailure: BreezyApiFailure | null = null;
  for (let attempt = 0; attempt < BREEZY_GET_MAX_ATTEMPTS; attempt += 1) {
    await throttleBreezyRequest();
    const result = await breezyGet<T>(path, options);
    if (result.ok) return result;
    lastFailure = result;
    if (!isRetryableBreezyError(result.error) || attempt === BREEZY_GET_MAX_ATTEMPTS - 1) {
      return result;
    }
    await new Promise((resolve) => setTimeout(resolve, breezyRetryDelayMs(attempt)));
  }
  return lastFailure ?? missingApiKeyFailure();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isMissingApiKeyResult(result: unknown): boolean {
  return (
    typeof result === "object" &&
    result !== null &&
    "ok" in result &&
    (result as { ok: boolean }).ok === false &&
    "error" in result &&
    typeof (result as { error: string }).error === "string" &&
    (result as { error: string }).error.includes("Breezy API key")
  );
}

function cached<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
  load: () => Promise<T>,
  ttlMs = BREEZY_CACHE_TTL_MS,
): Promise<T> {
  const now = Date.now();
  const existing = cache.get(key);
  if (existing && existing.expiresAt > now) return existing.promise;

  const promise = load().then((result) => {
    if (isMissingApiKeyResult(result)) {
      cache.delete(key);
    } else {
      const entry = cache.get(key);
      if (entry) entry.resolved = result;
    }
    return result;
  });
  cache.set(key, {
    expiresAt: now + ttlMs,
    promise,
  });
  return promise;
}

/** Cache key for the default fast published candidates scan. */
export function breezyFastCandidatesCacheKey(options?: {
  positionId?: string;
  state?: string;
  pageSize?: number;
  maxPages?: number;
  maxPositions?: number;
  scanMode?: BreezyCandidatesScanMode;
}): string {
  const positionId = options?.positionId?.trim() ?? "";
  const state = options?.state ?? "published";
  const scanMode = options?.scanMode ?? "all";
  const pageSize = Math.max(1, Math.min(options?.pageSize ?? CANDIDATES_PAGE_SIZE, CANDIDATES_PAGE_SIZE));
  const maxPages = options?.maxPages
    ? Math.max(1, Math.min(options.maxPages, MAX_CANDIDATE_PAGES_PER_POSITION))
    : MAX_CANDIDATE_PAGES_PER_POSITION;
  const maxPositions = options?.maxPositions;
  return `candidates:fast:v6:${scanMode}:${positionId || "all"}:${state}:${pageSize}:${maxPages}:${maxPositions ?? "all"}`;
}

/** Returns last cached scan without starting a new Breezy aggregation. */
export function peekBreezyCandidatesCache(options?: {
  positionId?: string;
  state?: string;
  pageSize?: number;
  maxPages?: number;
  maxPositions?: number;
  scanMode?: BreezyCandidatesScanMode;
}): BreezyCandidatesResult | null {
  const scanOrder: BreezyCandidatesScanMode[] = options?.scanMode
    ? [options.scanMode]
    : ["preview", "fast", "all"];
  for (const scanMode of scanOrder) {
    const key = breezyFastCandidatesCacheKey({ ...options, scanMode });
    const entry = candidatesCache.get(key);
    if (!entry || entry.expiresAt <= Date.now() || !entry.resolved) continue;
    if (isPopulatedCandidatesResult(entry.resolved)) return entry.resolved;
    if (scanMode !== "preview" && scanMode !== "fast" && entry.resolved.ok) return entry.resolved;
  }
  return null;
}

export type BreezyCandidatesHealthProbe = BreezyCandidatesResult & {
  healthProbe?: boolean;
  fromCache?: boolean;
  partial?: boolean;
};

export function buildBreezyCandidatesHealthProbe(
  cached: BreezyCandidatesResult | null,
  company: { companyId: string; companyName?: string },
): BreezyCandidatesHealthProbe {
  if (cached?.ok) {
    return { ...cached, healthProbe: true, fromCache: true };
  }
  if (cached && !cached.ok) {
    return { ...cached, healthProbe: true, fromCache: true };
  }

  const fetchedAt = new Date().toISOString();
  return {
    ok: true,
    partial: true,
    healthProbe: true,
    fromCache: false,
    candidates: [],
    fetchedAt,
    companyId: company.companyId,
    companyName: company.companyName,
    totalPositionsAvailable: 0,
    totalPositions: 0,
    positionsScanned: 0,
    totalCandidatesPulled: 0,
    totalCandidatesFetched: 0,
    candidatesLast7Days: 0,
    truncated: false,
    warnings: [
      "No warmed Breezy candidate cache — health probe did not start a full position scan.",
      "Open the recruiting dashboard or run Full Breezy parity check to warm data.",
    ],
    syncNotes: ["Lightweight health probe only (published fast-scan cache)."],
  };
}

function emptyStateCounts(): BreezyPositionStateCounts {
  return { published: 0, closed: 0, archived: 0 };
}

function parseJobUpdatedDate(job: BreezyJob): Date | null {
  return parseCandidateAppliedDate(job.updatedDate || job.createdDate);
}

/** Published jobs most recently updated first (open roles prioritized for fast-tier scan). */
export function sortPublishedJobsByRecentUpdated(jobs: BreezyJob[]): BreezyJob[] {
  return [...jobs]
    .filter((job) => job.jobId)
    .sort((a, b) => {
      const tb = parseJobUpdatedDate(b)?.getTime() ?? 0;
      const ta = parseJobUpdatedDate(a)?.getTime() ?? 0;
      return tb - ta;
    });
}

/** Preview scan: applicantCount DESC, then updated_at DESC (unknown counts sort last). */
export function sortPublishedJobsForPreviewScan(jobs: BreezyJob[]): BreezyJob[] {
  return [...jobs]
    .filter((job) => job.jobId)
    .sort((a, b) => {
      const countB = b.candidateCount ?? -1;
      const countA = a.candidateCount ?? -1;
      if (countB !== countA) return countB - countA;
      const tb = parseJobUpdatedDate(b)?.getTime() ?? 0;
      const ta = parseJobUpdatedDate(a)?.getTime() ?? 0;
      return tb - ta;
    });
}

export function countPreviewJobApplicantBuckets(jobs: BreezyJob[]): {
  jobsWithApplicantCount: number;
  jobsWithUnknownApplicantCount: number;
  jobsWithZeroApplicantCount: number;
} {
  let jobsWithApplicantCount = 0;
  let jobsWithUnknownApplicantCount = 0;
  let jobsWithZeroApplicantCount = 0;
  for (const job of jobs) {
    const count = job.candidateCount;
    if (count === undefined) jobsWithUnknownApplicantCount += 1;
    else if (count > 0) jobsWithApplicantCount += 1;
    else jobsWithZeroApplicantCount += 1;
  }
  return { jobsWithApplicantCount, jobsWithUnknownApplicantCount, jobsWithZeroApplicantCount };
}

function isPopulatedCandidatesResult(result: BreezyCandidatesResult): result is BreezyCandidatesSuccess {
  return result.ok === true && result.candidates.length > 0;
}

function shouldPersistServerCandidatesCache(
  scanMode: BreezyCandidatesScanMode,
  result: BreezyCandidatesSuccess,
): boolean {
  if (scanMode === "preview" || scanMode === "fast") {
    return result.candidates.length > 0;
  }
  return true;
}

function selectRecentPositions(
  jobs: BreezyJob[],
  dateRangeEnd: string,
  maxPositions: number,
  recencyDays: number,
): { selected: BreezyJob[]; skipped: number } {
  const end = parseCandidateAppliedDate(`${dateRangeEnd}T12:00:00.000Z`) ?? new Date();
  const cutoff = new Date(end.getTime() - recencyDays * MS_PER_DAY);
  const sorted = [...jobs]
    .filter((job) => job.jobId)
    .sort((a, b) => {
      const tb = parseJobUpdatedDate(b)?.getTime() ?? 0;
      const ta = parseJobUpdatedDate(a)?.getTime() ?? 0;
      return tb - ta;
    });
  const recent = sorted.filter((job) => {
    const updated = parseJobUpdatedDate(job);
    return updated !== null && updated >= cutoff;
  });
  const selected = recent.slice(0, maxPositions);
  return { selected, skipped: Math.max(0, sorted.length - selected.length) };
}

export function countCandidatesInRangeForPipelineStatus(
  candidates: BreezyCandidate[],
  rangeStart: string,
  rangeEnd: string,
  pipelineStatus: BreezyPositionPipelineState,
): number {
  return candidates.filter(
    (candidate) =>
      (candidate.positionPipelineStatus || "published") === pipelineStatus &&
      isAppliedDateInRange(candidate.addedDate || candidate.appliedDate, rangeStart, rangeEnd),
  ).length;
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

function ensureBreezyConfigLoaded(): void {
  loadConfigSync();
}

export async function fetchBreezyJobs(state = "published"): Promise<BreezyJobsResult> {
  ensureBreezyConfigLoaded();
  if (!getBreezyApiKeySync()) return missingApiKeyFailure();
  const cacheKey = `jobs:${state}`;
  return cached(jobsCache, cacheKey, () => fetchBreezyJobsUncached(state));
}

async function fetchBreezyJobsUncached(state = "published"): Promise<BreezyJobsResult> {
  ensureBreezyConfigLoaded();
  const apiKey = getBreezyApiKeySync();
  if (!apiKey) return missingApiKeyFailure();

  const companyResult = await resolveBreezyCompany();
  if (!companyResult.ok) return companyResult;

  const { companyId, companyName } = companyResult;
  const params = new URLSearchParams({ state });
  const positionsResult = await breezyGet<RawBreezyPosition[]>(
    `/company/${encodeURIComponent(companyId)}/positions?${params.toString()}`,
  );

  if (!positionsResult.ok) return positionsResult;

  const rawPositions = extractRawBreezyPositionsFromListResponse(positionsResult.data);
  const jobs = rawPositions.map(sanitizeJob).filter((job): job is BreezyJob => Boolean(job));

  return {
    ok: true,
    jobs,
    fetchedAt: new Date().toISOString(),
    companyId,
    companyName,
    state,
    locationDiagnostics: buildBreezyJobLocationDiagnostics(jobs),
  };
}

function parseCandidateAppliedDate(raw: string): Date | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^\d{10,13}$/.test(trimmed)) {
    const numeric = Number(trimmed);
    const ms = trimmed.length >= 13 ? numeric : numeric * 1000;
    const epochDate = new Date(ms);
    return Number.isNaN(epochDate.getTime()) ? null : epochDate;
  }
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function calendarDateKeyInTimezone(
  date: Date,
  timeZone: string = BREEZY_ADDED_DATE_TIMEZONE,
): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function parseDateRangeParam(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed || !/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return undefined;
  return trimmed;
}

export function isAppliedDateInRange(
  appliedDate: string,
  rangeStart: string,
  rangeEnd: string,
  timeZone: string = BREEZY_ADDED_DATE_TIMEZONE,
): boolean {
  const applied = parseCandidateAppliedDate(appliedDate);
  if (!applied) return false;
  const key = calendarDateKeyInTimezone(applied, timeZone);
  return key >= rangeStart && key <= rangeEnd;
}

/** Count using updated_date instead of Added Date (diagnostic only). */
export function countCandidatesInDateRangeByUpdatedDate(
  candidates: BreezyCandidate[],
  rangeStart: string,
  rangeEnd: string,
  timeZone: string = BREEZY_ADDED_DATE_TIMEZONE,
): number {
  return candidates.filter((candidate) =>
    isAppliedDateInRange(candidate.updatedDate, rangeStart, rangeEnd, timeZone),
  ).length;
}

export function countCandidatesInDateRange(
  candidates: BreezyCandidate[],
  rangeStart: string,
  rangeEnd: string,
): number {
  return candidates.filter((candidate) =>
    isAppliedDateInRange(candidate.appliedDate, rangeStart, rangeEnd),
  ).length;
}

function buildSkippedReason(input: {
  sanitizeRejected: number;
  missingAppliedDate: number;
  duplicateCandidateId: number;
  outsideDateRange: number;
  positionPaginationIncomplete: number;
  positionFetchFailed: number;
  positionScanTimedOut: number;
  positionsNotScanned: number;
}): BreezySkippedCandidatesReason {
  return { ...input };
}

function buildBreezySyncNotes(input: {
  truncated: boolean;
  totalPositions: number;
  positionsScanned: number;
  jobState: string;
  dateRangeStart?: string;
  dateRangeEnd?: string;
  skipped: BreezySkippedCandidatesReason;
}): string[] {
  const notes = [
    "Breezy REST API exposes candidates per position; parity mode can add recently updated closed/archived jobs when requested.",
    `Mapped appliedDate uses Breezy fields (priority): ${BREEZY_ADDED_DATE_FIELDS.join(", ")} — matches Breezy UI "Added Date" (creation_date).`,
    `Primary scan uses state=${input.jobState} published positions.`,
    `Dashboard Added Date filters use inclusive calendar days in ${BREEZY_ADDED_DATE_TIMEZONE} (override via BREEZY_ADDED_DATE_TIMEZONE).`,
  ];
  if (input.skipped.positionsNotScanned > 0) {
    notes.push(
      `${input.skipped.positionsNotScanned} published position(s) were not scanned (runtime budget or max_positions cap) — counts will be lower than Breezy UI.`,
    );
  }
  if (input.skipped.positionPaginationIncomplete > 0) {
    notes.push(
      `${input.skipped.positionPaginationIncomplete} position(s) hit the per-job page cap — increase max_pages if a job has more than ${MAX_CANDIDATE_PAGES_PER_POSITION * CANDIDATES_PAGE_SIZE} candidates.`,
    );
  }
  if (input.skipped.duplicateCandidateId > 0) {
    notes.push(
      `${input.skipped.duplicateCandidateId} duplicate candidateId row(s) removed after merge — Breezy UI may count unique applicants differently across jobs.`,
    );
  }
  if (input.dateRangeStart && input.dateRangeEnd) {
    notes.push(
      `Date range ${input.dateRangeStart}–${input.dateRangeEnd} (${BREEZY_ADDED_DATE_TIMEZONE}) on creation_date: ${input.skipped.outsideDateRange} fetched candidate(s) fall outside this window.`,
    );
  }
  if (input.truncated) {
    notes.push("Sync marked truncated=true — treat counts as a lower bound vs full Breezy UI exports.");
  }
  return notes;
}

type DedupeResult = {
  candidates: BreezyCandidate[];
  duplicateCandidateId: number;
};

function dedupeCandidatesById(candidates: BreezyCandidate[]): DedupeResult {
  const seen = new Set<string>();
  const unique: BreezyCandidate[] = [];
  let duplicateCandidateId = 0;
  for (const candidate of candidates) {
    if (seen.has(candidate.candidateId)) {
      duplicateCandidateId += 1;
      continue;
    }
    seen.add(candidate.candidateId);
    unique.push(candidate);
  }
  return { candidates: unique, duplicateCandidateId };
}

function summarizeCandidates(
  rawCandidates: BreezyCandidate[],
  options: {
    fetchedAt: string;
    dateRangeStart?: string;
    dateRangeEnd?: string;
    sanitizeRejected: number;
    positionPaginationIncomplete: number;
    positionFetchFailed: number;
    positionScanTimedOut: number;
    positionsNotScanned: number;
  },
): {
  candidates: BreezyCandidate[];
  skippedCandidatesReason: BreezySkippedCandidatesReason;
  candidatesInDateRange?: number;
} {
  const { candidates, duplicateCandidateId } = dedupeCandidatesById(rawCandidates);
  let missingAppliedDate = 0;
  let outsideDateRange = 0;

  for (const candidate of candidates) {
    if (!candidate.addedDate.trim() && !candidate.appliedDate.trim()) missingAppliedDate += 1;
    if (
      options.dateRangeStart &&
      options.dateRangeEnd &&
      candidate.appliedDate.trim() &&
      !isAppliedDateInRange(candidate.appliedDate, options.dateRangeStart, options.dateRangeEnd)
    ) {
      outsideDateRange += 1;
    }
  }

  const skippedCandidatesReason = buildSkippedReason({
    sanitizeRejected: options.sanitizeRejected,
    missingAppliedDate,
    duplicateCandidateId,
    outsideDateRange,
    positionPaginationIncomplete: options.positionPaginationIncomplete,
    positionFetchFailed: options.positionFetchFailed,
    positionScanTimedOut: options.positionScanTimedOut,
    positionsNotScanned: options.positionsNotScanned,
  });

  return {
    candidates,
    skippedCandidatesReason,
    candidatesInDateRange:
      options.dateRangeStart && options.dateRangeEnd
        ? countCandidatesInDateRange(candidates, options.dateRangeStart, options.dateRangeEnd)
        : undefined,
  };
}

export function isPartialBreezyPositionSync(data: BreezyCandidatesSuccess): boolean {
  const total = data.totalPositionsAvailable ?? 0;
  const scanned = data.positionsScanned ?? 0;
  return (
    Boolean(data.truncated) ||
    (data.skippedCandidatesReason?.positionFetchFailed ?? 0) > 0 ||
    (data.skippedCandidatesReason?.positionsNotScanned ?? 0) > 0 ||
    (total > 0 && scanned < total)
  );
}

function daysBetweenDateKeys(startKey: string, endKey: string): number {
  const start = new Date(`${startKey}T12:00:00.000Z`).getTime();
  const end = new Date(`${endKey}T12:00:00.000Z`).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return Number.NaN;
  return Math.round((end - start) / MS_PER_DAY);
}

/** Inclusive last N calendar days ending on reference day (Breezy “Last 7 Days”). */
export function countCandidatesLastCalendarDays(
  candidates: BreezyCandidate[],
  referenceIso: string,
  dayCount = 7,
  timeZone: string = BREEZY_ADDED_DATE_TIMEZONE,
): number {
  const reference = parseCandidateAppliedDate(referenceIso) ?? new Date(referenceIso);
  if (Number.isNaN(reference.getTime())) return 0;
  const endKey = calendarDateKeyInTimezone(reference, timeZone);
  return candidates.filter((candidate) => {
    const applied = parseCandidateAppliedDate(candidate.addedDate || candidate.appliedDate);
    if (!applied) return false;
    const key = calendarDateKeyInTimezone(applied, timeZone);
    const delta = daysBetweenDateKeys(key, endKey);
    return !Number.isNaN(delta) && delta >= 0 && delta < dayCount;
  }).length;
}

/** Rolling 7 calendar days ending on fetchedAt (matches Breezy Added Date filters). */
export function countCandidatesLast7Days(
  candidates: BreezyCandidate[],
  fetchedAtIso: string,
  timeZone: string = BREEZY_ADDED_DATE_TIMEZONE,
): number {
  return countCandidatesLastCalendarDays(candidates, fetchedAtIso, 7, timeZone);
}

type ScanBatchStats = {
  candidates: BreezyCandidate[];
  warnings: string[];
  positionsScanned: number;
  positionsAvailable: number;
  positionsSkipped: number;
  sanitizeRejected: number;
  positionPaginationIncomplete: number;
  positionFetchFailed: number;
  positionScanTimedOut: number;
  truncated: boolean;
  rawBreezyResponseCount: number;
  extractedCandidatesCount: number;
  previewCandidatePositionsFound?: number;
  previewEmptyPositions?: number;
  previewStoppedReason?: BreezyPreviewScanDiagnostics["previewStoppedReason"];
};

export async function fetchBreezyCandidates(options?: {
  positionId?: string;
  state?: string;
  pageSize?: number;
  maxPages?: number;
  /** When omitted, all published positions are scanned (unless scanMode is fast/full). */
  maxPositions?: number;
  /** Count only — fast published scan does not filter fetches by date. */
  dateRangeStart?: string;
  dateRangeEnd?: string;
  /** Bypass in-memory server cache for this request. */
  force?: boolean;
  /**
   * preview — first ~50 candidates from ~5 recent positions (immediate UI).
   * fast — recent ~60 published positions (partial ok).
   * full — remaining positions merged with last fast-tier snapshot.
   * all — legacy full scan (other dashboard APIs).
   */
  scanMode?: BreezyCandidatesScanMode;
}): Promise<BreezyCandidatesResult> {
  ensureBreezyConfigLoaded();
  if (!getBreezyApiKeySync()) {
    const {
      withCandidatesFailureMeta,
    } = await import("@/lib/breezy-candidates-sync");
    return withCandidatesFailureMeta(
      "Breezy API key is not configured.",
      new Date().toISOString(),
    );
  }
  const positionId = options?.positionId?.trim() ?? "";
  const state = options?.state ?? "published";
  const pageSize = Math.max(1, Math.min(options?.pageSize ?? CANDIDATES_PAGE_SIZE, CANDIDATES_PAGE_SIZE));
  const maxPages = options?.maxPages
    ? Math.max(1, Math.min(options.maxPages, MAX_CANDIDATE_PAGES_PER_POSITION))
    : MAX_CANDIDATE_PAGES_PER_POSITION;
  const maxPositions = options?.maxPositions;
  const rangeStart = parseDateRangeParam(options?.dateRangeStart);
  const rangeEnd = parseDateRangeParam(options?.dateRangeEnd);
  const scanMode = options?.scanMode ?? "all";
  const cacheKey = breezyFastCandidatesCacheKey({
    positionId,
    state,
    pageSize,
    maxPages,
    maxPositions,
    scanMode,
  });
  const fastTierCacheKey = breezyFastCandidatesCacheKey({
    positionId,
    state,
    pageSize,
    maxPages,
    maxPositions,
    scanMode: "fast",
  });

  const {
    getStaleOkCandidatesSnapshot,
    isPartialCandidatesSync,
    rememberOkCandidatesSnapshot,
    withCandidatesFailureMeta,
    withCandidatesSyncMeta,
  } = await import("@/lib/breezy-candidates-sync");

  if (!options?.force) {
    const fresh = candidatesCache.get(cacheKey);
    if (fresh && fresh.expiresAt > Date.now() && fresh.resolved?.ok) {
      const cachedResult = fresh.resolved;
      const canServeCached =
        (scanMode !== "preview" && scanMode !== "fast") || cachedResult.candidates.length > 0;
      if (canServeCached) {
        logCandidatesDebug("preview_served_from_server_cache", cachedResult.candidates.length, {
          scanMode,
          forceRequested: false,
          normalizedCandidateCount: cachedResult.candidates.length,
          rawBreezyResponseCount: cachedResult.previewDiagnostics?.rawBreezyResponseCount,
          extractedCandidatesCount: cachedResult.previewDiagnostics?.extractedCandidatesCount,
        });
        return withCandidatesSyncMeta(
          {
            ...cachedResult,
            previewDiagnostics: cachedResult.previewDiagnostics
              ? { ...cachedResult.previewDiagnostics, servedFromServerCache: true, forceRequested: false }
              : cachedResult.previewDiagnostics,
          },
          { fromCache: true, stale: false },
        );
      }
      logCandidatesDebug("preview_skip_empty_server_cache", 0, {
        scanMode,
        forceRequested: false,
        positionsScanned: cachedResult.positionsScanned ?? 0,
      });
    }
  } else {
    candidatesCache.delete(cacheKey);
    logCandidatesDebug("preview_force_server_refetch", 0, { scanMode, forceRequested: true });
  }

  const result = await cached(
    candidatesCache,
    cacheKey,
    () =>
      fetchBreezyCandidatesFastUncached({
        ...options,
        state,
        pageSize,
        maxPages,
        maxPositions,
        dateRangeStart: rangeStart,
        dateRangeEnd: rangeEnd,
        scanMode,
      }),
    BREEZY_CANDIDATES_CACHE_TTL_MS,
  );

  if (result.ok) {
    const {
      mergeCandidatesSnapshots,
    } = await import("@/lib/breezy-candidates-sync");
    let payload = result;
    if (scanMode === "full") {
      const fastBase = getStaleOkCandidatesSnapshot(fastTierCacheKey);
      if (fastBase) {
        payload = mergeCandidatesSnapshots(fastBase, result);
      }
    }
    const enriched = withCandidatesSyncMeta(payload, {
      fromCache: false,
      stale: false,
      partial: isPartialCandidatesSync(payload),
    });
    if (shouldPersistServerCandidatesCache(scanMode, enriched)) {
      rememberOkCandidatesSnapshot(cacheKey, enriched);
    }
    if (
      (scanMode === "fast" || scanMode === "preview") &&
      enriched.candidates.length > 0
    ) {
      rememberOkCandidatesSnapshot(fastTierCacheKey, enriched);
    }
    if (!enriched.partial) {
      rememberOkCandidatesSnapshot(
        breezyFastCandidatesCacheKey({
          positionId,
          state,
          pageSize,
          maxPages,
          maxPositions,
          scanMode: "all",
        }),
        enriched,
      );
    }
    return enriched;
  }

  const stale = getStaleOkCandidatesSnapshot(cacheKey);
  if (stale && ((scanMode !== "preview" && scanMode !== "fast") || stale.candidates.length > 0)) {
    const { logBreezyCandidatesOps } = await import("@/lib/breezy-candidates-ops-log");
    logBreezyCandidatesOps("server", "fallback", {
      scanMode,
      fallbackSource: "server_memory_stale_snapshot",
      candidateCount: stale.candidates.length,
      refreshError: result.error,
    });
    return withCandidatesSyncMeta(stale, {
      fromCache: true,
      stale: true,
      refreshError: result.error,
      partial: stale.partial ?? isPartialCandidatesSync(stale),
    });
  }

  return withCandidatesFailureMeta(result.error, result.fetchedAt);
}

export async function fetchBreezyCandidatesDebug(options: {
  dateRangeStart: string;
  dateRangeEnd: string;
  includeClosed?: boolean;
  includeArchived?: boolean;
  pageSize?: number;
  maxPages?: number;
  maxClosedPositions?: number;
  maxArchivedPositions?: number;
  force?: boolean;
}): Promise<BreezyCandidatesDebugResult> {
  ensureBreezyConfigLoaded();
  if (!getBreezyApiKeySync()) return missingApiKeyFailure();

  const rangeStart = parseDateRangeParam(options.dateRangeStart);
  const rangeEnd = parseDateRangeParam(options.dateRangeEnd);
  if (!rangeStart || !rangeEnd) {
    return {
      ok: false,
      error: "Invalid date range. Use from=YYYY-MM-DD&to=YYYY-MM-DD query parameters.",
      fetchedAt: new Date().toISOString(),
    };
  }

  const includeClosed = options.includeClosed ?? false;
  const includeArchived = options.includeArchived ?? false;
  const cacheKey = `parity:v1:${rangeStart}:${rangeEnd}:c${includeClosed ? 1 : 0}:a${includeArchived ? 1 : 0}`;

  if (options.force) {
    parityCache.delete(cacheKey);
  }

  return cached(
    parityCache,
    cacheKey,
    () =>
      fetchBreezyCandidatesParityUncached({
        dateRangeStart: rangeStart,
        dateRangeEnd: rangeEnd,
        includeClosed,
        includeArchived,
        pageSize: options.pageSize,
        maxPages: options.maxPages,
        maxClosedPositions: options.maxClosedPositions,
        maxArchivedPositions: options.maxArchivedPositions,
      }),
    BREEZY_PARITY_CACHE_TTL_MS,
  );
}

type PositionScanResult = {
  candidates: BreezyCandidate[];
  incompletePagination: boolean;
  timedOut: boolean;
  failed: boolean;
  sanitizeRejected: number;
  rawBreezyResponseCount: number;
  extractedCandidatesCount: number;
  error?: string;
};

async function fetchCandidatesForPosition(
  companyId: string,
  position: BreezyJob,
  pageSize: number,
  maxPages: number,
  deadlineMs: number,
  dateRangeStart?: string,
  dateRangeEnd?: string,
): Promise<PositionScanResult> {
  const posId = position.jobId;
  const candidates: BreezyCandidate[] = [];
  let incompletePagination = false;
  let timedOut = false;
  let sanitizeRejected = 0;
  let rawBreezyResponseCount = 0;
  let extractedCandidatesCount = 0;

  for (let page = 1; page <= maxPages; page += 1) {
    if (Date.now() >= deadlineMs) {
      timedOut = true;
      break;
    }

    const listResult = await breezyGetWithRetry<RawBreezyCandidate[]>(
      `/company/${encodeURIComponent(companyId)}/position/${encodeURIComponent(posId)}/candidates?page_size=${pageSize}&page=${page}&sort=created`,
      { timeoutMs: BREEZY_CANDIDATE_REQUEST_TIMEOUT_MS },
    );
    if (!listResult.ok) {
      return {
        candidates,
        incompletePagination,
        timedOut,
        failed: true,
        sanitizeRejected,
        rawBreezyResponseCount,
        extractedCandidatesCount,
        error: listResult.error,
      };
    }

    const rawPageCount = countRawBreezyListResponse(listResult.data);
    rawBreezyResponseCount += rawPageCount;
    logCandidatesDebug("raw_breezy_response", rawPageCount, { positionId: posId, page });

    const batch = extractRawBreezyCandidatesFromListResponse(listResult.data);
    extractedCandidatesCount += batch.length;
    logCandidatesDebug("extracted_candidates", batch.length, { positionId: posId, page });

    let reachedCandidatesBeforeRange = false;
    const rangeFilterActive = Boolean(dateRangeStart && dateRangeEnd);
    for (const candidate of batch) {
      const clean = sanitizeCandidate({ ...candidate, position_id: posId }, position);
      if (clean) {
        if (rangeFilterActive) {
          if (!clean.addedDate.trim()) {
            sanitizeRejected += 1;
            continue;
          }
          if (!isAppliedDateInRange(clean.addedDate, dateRangeStart!, dateRangeEnd!)) {
            const applied = parseCandidateAppliedDate(clean.addedDate);
            if (applied && calendarDateKeyInTimezone(applied) < dateRangeStart!) {
              reachedCandidatesBeforeRange = true;
            }
            continue;
          }
        }
        candidates.push(clean);
      } else {
        sanitizeRejected += 1;
      }
    }
    if (batch.length < pageSize) break;
    if (rangeFilterActive && reachedCandidatesBeforeRange) break;
    if (page === maxPages) incompletePagination = true;
  }

  logCandidatesDebug("normalized_position_candidates", candidates.length, {
    positionId: posId,
    rawBreezyResponseCount,
    extractedCandidatesCount,
    sanitizeRejected,
  });
  if (candidates[0]) {
    logFirstCandidateKeys("normalized_position_candidates", candidates[0] as unknown as Record<string, unknown>);
  }

  return {
    candidates,
    incompletePagination,
    timedOut,
    failed: false,
    sanitizeRejected,
    rawBreezyResponseCount,
    extractedCandidatesCount,
  };
}

function buildCandidatesSuccessPayload(input: {
  rawCandidates: BreezyCandidate[];
  fetchedAt: string;
  companyId: string;
  companyName?: string;
  positionId?: string;
  jobState: string;
  totalPositionsAvailable: number;
  positionsScanned: number;
  truncated: boolean;
  warnings?: string[];
  dateRangeStart?: string;
  dateRangeEnd?: string;
  sanitizeRejected: number;
  positionPaginationIncomplete: number;
  positionFetchFailed: number;
  positionScanTimedOut: number;
}): BreezyCandidatesSuccess {
  const positionsNotScanned = Math.max(0, input.totalPositionsAvailable - input.positionsScanned);
  logCandidatesDebug("before_normalized_candidates", input.rawCandidates.length, {
    positionsScanned: input.positionsScanned,
  });

  const summarized = summarizeCandidates(input.rawCandidates, {
    fetchedAt: input.fetchedAt,
    dateRangeStart: input.dateRangeStart,
    dateRangeEnd: input.dateRangeEnd,
    sanitizeRejected: input.sanitizeRejected,
    positionPaginationIncomplete: input.positionPaginationIncomplete,
    positionFetchFailed: input.positionFetchFailed,
    positionScanTimedOut: input.positionScanTimedOut,
    positionsNotScanned,
  });

  const skippedCandidatesReason = summarized.skippedCandidatesReason;
  logCandidatesDebug("after_normalized_candidates", summarized.candidates.length, {
    sanitizeRejected: skippedCandidatesReason.sanitizeRejected,
    duplicateCandidateId: skippedCandidatesReason.duplicateCandidateId,
    positionsScanned: input.positionsScanned,
  });
  logFirstCandidateKeys(
    "after_normalized_candidates",
    summarized.candidates[0] as unknown as Record<string, unknown> | undefined,
  );
  const syncNotes = buildBreezySyncNotes({
    truncated: input.truncated,
    totalPositions: input.totalPositionsAvailable,
    positionsScanned: input.positionsScanned,
    jobState: input.jobState,
    dateRangeStart: input.dateRangeStart,
    dateRangeEnd: input.dateRangeEnd,
    skipped: skippedCandidatesReason,
  });

  return {
    ok: true,
    candidates: summarized.candidates,
    fetchedAt: input.fetchedAt,
    companyId: input.companyId,
    companyName: input.companyName,
    positionId: input.positionId,
    totalPositionsAvailable: input.totalPositionsAvailable,
    totalPositions: input.totalPositionsAvailable,
    positionsScanned: input.positionsScanned,
    totalCandidatesPulled: summarized.candidates.length,
    totalCandidatesFetched: summarized.candidates.length,
    candidatesLast7Days: countCandidatesLast7Days(summarized.candidates, input.fetchedAt),
    dateRangeStart: input.dateRangeStart,
    dateRangeEnd: input.dateRangeEnd,
    candidatesInDateRange: summarized.candidatesInDateRange,
    skippedCandidatesReason,
    syncNotes,
    truncated: input.truncated,
    warnings: input.warnings,
  };
}

async function scanPositionsBatch(input: {
  companyId: string;
  positions: BreezyJob[];
  pipelineState: BreezyPositionPipelineState;
  pageSize: number;
  maxPages: number;
  deadlineMs: number;
  dateRangeStart?: string;
  dateRangeEnd?: string;
  filterToDateRange: boolean;
  maxCandidates?: number;
  batchDelayMs?: number;
}): Promise<ScanBatchStats> {
  const candidates: BreezyCandidate[] = [];
  const warnings: string[] = [];
  const total = input.positions.length;
  let positionsScanned = 0;
  let sanitizeRejected = 0;
  let positionPaginationIncomplete = 0;
  let positionFetchFailed = 0;
  let positionScanTimedOut = 0;
  let truncated = false;
  let rawBreezyResponseCount = 0;
  let extractedCandidatesCount = 0;
  let previewCandidatePositionsFound = 0;
  let previewEmptyPositions = 0;
  let previewStoppedReason: ScanBatchStats["previewStoppedReason"] = "complete";
  const failedPositions: BreezyJob[] = [];

  const rangeStart = input.filterToDateRange ? input.dateRangeStart : undefined;
  const rangeEnd = input.filterToDateRange ? input.dateRangeEnd : undefined;

  const mergeResult = (position: BreezyJob, result: PositionScanResult, isRetry = false) => {
    if (!isRetry) {
      positionsScanned += 1;
      if (result.extractedCandidatesCount > 0) {
        previewCandidatePositionsFound += 1;
      } else if (!result.failed) {
        previewEmptyPositions += 1;
      }
    }
    rawBreezyResponseCount += result.rawBreezyResponseCount;
    extractedCandidatesCount += result.extractedCandidatesCount;
    candidates.push(...result.candidates);
    sanitizeRejected += result.sanitizeRejected;
    if (result.incompletePagination) {
      positionPaginationIncomplete += 1;
      truncated = true;
    }
    if (result.timedOut) {
      positionScanTimedOut += 1;
      truncated = true;
    }
    if (result.failed) {
      truncated = true;
      if (!isRetry && result.candidates.length === 0) failedPositions.push(position);
      positionFetchFailed += 1;
      if (result.error) warnings.push(`${position.name || position.jobId}: ${result.error}`);
    }
  };

  const replaceForPosition = (positionId: string, rows: BreezyCandidate[]) => {
    for (let index = candidates.length - 1; index >= 0; index -= 1) {
      if (candidates[index]?.positionId === positionId) candidates.splice(index, 1);
    }
    candidates.push(...rows);
  };

  for (let offset = 0; offset < total; offset += CANDIDATE_POSITION_CONCURRENCY) {
    if (Date.now() >= input.deadlineMs) {
      truncated = true;
      previewStoppedReason = "server_budget";
      warnings.push(`Scan stopped early (${input.pipelineState}) — server runtime budget.`);
      break;
    }

    const batch = input.positions.slice(offset, Math.min(offset + CANDIDATE_POSITION_CONCURRENCY, total));
    const results = await Promise.all(
      batch.map((position) =>
        fetchCandidatesForPosition(
          input.companyId,
          { ...position, status: input.pipelineState },
          input.pageSize,
          input.maxPages,
          input.deadlineMs,
          rangeStart,
          rangeEnd,
        ),
      ),
    );

    for (let index = 0; index < batch.length; index += 1) {
      mergeResult(batch[index]!, results[index]!);
    }

    if (input.maxCandidates && candidates.length >= input.maxCandidates) {
      truncated = true;
      previewStoppedReason = "target_candidates";
      warnings.push(
        `Preview cap: loaded first ${input.maxCandidates.toLocaleString()} candidates from recent positions.`,
      );
      break;
    }

    if (offset + CANDIDATE_POSITION_CONCURRENCY < total) {
      await sleep(input.batchDelayMs ?? CANDIDATE_POSITION_BATCH_DELAY_MS);
    }
  }

  for (const position of failedPositions) {
    if (Date.now() >= input.deadlineMs) break;
    await sleep(CANDIDATE_POSITION_BATCH_DELAY_MS * 2);
    const retry = await fetchCandidatesForPosition(
      input.companyId,
      { ...position, status: input.pipelineState },
      input.pageSize,
      input.maxPages,
      input.deadlineMs,
      rangeStart,
      rangeEnd,
    );
    if (!retry.failed) {
      positionFetchFailed = Math.max(0, positionFetchFailed - 1);
      replaceForPosition(position.jobId, retry.candidates);
      sanitizeRejected += retry.sanitizeRejected;
      if (retry.incompletePagination) positionPaginationIncomplete += 1;
      continue;
    }
    if (retry.error) warnings.push(`Retry failed ${position.name || position.jobId}: ${retry.error}`);
  }

  logCandidatesDebug("after_scan_batch_sanitized", candidates.length, {
    rawBreezyResponseCount,
    extractedCandidatesCount,
    positionsScanned,
    sanitizeRejected,
  });

  if (truncated && previewStoppedReason === "complete") {
    previewStoppedReason = positionsScanned < total ? "max_positions" : "complete";
  }

  return {
    candidates,
    warnings,
    positionsScanned,
    positionsAvailable: total,
    positionsSkipped: Math.max(0, total - positionsScanned),
    sanitizeRejected,
    positionPaginationIncomplete,
    positionFetchFailed,
    positionScanTimedOut,
    truncated,
    rawBreezyResponseCount,
    extractedCandidatesCount,
    previewCandidatePositionsFound,
    previewEmptyPositions,
    previewStoppedReason,
  };
}

async function fetchBreezyCandidatesFastUncached(options?: {
  positionId?: string;
  state?: string;
  pageSize?: number;
  maxPages?: number;
  maxPositions?: number;
  dateRangeStart?: string;
  dateRangeEnd?: string;
  scanMode?: BreezyCandidatesScanMode;
  force?: boolean;
}): Promise<BreezyCandidatesResult> {
  resetBreezyRateLimitFlag();
  return fetchBreezyCandidatesUncachedCore({
    ...options,
    filterToDateRange: false,
    jobState: options?.state ?? "published",
    scanMode: options?.scanMode ?? "all",
  });
}

async function fetchBreezyCandidatesParityUncached(options: {
  dateRangeStart: string;
  dateRangeEnd: string;
  includeClosed: boolean;
  includeArchived: boolean;
  pageSize?: number;
  maxPages?: number;
  maxClosedPositions?: number;
  maxArchivedPositions?: number;
}): Promise<BreezyCandidatesDebugResult> {
  resetBreezyRateLimitFlag();
  const scanStartedAt = Date.now();

  const published = await fetchBreezyCandidatesUncachedCore({
    state: "published",
    pageSize: options.pageSize,
    maxPages: options.maxPages,
    dateRangeStart: options.dateRangeStart,
    dateRangeEnd: options.dateRangeEnd,
    filterToDateRange: true,
    jobState: "published",
    scanMode: "all",
  });

  if (!published.ok) return published;

  const allCandidates = [...published.candidates];
  const warnings = [...(published.warnings ?? [])];
  const positionsScannedByState = emptyStateCounts();
  const positionsSkippedByState = emptyStateCounts();
  positionsScannedByState.published = published.positionsScanned ?? 0;
  positionsSkippedByState.published = Math.max(
    0,
    (published.totalPositionsAvailable ?? 0) - (published.positionsScanned ?? 0),
  );

  let truncated = Boolean(published.truncated);
  let sanitizeRejected = published.skippedCandidatesReason?.sanitizeRejected ?? 0;
  let positionPaginationIncomplete =
    published.skippedCandidatesReason?.positionPaginationIncomplete ?? 0;
  let positionFetchFailed = published.skippedCandidatesReason?.positionFetchFailed ?? 0;
  let positionScanTimedOut = published.skippedCandidatesReason?.positionScanTimedOut ?? 0;

  const companyResult = await resolveBreezyCompany();
  if (!companyResult.ok) return companyResult;
  const { companyId, companyName } = companyResult;
  const pageSize = Math.max(1, Math.min(options.pageSize ?? CANDIDATES_PAGE_SIZE, CANDIDATES_PAGE_SIZE));
  const maxPages = options.maxPages
    ? Math.max(1, Math.min(options.maxPages, MAX_CANDIDATE_PAGES_PER_POSITION))
    : MAX_CANDIDATE_PAGES_PER_POSITION;
  const deadlineMs = Date.now() + BREEZY_CANDIDATE_SCAN_BUDGET_MS;

  if (options.includeClosed && Date.now() < deadlineMs) {
    const closedJobs = await fetchBreezyJobs("closed");
    if (closedJobs.ok) {
      const { selected, skipped } = selectRecentPositions(
        closedJobs.jobs,
        options.dateRangeEnd,
        options.maxClosedPositions ?? DEFAULT_MAX_CLOSED_POSITIONS,
        CLOSED_POSITION_RECENCY_DAYS,
      );
      positionsSkippedByState.closed = skipped;
      if (selected.length > 0) {
        warnings.push(
          `Closed parity scan: ${selected.length} recently updated closed job(s) (max ${options.maxClosedPositions ?? DEFAULT_MAX_CLOSED_POSITIONS}).`,
        );
        const closedScan = await scanPositionsBatch({
          companyId,
          positions: selected,
          pipelineState: "closed",
          pageSize,
          maxPages,
          deadlineMs,
          dateRangeStart: options.dateRangeStart,
          dateRangeEnd: options.dateRangeEnd,
          filterToDateRange: true,
        });
        allCandidates.push(...closedScan.candidates);
        warnings.push(...closedScan.warnings);
        positionsScannedByState.closed = closedScan.positionsScanned;
        sanitizeRejected += closedScan.sanitizeRejected;
        positionPaginationIncomplete += closedScan.positionPaginationIncomplete;
        positionFetchFailed += closedScan.positionFetchFailed;
        positionScanTimedOut += closedScan.positionScanTimedOut;
        truncated = truncated || closedScan.truncated;
      }
    } else {
      warnings.push(`Closed jobs list unavailable: ${closedJobs.error}`);
    }
  }

  if (options.includeArchived && Date.now() < deadlineMs) {
    const archivedJobs = await fetchBreezyJobs("archived");
    if (archivedJobs.ok) {
      const { selected, skipped } = selectRecentPositions(
        archivedJobs.jobs,
        options.dateRangeEnd,
        options.maxArchivedPositions ?? DEFAULT_MAX_ARCHIVED_POSITIONS,
        CLOSED_POSITION_RECENCY_DAYS,
      );
      positionsSkippedByState.archived = skipped;
      if (selected.length > 0) {
        warnings.push(
          `Archived parity scan: ${selected.length} recently updated archived job(s).`,
        );
        const archivedScan = await scanPositionsBatch({
          companyId,
          positions: selected,
          pipelineState: "archived",
          pageSize,
          maxPages,
          deadlineMs,
          dateRangeStart: options.dateRangeStart,
          dateRangeEnd: options.dateRangeEnd,
          filterToDateRange: true,
        });
        allCandidates.push(...archivedScan.candidates);
        warnings.push(...archivedScan.warnings);
        positionsScannedByState.archived = archivedScan.positionsScanned;
        sanitizeRejected += archivedScan.sanitizeRejected;
        positionPaginationIncomplete += archivedScan.positionPaginationIncomplete;
        positionFetchFailed += archivedScan.positionFetchFailed;
        positionScanTimedOut += archivedScan.positionScanTimedOut;
        truncated = truncated || archivedScan.truncated;
      }
    } else {
      warnings.push(`Archived jobs list unavailable: ${archivedJobs.error}`);
    }
  }

  const summarized = summarizeCandidates(allCandidates, {
    fetchedAt: published.fetchedAt,
    dateRangeStart: options.dateRangeStart,
    dateRangeEnd: options.dateRangeEnd,
    sanitizeRejected,
    positionPaginationIncomplete,
    positionFetchFailed,
    positionScanTimedOut,
    positionsNotScanned:
      positionsSkippedByState.published +
      positionsSkippedByState.closed +
      positionsSkippedByState.archived,
  });

  const publishedInRange = countCandidatesInRangeForPipelineStatus(
    summarized.candidates,
    options.dateRangeStart,
    options.dateRangeEnd,
    "published",
  );
  const closedInRange = countCandidatesInRangeForPipelineStatus(
    summarized.candidates,
    options.dateRangeStart,
    options.dateRangeEnd,
    "closed",
  );
  const archivedInRange = countCandidatesInRangeForPipelineStatus(
    summarized.candidates,
    options.dateRangeStart,
    options.dateRangeEnd,
    "archived",
  );

  const syncNotes = [
    ...buildBreezySyncNotes({
      truncated,
      totalPositions: published.totalPositionsAvailable ?? 0,
      positionsScanned: published.positionsScanned ?? 0,
      jobState: "published+parity",
      dateRangeStart: options.dateRangeStart,
      dateRangeEnd: options.dateRangeEnd,
      skipped: summarized.skippedCandidatesReason,
    }),
    options.includeClosed
      ? `Closed positions: scanned ${positionsScannedByState.closed}, skipped ${positionsSkippedByState.closed} (not recently updated or over cap).`
      : "Closed positions not scanned — pass includeClosed=true on debug route.",
    options.includeArchived
      ? `Archived positions: scanned ${positionsScannedByState.archived}, skipped ${positionsSkippedByState.archived}.`
      : "Archived positions not scanned.",
    `Parity totals: published=${publishedInRange}, closed=${closedInRange}, archived=${archivedInRange} (target Breezy UI ≈51).`,
  ];

  const inRange = summarized.candidates.filter((candidate) =>
    isAppliedDateInRange(candidate.appliedDate, options.dateRangeStart, options.dateRangeEnd),
  );

  return {
    ok: true,
    candidates: summarized.candidates,
    fetchedAt: published.fetchedAt,
    companyId: published.companyId,
    companyName,
    totalPositionsAvailable: published.totalPositionsAvailable,
    totalPositions: published.totalPositionsAvailable,
    positionsScanned: published.positionsScanned,
    totalCandidatesPulled: summarized.candidates.length,
    totalCandidatesFetched: summarized.candidates.length,
    candidatesLast7Days: countCandidatesLast7Days(summarized.candidates, published.fetchedAt),
    dateRangeStart: options.dateRangeStart,
    dateRangeEnd: options.dateRangeEnd,
    candidatesInDateRange: summarized.candidatesInDateRange,
    skippedCandidatesReason: summarized.skippedCandidatesReason,
    syncNotes,
    truncated,
    warnings: warnings.length > 0 ? [...new Set(warnings)] : undefined,
    debug: true,
    parityScan: true,
    includeClosed: options.includeClosed,
    includeArchived: options.includeArchived,
    scanDurationMs: Date.now() - scanStartedAt,
    rateLimitHit: wasBreezyRateLimitHit(),
    publishedCandidatesInRange: publishedInRange,
    closedCandidatesInRange: closedInRange,
    archivedCandidatesInRange: archivedInRange,
    positionsScannedByState,
    positionsSkippedByState,
    jobState: "published",
    pageSize,
    maxPagesPerPosition: maxPages,
    appliedDateField: BREEZY_ADDED_DATE_PRIMARY_FIELD,
    candidatesInDateRangeSample: inRange.slice(0, 10).map((candidate) => ({
      candidateId: candidate.candidateId,
      name: `${candidate.firstName} ${candidate.lastName}`.trim() || candidate.email || "Unknown",
      appliedDate: candidate.appliedDate,
      createdDate: candidate.createdDate,
      addedDate: candidate.addedDate,
      updatedDate: candidate.updatedDate,
      addedDateSource: candidate.addedDateSource,
      positionName: candidate.positionName,
      stage: candidate.stage,
    })),
    dateFieldBreakdown: {
      inRangeByAddedDate: inRange.length,
      inRangeByCreatedDate: countCandidatesInDateRange(
        summarized.candidates.filter((c) => c.createdDate.trim()),
        options.dateRangeStart,
        options.dateRangeEnd,
      ),
      inRangeByUpdatedDate: countCandidatesInDateRangeByUpdatedDate(
        summarized.candidates,
        options.dateRangeStart,
        options.dateRangeEnd,
      ),
      last7CalendarDays: countCandidatesLast7Days(summarized.candidates, published.fetchedAt),
    },
    uniqueCandidateIds: summarized.candidates.length,
    duplicateCandidateIds: summarized.skippedCandidatesReason.duplicateCandidateId,
  };
}

async function fetchBreezyCandidatesUncachedCore(options: {
  positionId?: string;
  state?: string;
  pageSize?: number;
  maxPages?: number;
  maxPositions?: number;
  dateRangeStart?: string;
  dateRangeEnd?: string;
  filterToDateRange: boolean;
  jobState: string;
  scanMode: BreezyCandidatesScanMode;
  force?: boolean;
}): Promise<BreezyCandidatesResult> {
  ensureBreezyConfigLoaded();
  const apiKey = getBreezyApiKeySync();
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
  const dateRangeStart = parseDateRangeParam(options?.dateRangeStart);
  const dateRangeEnd = parseDateRangeParam(options?.dateRangeEnd);
  const jobState = options?.state ?? "published";

  if (positionId) {
    const deadlineMs = Date.now() + BREEZY_CANDIDATE_SCAN_BUDGET_MS;
    const rangeStart = options.filterToDateRange ? dateRangeStart : undefined;
    const rangeEnd = options.filterToDateRange ? dateRangeEnd : undefined;
    const positionResult = await fetchCandidatesForPosition(
      companyId,
      {
        jobId: positionId,
        name: "",
        city: "",
        state: "",
        zip: "",
        displayLocation: "",
        locationSource: "missing",
        status: jobState,
        createdDate: "",
        updatedDate: "",
      },
      pageSize,
      maxPages,
      deadlineMs,
      rangeStart,
      rangeEnd,
    );
    if (positionResult.failed && positionResult.candidates.length === 0) {
      return {
        ok: false,
        error: positionResult.error ?? "Failed to load Breezy candidates for position",
        fetchedAt,
      };
    }

    return buildCandidatesSuccessPayload({
      rawCandidates: positionResult.candidates,
      fetchedAt,
      companyId,
      companyName,
      positionId,
      jobState,
      totalPositionsAvailable: 1,
      positionsScanned: 1,
      truncated:
        positionResult.incompletePagination || positionResult.timedOut || positionResult.failed,
      dateRangeStart,
      dateRangeEnd,
      sanitizeRejected: positionResult.sanitizeRejected,
      positionPaginationIncomplete: positionResult.incompletePagination ? 1 : 0,
      positionFetchFailed: positionResult.failed ? 1 : 0,
      positionScanTimedOut: positionResult.timedOut ? 1 : 0,
    });
  }

  const jobsResult = await fetchBreezyJobs(jobState);
  if (!jobsResult.ok) return jobsResult;

  const publishedJobs = jobsResult.jobs.map((position) => ({ ...position, status: jobState }));
  const sortedPositions =
    options.scanMode === "preview"
      ? sortPublishedJobsForPreviewScan(publishedJobs)
      : sortPublishedJobsByRecentUpdated(publishedJobs);
  const totalAvailable = sortedPositions.length;
  const scanMode = options.scanMode;

  let scanPositions: BreezyJob[] = sortedPositions;
  let fastTierSize = 0;

  const previewPageSize = Math.min(CANDIDATES_PAGE_SIZE, BREEZY_CANDIDATES_PREVIEW_TARGET_CANDIDATES);
  const effectivePageSize = scanMode === "preview" ? previewPageSize : pageSize;
  const effectiveMaxPages =
    scanMode === "preview" ? 1 : maxPages;

  if (scanMode === "preview") {
    const cap = Math.min(
      options?.maxPositions ?? BREEZY_CANDIDATES_PREVIEW_MAX_POSITIONS,
      BREEZY_CANDIDATES_PREVIEW_MAX_POSITIONS,
      sortedPositions.length,
    );
    scanPositions = sortedPositions.slice(0, cap);
  } else if (scanMode === "fast") {
    const cap =
      options?.maxPositions !== undefined
        ? Math.min(options.maxPositions, BREEZY_CANDIDATES_FAST_TIER_POSITIONS)
        : BREEZY_CANDIDATES_FAST_TIER_POSITIONS;
    fastTierSize = Math.min(cap, sortedPositions.length);
    scanPositions = sortedPositions.slice(0, fastTierSize);
  } else if (scanMode === "full") {
    fastTierSize = Math.min(BREEZY_CANDIDATES_FAST_TIER_POSITIONS, sortedPositions.length);
    scanPositions = sortedPositions.slice(fastTierSize);
    if (scanPositions.length === 0) {
      const {
        getStaleOkCandidatesSnapshot,
        withCandidatesSyncMeta,
      } = await import("@/lib/breezy-candidates-sync");
      const fastKey = breezyFastCandidatesCacheKey({
        state: jobState,
        scanMode: "fast",
      });
      const prior = getStaleOkCandidatesSnapshot(fastKey);
      if (prior) {
        return withCandidatesSyncMeta(prior, {
          fromCache: true,
          stale: false,
          partial: false,
        });
      }
    }
  } else {
    const scanLimit =
      options?.maxPositions !== undefined
        ? Math.min(sortedPositions.length, Math.max(1, options.maxPositions))
        : sortedPositions.length;
    scanPositions = sortedPositions.slice(0, scanLimit);
  }

  const deadlineMs =
    Date.now() +
    (scanMode === "preview" ? BREEZY_CANDIDATES_PREVIEW_BUDGET_MS : BREEZY_CANDIDATE_SCAN_BUDGET_MS);

  const { getBreezyCandidateListStrategyForFetch } = await import("@/lib/breezy-global-candidates");
  const listStrategy = getBreezyCandidateListStrategyForFetch();
  const candidateFetchStrategy = listStrategy.label;
  const candidateFetchEndpoint = listStrategy.pathTemplate;

  const batch = await scanPositionsBatch({
    companyId,
    positions: scanPositions,
    pipelineState: jobState as BreezyPositionPipelineState,
    pageSize: effectivePageSize,
    maxPages: effectiveMaxPages,
    deadlineMs,
    dateRangeStart: options.filterToDateRange ? dateRangeStart : undefined,
    dateRangeEnd: options.filterToDateRange ? dateRangeEnd : undefined,
    filterToDateRange: options.filterToDateRange,
    maxCandidates: scanMode === "preview" ? BREEZY_CANDIDATES_PREVIEW_TARGET_CANDIDATES : undefined,
    batchDelayMs: scanMode === "preview" ? CANDIDATE_PREVIEW_BATCH_DELAY_MS : undefined,
  });

  if (batch.positionsScanned < scanPositions.length && !batch.truncated) {
    batch.warnings.push(
      `Scanned ${batch.positionsScanned.toLocaleString()} of ${scanPositions.length.toLocaleString()} ${jobState} positions.`,
    );
  }

  const positionsScannedTotal =
    scanMode === "full" ? fastTierSize + batch.positionsScanned : batch.positionsScanned;
  const hydrationComplete =
    scanMode === "all"
      ? !batch.truncated && positionsScannedTotal >= totalAvailable
      : scanMode === "fast" || scanMode === "preview"
        ? false
        : positionsScannedTotal >= totalAvailable && !batch.truncated;

  if (scanMode === "preview") {
    const loaded = batch.candidates.length;
    if (loaded >= BREEZY_CANDIDATES_PREVIEW_MIN_CANDIDATES) {
      batch.warnings.push(
        `Preview sync: ${loaded.toLocaleString()} candidates from ${batch.positionsScanned.toLocaleString()} published positions. Background sync continues.`,
      );
    } else if (loaded > 0) {
      batch.warnings.push(
        `Preview sync: ${loaded.toLocaleString()} candidates (target ${BREEZY_CANDIDATES_PREVIEW_MIN_CANDIDATES}–${BREEZY_CANDIDATES_PREVIEW_TARGET_CANDIDATES}) from ${batch.positionsScanned.toLocaleString()} positions scanned before time budget. Background sync continues.`,
      );
    } else {
      batch.warnings.push(
        `Preview sync: scanned ${batch.positionsScanned.toLocaleString()} recent published positions with no applicants yet. Background sync continues.`,
      );
    }
  }

  if (scanMode === "fast" && totalAvailable > fastTierSize) {
    batch.warnings.push(
      `Fast-tier sync: ${fastTierSize.toLocaleString()} most recently updated positions loaded first. Full hydration pending.`,
    );
  }

  if (scanMode === "preview") {
    logCandidatesDebug("preview_scan_raw_breezy_response", batch.rawBreezyResponseCount, {
      scanMode,
      positionsScanned: batch.positionsScanned,
    });
    logCandidatesDebug("preview_scan_extracted_candidates", batch.extractedCandidatesCount, { scanMode });
    logCandidatesDebug("preview_scan_before_normalized", batch.candidates.length, { scanMode });
  }

  const payload = buildCandidatesSuccessPayload({
    rawCandidates: batch.candidates,
    fetchedAt,
    companyId,
    companyName,
    jobState,
    totalPositionsAvailable: totalAvailable,
    positionsScanned: positionsScannedTotal,
    truncated: batch.truncated,
    warnings: batch.warnings.length > 0 ? [...new Set(batch.warnings)] : undefined,
    dateRangeStart,
    dateRangeEnd,
    sanitizeRejected: batch.sanitizeRejected,
    positionPaginationIncomplete: batch.positionPaginationIncomplete,
    positionFetchFailed: batch.positionFetchFailed,
    positionScanTimedOut: batch.positionScanTimedOut,
  });

  const jobBuckets =
    scanMode === "preview" ? countPreviewJobApplicantBuckets(scanPositions) : null;
  const previewPositionsWithApplicants =
    scanMode === "preview"
      ? scanPositions.filter((job) => (job.candidateCount ?? 0) > 0).length
      : 0;

  return {
    ...payload,
    scanMode,
    hydrationComplete,
    partial:
      scanMode === "fast" || scanMode === "preview"
        ? true
        : payload.truncated || positionsScannedTotal < totalAvailable,
    candidateFetchStrategy,
    candidateFetchEndpoint,
    previewDiagnostics:
      scanMode === "preview"
        ? {
            rawBreezyResponseCount: batch.rawBreezyResponseCount,
            extractedCandidatesCount: batch.extractedCandidatesCount,
            normalizedCandidateCount: payload.candidates.length,
            servedFromServerCache: false,
            forceRequested: Boolean(options?.force),
            previewPageSize: effectivePageSize,
            previewMaxPages: effectiveMaxPages,
            jobsWithApplicantCount: jobBuckets?.jobsWithApplicantCount ?? 0,
            jobsWithUnknownApplicantCount: jobBuckets?.jobsWithUnknownApplicantCount ?? 0,
            jobsWithZeroApplicantCount: jobBuckets?.jobsWithZeroApplicantCount ?? 0,
            candidateFetchStrategy,
            candidateFetchEndpoint,
            previewCandidatePositionsFound: batch.previewCandidatePositionsFound ?? 0,
            previewPositionsWithApplicants,
            previewEmptyPositions: batch.previewEmptyPositions ?? 0,
            previewStoppedReason: batch.previewStoppedReason ?? "complete",
          }
        : undefined,
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
