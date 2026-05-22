/**
 * Breezy company-wide candidate list discovery and fetch.
 * The Breezy UI Candidates tab (/app/c/{company}/candidates) uses a global list, not per-position scans.
 */

import { logCandidatesDebug } from "@/lib/candidates-debug";
import { extractRawBreezyCandidatesFromListResponse } from "@/lib/breezy-api";
import type { BreezyApiFailure, BreezyCandidate, BreezyJob } from "@/lib/breezy-api";

export type BreezyCandidateListStrategyKind = "global_company" | "global_user" | "per_position";

export type BreezyCandidateListStrategy = {
  kind: BreezyCandidateListStrategyKind;
  pathTemplate: string;
  label: string;
};

export type NormalizeBreezyCandidate = (
  raw: Record<string, unknown>,
  position?: Pick<BreezyJob, "jobId" | "name" | "city" | "state" | "status">,
) => BreezyCandidate | null;

export type BreezyResponseShapeSummary = {
  topLevelType: string;
  topLevelKeys: string[];
  arrayLength: number | null;
  candidatesArrayLength: number | null;
  dataArrayLength: number | null;
  extractedCount: number;
  pagination: Record<string, unknown> | null;
};

export type BreezyCandidateEndpointProbeResult = {
  label: string;
  url: string;
  queryParams: Record<string, string>;
  httpStatus: number | null;
  ok: boolean;
  error?: string;
  shape: BreezyResponseShapeSummary;
  authHeaderFormat: string;
};

export type BreezyCandidateEndpointProbeReport = {
  companyId: string;
  samplePositionId: string | null;
  probes: BreezyCandidateEndpointProbeResult[];
  winner: BreezyCandidateListStrategy | null;
  probedAt: string;
};

const BREEZY_API_BASE = "https://api.breezy.hr/v3";
const AUTH_HEADER_FORMAT = "Authorization: <BREEZY_API_KEY>";

let cachedListStrategy: BreezyCandidateListStrategy | null = null;

export function clearBreezyCandidateListStrategyCache(): void {
  cachedListStrategy = null;
}

export function getCachedBreezyCandidateListStrategy(): BreezyCandidateListStrategy | null {
  return cachedListStrategy;
}

export function describeBreezyResponseShape(body: unknown): BreezyResponseShapeSummary {
  const extracted = extractRawBreezyCandidatesFromListResponse(body);
  if (body === null || body === undefined) {
    return {
      topLevelType: "null",
      topLevelKeys: [],
      arrayLength: null,
      candidatesArrayLength: null,
      dataArrayLength: null,
      extractedCount: 0,
      pagination: null,
    };
  }
  if (Array.isArray(body)) {
    return {
      topLevelType: "array",
      topLevelKeys: [],
      arrayLength: body.length,
      candidatesArrayLength: body.length,
      dataArrayLength: null,
      extractedCount: extracted.length,
      pagination: null,
    };
  }
  if (typeof body !== "object") {
    return {
      topLevelType: typeof body,
      topLevelKeys: [],
      arrayLength: null,
      candidatesArrayLength: null,
      dataArrayLength: null,
      extractedCount: 0,
      pagination: null,
    };
  }
  const record = body as Record<string, unknown>;
  const candidatesArr = record.candidates;
  const dataArr = record.data;
  const meta = record.meta && typeof record.meta === "object" ? (record.meta as Record<string, unknown>) : null;

  return {
    topLevelType: "object",
    topLevelKeys: Object.keys(record).sort(),
    arrayLength: null,
    candidatesArrayLength: Array.isArray(candidatesArr) ? candidatesArr.length : null,
    dataArrayLength: Array.isArray(dataArr) ? dataArr.length : null,
    extractedCount: extracted.length,
    pagination: meta ?? pickPaginationFields(record),
  };
}

function pickPaginationFields(record: Record<string, unknown>): Record<string, unknown> | null {
  const keys = ["page", "page_size", "total", "total_count", "count", "has_more", "next_page"] as const;
  const picked: Record<string, unknown> = {};
  for (const key of keys) {
    if (record[key] !== undefined) picked[key] = record[key];
  }
  return Object.keys(picked).length > 0 ? picked : null;
}

function buildProbeUrl(path: string, query: Record<string, string>): string {
  const params = new URLSearchParams(query);
  const qs = params.toString();
  return `${BREEZY_API_BASE}${path}${qs ? `?${qs}` : ""}`;
}

function resolvePositionIdFromRaw(raw: Record<string, unknown>): string {
  if (typeof raw.position_id === "string" && raw.position_id.trim()) return raw.position_id.trim();
  const position = raw.position;
  if (position && typeof position === "object") {
    const pos = position as Record<string, unknown>;
    const id = typeof pos._id === "string" ? pos._id : typeof pos.id === "string" ? pos.id : "";
    if (id.trim()) return id.trim();
  }
  return "";
}

/** Probe candidate list endpoints; pick first that returns extractable rows. */
export async function probeBreezyCandidateEndpoints(input: {
  companyId: string;
  samplePositionId: string | null;
  samplePositionAltId?: string | null;
  apiKey: string;
  pageSize?: number;
}): Promise<BreezyCandidateEndpointProbeReport> {
  const pageSize = String(input.pageSize ?? 5);
  const baseQuery = { page_size: pageSize, page: "1", sort: "created" };
  const companyEncoded = encodeURIComponent(input.companyId);

  const probeDefs: Array<{ label: string; path: string; query: Record<string, string> }> = [
    {
      label: "company_global_candidates",
      path: `/company/${companyEncoded}/candidates`,
      query: { ...baseQuery },
    },
    {
      label: "company_global_candidates_updated_sort",
      path: `/company/${companyEncoded}/candidates`,
      query: { ...baseQuery, sort: "updated" },
    },
    {
      label: "user_global_candidates",
      path: "/candidates",
      query: { ...baseQuery },
    },
    {
      label: "company_candidates_search",
      path: `/company/${companyEncoded}/candidates/search`,
      query: { ...baseQuery },
    },
  ];

  if (input.samplePositionId) {
    probeDefs.push({
      label: "per_position_candidates_primary_id",
      path: `/company/${companyEncoded}/position/${encodeURIComponent(input.samplePositionId)}/candidates`,
      query: { ...baseQuery },
    });
  }
  if (input.samplePositionAltId && input.samplePositionAltId !== input.samplePositionId) {
    probeDefs.push({
      label: "per_position_candidates_alt_id",
      path: `/company/${companyEncoded}/position/${encodeURIComponent(input.samplePositionAltId)}/candidates`,
      query: { ...baseQuery },
    });
  }

  const probes: BreezyCandidateEndpointProbeResult[] = [];

  for (const def of probeDefs) {
    const url = buildProbeUrl(def.path, def.query);

    console.info("[breezy-candidates-api] request", {
      label: def.label,
      method: "GET",
      url,
      queryParams: def.query,
      authHeaderFormat: AUTH_HEADER_FORMAT,
    });

    let httpStatus: number | null = null;
    let body: unknown = null;
    let error: string | undefined;
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: input.apiKey,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      });
      httpStatus = response.status;
      const text = await response.text();
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = { _parseError: "non-json", preview: text.slice(0, 200) };
      }
      if (!response.ok) {
        error =
          body && typeof body === "object" && "error" in body
            ? JSON.stringify((body as { error?: unknown }).error)
            : `HTTP ${response.status}`;
      }
    } catch (err) {
      error = err instanceof Error ? err.message : "fetch failed";
    }

    const shape = describeBreezyResponseShape(body);
    console.info("[breezy-candidates-api] response", {
      label: def.label,
      url,
      httpStatus,
      responseShape: shape,
      extractedCount: shape.extractedCount,
      error,
    });

    probes.push({
      label: def.label,
      url,
      queryParams: def.query,
      httpStatus,
      ok: httpStatus !== null && httpStatus >= 200 && httpStatus < 300 && shape.extractedCount > 0,
      error,
      shape,
      authHeaderFormat: AUTH_HEADER_FORMAT,
    });
  }

  const winnerProbe = probes.find((probe) => probe.ok);
  const winner: BreezyCandidateListStrategy | null = winnerProbe
    ? strategyFromProbeLabel(winnerProbe.label)
    : null;

  if (winner) {
    cachedListStrategy = winner;
  }

  return {
    companyId: input.companyId,
    samplePositionId: input.samplePositionId,
    probes,
    winner,
    probedAt: new Date().toISOString(),
  };
}

function strategyFromProbeLabel(label: string): BreezyCandidateListStrategy {
  if (label.startsWith("user_global")) {
    return { kind: "global_user", pathTemplate: "/candidates", label };
  }
  if (label.startsWith("company_global") || label.startsWith("company_candidates")) {
    return {
      kind: "global_company",
      pathTemplate: "/company/{companyId}/candidates",
      label,
    };
  }
  return {
    kind: "per_position",
    pathTemplate: "/company/{companyId}/position/{positionId}/candidates",
    label,
  };
}

export async function resolveBreezyCandidateListStrategy(input: {
  companyId: string;
  samplePositionId: string | null;
  samplePositionAltId?: string | null;
  apiKey: string;
  forceProbe?: boolean;
}): Promise<BreezyCandidateListStrategy> {
  if (!input.forceProbe && cachedListStrategy) {
    return cachedListStrategy;
  }
  const report = await probeBreezyCandidateEndpoints({
    companyId: input.companyId,
    samplePositionId: input.samplePositionId,
    samplePositionAltId: input.samplePositionAltId,
    apiKey: input.apiKey,
    pageSize: 3,
  });
  if (report.winner) {
    logCandidatesDebug("candidate_list_strategy", 0, {
      strategy: report.winner.kind,
      label: report.winner.label,
    });
    return report.winner;
  }
  logCandidatesDebug("candidate_list_strategy_fallback", 0, {
    strategy: "per_position",
    reason: "no_global_endpoint_returned_rows",
  });
  return {
    kind: "per_position",
    pathTemplate: "/company/{companyId}/position/{positionId}/candidates",
    label: "per_position_fallback",
  };
}

export type GlobalCandidatesBatchResult = {
  candidates: BreezyCandidate[];
  rawBreezyResponseCount: number;
  extractedCandidatesCount: number;
  sanitizeRejected: number;
  pagesFetched: number;
  truncated: boolean;
  strategy: BreezyCandidateListStrategy;
  warnings: string[];
};

export async function fetchCandidatesViaGlobalList(input: {
  companyId: string;
  strategy: BreezyCandidateListStrategy;
  jobsById: Map<string, BreezyJob>;
  apiKey: string;
  pageSize: number;
  maxPages: number;
  deadlineMs: number;
  maxCandidates?: number;
  normalize: NormalizeBreezyCandidate;
}): Promise<GlobalCandidatesBatchResult | BreezyApiFailure> {
  const path =
    input.strategy.kind === "global_user"
      ? input.strategy.pathTemplate
      : input.strategy.pathTemplate.replace("{companyId}", encodeURIComponent(input.companyId));

  const candidates: BreezyCandidate[] = [];
  const warnings: string[] = [];
  let rawBreezyResponseCount = 0;
  let extractedCandidatesCount = 0;
  let sanitizeRejected = 0;
  let pagesFetched = 0;
  let truncated = false;

  for (let page = 1; page <= input.maxPages; page += 1) {
    if (Date.now() >= input.deadlineMs) {
      truncated = true;
      warnings.push("Global candidate fetch stopped — server runtime budget.");
      break;
    }

    const query = {
      page_size: String(input.pageSize),
      page: String(page),
      sort: "created",
    };
    const url = buildProbeUrl(path, query);

    console.info("[breezy-candidates-api] request", {
      strategy: input.strategy.kind,
      method: "GET",
      url,
      queryParams: query,
      authHeaderFormat: AUTH_HEADER_FORMAT,
      page,
    });

    let response: Response;
    try {
      response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: input.apiKey,
          "Content-Type": "application/json",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      });
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Global Breezy candidates fetch failed",
        fetchedAt: new Date().toISOString(),
      };
    }

    const text = await response.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      return {
        ok: false,
        error: `Breezy global candidates returned non-JSON (HTTP ${response.status})`,
        fetchedAt: new Date().toISOString(),
      };
    }

    if (!response.ok) {
      const error =
        body && typeof body === "object" && "error" in body
          ? JSON.stringify((body as { error?: unknown }).error)
          : `Breezy global candidates failed (HTTP ${response.status})`;
      return { ok: false, error, fetchedAt: new Date().toISOString() };
    }

    pagesFetched += 1;
    const shape = describeBreezyResponseShape(body);
    const batch = extractRawBreezyCandidatesFromListResponse(body);
    rawBreezyResponseCount += batch.length;
    extractedCandidatesCount += batch.length;

    console.info("[breezy-candidates-api] response", {
      strategy: input.strategy.kind,
      url,
      httpStatus: response.status,
      responseShape: shape,
      extractedCount: batch.length,
      pagination: shape.pagination,
    });

    for (const raw of batch) {
      const record = raw as Record<string, unknown>;
      const positionId = resolvePositionIdFromRaw(record);
      const job = positionId ? input.jobsById.get(positionId) : undefined;
      const clean = input.normalize(record, job);
      if (!clean) {
        sanitizeRejected += 1;
        continue;
      }
      if (!job) {
        sanitizeRejected += 1;
        continue;
      }
      candidates.push(clean);
      if (input.maxCandidates && candidates.length >= input.maxCandidates) {
        truncated = true;
        break;
      }
    }

    if (truncated) break;
    if (batch.length < input.pageSize) break;
    if (shape.pagination && shape.pagination.has_more === false) break;
  }

  logCandidatesDebug("global_candidates_fetch_complete", candidates.length, {
    strategy: input.strategy.kind,
    rawBreezyResponseCount,
    extractedCandidatesCount,
    pagesFetched,
    sanitizeRejected,
  });

  return {
    candidates,
    rawBreezyResponseCount,
    extractedCandidatesCount,
    sanitizeRejected,
    pagesFetched,
    truncated,
    strategy: input.strategy,
    warnings,
  };
}

export function buildJobsLookupMap(jobs: BreezyJob[]): Map<string, BreezyJob> {
  const map = new Map<string, BreezyJob>();
  for (const job of jobs) {
    map.set(job.jobId, job);
    if (job.friendlyId && job.friendlyId !== job.jobId) {
      map.set(job.friendlyId, job);
    }
  }
  return map;
}
