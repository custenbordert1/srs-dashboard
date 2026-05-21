import { getBreezyApiKeySync, loadConfigSync } from "@/lib/config";
import { breezyConfigErrorMessage } from "@/lib/env-validation";
import { resolveBreezyCompany } from "@/lib/breezy-api";
import type { JobDraft } from "@/lib/job-management/job-draft-types";

const BREEZY_API_BASE = "https://api.breezy.hr/v3";
const BREEZY_WRITE_TIMEOUT_MS = 20_000;
const BREEZY_POSITION_TYPES = new Set(["fullTime", "partTime", "contract", "temporary", "other"]);
const DEFAULT_POSITION_TYPE = "fullTime";
const DEFAULT_DESCRIPTION = "Posted from SRS Recruiting Dashboard.";

export type BreezyPositionCreateResult =
  | { ok: true; breezyJobId: string; fetchedAt: string; raw?: unknown }
  | { ok: false; error: string; fetchedAt: string; rateLimited?: boolean };

type BreezyErrorBody = {
  error?: { type?: string; message?: string };
};

function extractCreatedJobId(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const id = record._id ?? record.id ?? record.friendly_id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

function parseBreezyErrorMessage(body: unknown, status: number): string {
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

function responseBodyPreview(text: string, maxLen = 240): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (!compact) return "(empty body)";
  return compact.length <= maxLen ? compact : `${compact.slice(0, maxLen)}…`;
}

function sanitizePayloadForLog(payload: Record<string, unknown>) {
  return {
    name: payload.name,
    type: payload.type,
    descriptionLength: typeof payload.description === "string" ? payload.description.length : 0,
    location: payload.location,
    department: payload.department ?? null,
    customAttributeCount: Array.isArray(payload.custom_attributes) ? payload.custom_attributes.length : 0,
    tagCount: Array.isArray(payload.tags) ? payload.tags.length : 0,
  };
}

function buildPositionPayload(draft: JobDraft): { ok: true; payload: Record<string, unknown> } | { ok: false; error: string } {
  const name = draft.title.trim();
  if (!name) {
    return { ok: false, error: "Draft title is required before pushing to Breezy." };
  }

  const description = draft.description.trim() || DEFAULT_DESCRIPTION;
  const city = draft.city.trim();
  const usState = draft.usState.trim();
  const typeCandidate = draft.metadata?.breezyPositionType?.trim();
  const type =
    typeCandidate && BREEZY_POSITION_TYPES.has(typeCandidate) ? typeCandidate : DEFAULT_POSITION_TYPE;

  const payload: Record<string, unknown> = {
    name,
    description,
    type,
    location: {
      country: "US",
      state: usState || undefined,
      city: city || undefined,
      is_remote: false,
    },
    tags: ["srs-dashboard"],
  };

  const department = draft.department.trim();
  if (department) payload.department = department;

  if (draft.payRate.trim()) {
    payload.custom_attributes = [
      { name: "Pay Rate", value: draft.payRate.trim(), secure: false },
    ];
  }

  return { ok: true, payload };
}

async function breezyRequest(
  method: string,
  path: string,
  apiKey: string,
  body?: Record<string, unknown>,
): Promise<{ response: Response; text: string }> {
  const response = await fetch(`${BREEZY_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(BREEZY_WRITE_TIMEOUT_MS),
  });
  const text = await response.text();
  return { response, text };
}

function failureFromResponse(
  label: string,
  path: string,
  response: Response,
  text: string,
  fetchedAt: string,
): BreezyPositionCreateResult {
  const preview = responseBodyPreview(text);
  let parsed: unknown = null;
  let isJson = false;
  if (text.trim()) {
    try {
      parsed = JSON.parse(text);
      isJson = true;
    } catch {
      isJson = false;
    }
  }

  console.error(`[breezy-position-write] ${label} failed`, {
    endpoint: path,
    status: response.status,
    isJson,
    bodyPreview: preview,
  });

  const error = isJson
    ? parseBreezyErrorMessage(parsed, response.status)
    : `Breezy returned non-JSON (HTTP ${response.status}): ${preview}`;

  return {
    ok: false,
    error,
    fetchedAt,
    rateLimited: response.status === 429,
  };
}

async function publishBreezyPosition(
  companyId: string,
  positionId: string,
  apiKey: string,
  fetchedAt: string,
): Promise<BreezyPositionCreateResult | null> {
  const path = `/company/${encodeURIComponent(companyId)}/position/${encodeURIComponent(positionId)}/state`;
  console.info("[breezy-position-write] publish state", { endpoint: path, targetState: "published" });

  let response: Response;
  let text: string;
  try {
    ({ response, text } = await breezyRequest("PUT", path, apiKey, { state: "published" }));
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to publish position in Breezy",
      fetchedAt,
    };
  }

  if (response.status === 204 || response.ok) {
    return null;
  }

  return failureFromResponse("publish", path, response, text, fetchedAt);
}

/**
 * Creates a Breezy position and publishes it — caller must require explicit user confirmation.
 */
export async function createBreezyPositionFromDraft(
  draft: JobDraft,
): Promise<BreezyPositionCreateResult> {
  loadConfigSync();
  const apiKey = getBreezyApiKeySync();
  const fetchedAt = new Date().toISOString();
  if (!apiKey) {
    return { ok: false, error: breezyConfigErrorMessage(), fetchedAt };
  }

  const company = await resolveBreezyCompany();
  if (!company.ok) {
    return { ok: false, error: company.error, fetchedAt };
  }

  const built = buildPositionPayload(draft);
  if (!built.ok) {
    return { ok: false, error: built.error, fetchedAt };
  }

  const createPath = `/company/${encodeURIComponent(company.companyId)}/positions`;
  console.info("[breezy-position-write] create position", {
    endpoint: createPath,
    companyId: company.companyId,
    draftId: draft.id,
    payloadShape: sanitizePayloadForLog(built.payload),
  });

  let response: Response;
  let text: string;
  try {
    ({ response, text } = await breezyRequest("POST", createPath, apiKey, built.payload));
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to reach Breezy API",
      fetchedAt,
    };
  }

  let parsed: unknown = null;
  let isJson = false;
  if (text.trim()) {
    try {
      parsed = JSON.parse(text);
      isJson = true;
    } catch {
      isJson = false;
    }
  }

  if (!isJson) {
    const preview = responseBodyPreview(text);
    console.error("[breezy-position-write] create failed", {
      endpoint: createPath,
      status: response.status,
      isJson: false,
      bodyPreview: preview,
    });
    return {
      ok: false,
      error: `Breezy returned non-JSON (HTTP ${response.status}): ${preview}`,
      fetchedAt,
      rateLimited: response.status === 429,
    };
  }

  if (!response.ok) {
    return failureFromResponse("create", createPath, response, text, fetchedAt);
  }

  const breezyJobId = extractCreatedJobId(parsed);
  if (!breezyJobId) {
    console.error("[breezy-position-write] create missing job id", {
      endpoint: createPath,
      status: response.status,
      bodyPreview: responseBodyPreview(text),
    });
    return {
      ok: false,
      error: "Breezy created a position but response did not include a job id.",
      fetchedAt,
    };
  }

  console.info("[breezy-position-write] create succeeded", {
    endpoint: createPath,
    status: response.status,
    breezyJobId,
  });

  const publishFailure = await publishBreezyPosition(company.companyId, breezyJobId, apiKey, fetchedAt);
  if (publishFailure && !publishFailure.ok) {
    return {
      ok: false,
      error: `Position created in Breezy (${breezyJobId}) but publish failed: ${publishFailure.error}`,
      fetchedAt: publishFailure.fetchedAt,
      rateLimited: publishFailure.rateLimited,
    };
  }

  return { ok: true, breezyJobId, fetchedAt, raw: parsed };
}
