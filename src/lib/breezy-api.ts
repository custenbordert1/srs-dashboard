/**
 * Read-only Breezy HR API client (GET requests only).
 * https://developer.breezy.hr/reference/overview
 */

const BREEZY_API_BASE = "https://api.breezy.hr/v3";

/** Max positions scanned when aggregating candidates without a position filter. */
const MAX_POSITIONS_FOR_CANDIDATE_SCAN = 20;

/** Candidates fetched per position during aggregation. */
const CANDIDATES_PAGE_SIZE = 50;

export type BreezyCompany = {
  _id: string;
  name?: string;
  [key: string]: unknown;
};

export type BreezyPosition = {
  _id: string;
  name?: string;
  friendly_id?: string;
  state?: string;
  [key: string]: unknown;
};

export type BreezyCandidate = {
  _id: string;
  name?: string;
  email_address?: string;
  phone_number?: string;
  stage?: { name?: string };
  position_id?: string;
  [key: string]: unknown;
};

export type BreezyJobsSuccess = {
  ok: true;
  jobs: BreezyPosition[];
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
  positionsScanned?: number;
  truncated?: boolean;
};

export type BreezyApiFailure = {
  ok: false;
  error: string;
  fetchedAt: string;
};

export type BreezyJobsResult = BreezyJobsSuccess | BreezyApiFailure;
export type BreezyCandidatesResult = BreezyCandidatesSuccess | BreezyApiFailure;

type BreezyErrorBody = {
  error?: { message?: string; type?: string };
};

export function getBreezyApiKey(): string | undefined {
  const key = process.env.BREEZY_API_KEY?.trim();
  return key && key.length > 0 ? key : undefined;
}

export function getBreezyCompanyIdOverride(): string | undefined {
  const id = process.env.BREEZY_COMPANY_ID?.trim();
  return id && id.length > 0 ? id : undefined;
}

function missingApiKeyFailure(): BreezyApiFailure {
  return {
    ok: false,
    error:
      "BREEZY_API_KEY is not set. Add it to your environment to enable read-only Breezy integration.",
    fetchedAt: new Date().toISOString(),
  };
}

function parseBreezyError(body: unknown, status: number): string {
  if (body && typeof body === "object" && "error" in body) {
    const err = (body as BreezyErrorBody).error;
    if (err?.message) return err.message;
    if (err?.type) return err.type;
  }
  return `Breezy API request failed (HTTP ${status})`;
}

async function breezyGet<T>(path: string): Promise<{ ok: true; data: T } | BreezyApiFailure> {
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
  const apiKey = getBreezyApiKey();
  if (!apiKey) return missingApiKeyFailure();

  const companyResult = await resolveBreezyCompany();
  if (!companyResult.ok) return companyResult;

  const { companyId, companyName } = companyResult;
  const params = new URLSearchParams({ state });
  const positionsResult = await breezyGet<BreezyPosition[]>(
    `/company/${encodeURIComponent(companyId)}/positions?${params.toString()}`,
  );

  if (!positionsResult.ok) return positionsResult;

  const jobs = Array.isArray(positionsResult.data) ? positionsResult.data : [];

  return {
    ok: true,
    jobs,
    fetchedAt: new Date().toISOString(),
    companyId,
    companyName,
    state,
  };
}

export async function fetchBreezyCandidates(options?: {
  positionId?: string;
  state?: string;
}): Promise<BreezyCandidatesResult> {
  const apiKey = getBreezyApiKey();
  if (!apiKey) return missingApiKeyFailure();

  const companyResult = await resolveBreezyCompany();
  if (!companyResult.ok) return companyResult;

  const { companyId, companyName } = companyResult;
  const positionId = options?.positionId?.trim();
  const fetchedAt = new Date().toISOString();

  if (positionId) {
    const candidatesResult = await breezyGet<BreezyCandidate[]>(
      `/company/${encodeURIComponent(companyId)}/position/${encodeURIComponent(positionId)}/candidates?page_size=${CANDIDATES_PAGE_SIZE}&page=1`,
    );
    if (!candidatesResult.ok) return candidatesResult;

    const raw = Array.isArray(candidatesResult.data) ? candidatesResult.data : [];
    const candidates = raw.map((c) => ({ ...c, position_id: positionId }));

    return {
      ok: true,
      candidates,
      fetchedAt,
      companyId,
      companyName,
      positionId,
    };
  }

  const state = options?.state ?? "published";
  const jobsResult = await fetchBreezyJobs(state);
  if (!jobsResult.ok) return jobsResult;

  const positions = jobsResult.jobs.filter((p) => p._id);
  const scanLimit = Math.min(positions.length, MAX_POSITIONS_FOR_CANDIDATE_SCAN);
  const candidates: BreezyCandidate[] = [];

  for (let i = 0; i < scanLimit; i += 1) {
    const pos = positions[i];
    const posId = pos._id;
    const listResult = await breezyGet<BreezyCandidate[]>(
      `/company/${encodeURIComponent(companyId)}/position/${encodeURIComponent(posId)}/candidates?page_size=${CANDIDATES_PAGE_SIZE}&page=1`,
    );
    if (!listResult.ok) return listResult;

    const batch = Array.isArray(listResult.data) ? listResult.data : [];
    for (const candidate of batch) {
      candidates.push({ ...candidate, position_id: posId });
    }
  }

  return {
    ok: true,
    candidates,
    fetchedAt,
    companyId,
    companyName,
    positionsScanned: scanLimit,
    truncated: positions.length > scanLimit,
  };
}
