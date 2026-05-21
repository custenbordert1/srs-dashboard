import { getBreezyApiKeySync, loadConfigSync } from "@/lib/config";
import { breezyConfigErrorMessage } from "@/lib/env-validation";
import { resolveBreezyCompany } from "@/lib/breezy-api";
import { normalizeBreezyJobLocation } from "@/lib/breezy-job-location";
import {
  buildBreezyPositionPayload,
  verifyBreezyPositionResponse,
  type BreezyPositionVerification,
} from "@/lib/job-management/breezy-position-payload";
import type { JobDraft } from "@/lib/job-management/job-draft-types";

const BREEZY_API_BASE = "https://api.breezy.hr/v3";
const BREEZY_WRITE_TIMEOUT_MS = 20_000;

export type BreezyPositionCreateResult =
  | {
      ok: true;
      breezyJobId: string;
      fetchedAt: string;
      raw?: unknown;
      verification: BreezyPositionVerification;
    }
  | { ok: false; error: string; fetchedAt: string; rateLimited?: boolean; fieldErrors?: Record<string, string> };

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

function logDraftBeforePush(draft: JobDraft): void {
  console.info("[breezy-position-write] draft before push", {
    draftId: draft.id,
    title: draft.title,
    descriptionLength: draft.description?.length ?? 0,
    city: draft.city,
    usState: draft.usState,
    payRate: draft.payRate,
    department: draft.department,
    clonedFromBreezyJobId: draft.clonedFromBreezyJobId ?? null,
    updatedAt: draft.updatedAt,
  });
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

async function fetchCreatedPosition(
  companyId: string,
  positionId: string,
  apiKey: string,
): Promise<unknown | null> {
  const path = `/company/${encodeURIComponent(companyId)}/position/${encodeURIComponent(positionId)}`;
  try {
    const { response, text } = await breezyRequest("GET", path, apiKey);
    if (!response.ok) {
      console.warn("[breezy-position-write] verify fetch failed", {
        endpoint: path,
        status: response.status,
        bodyPreview: responseBodyPreview(text),
      });
      return null;
    }
    if (!text.trim()) return null;
    return JSON.parse(text) as unknown;
  } catch (err) {
    console.warn("[breezy-position-write] verify fetch error", {
      endpoint: path,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
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

  logDraftBeforePush(draft);

  const built = buildBreezyPositionPayload(draft);
  if (!built.ok) {
    const fieldErrors = built.errors
      ? Object.fromEntries(
          Object.entries(built.errors).map(([key, value]) => [key, value ?? ""]),
        )
      : undefined;
    return { ok: false, error: built.error, fetchedAt, fieldErrors };
  }

  const createPath = `/company/${encodeURIComponent(company.companyId)}/positions`;
  console.info("[breezy-position-write] breezy payload", {
    endpoint: createPath,
    companyId: company.companyId,
    draftId: draft.id,
    payloadShape: sanitizePayloadForLog(built.payload),
    displayLocation: built.displayLocation,
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

  console.info("[breezy-position-write] breezy create response", {
    endpoint: createPath,
    status: response.status,
    isJson,
    bodyPreview: responseBodyPreview(text, 400),
  });

  if (!isJson) {
    return {
      ok: false,
      error: `Breezy returned non-JSON (HTTP ${response.status}): ${responseBodyPreview(text)}`,
      fetchedAt,
      rateLimited: response.status === 429,
    };
  }

  if (!response.ok) {
    return failureFromResponse("create", createPath, response, text, fetchedAt);
  }

  const breezyJobId = extractCreatedJobId(parsed);
  if (!breezyJobId) {
    return {
      ok: false,
      error: "Breezy created a position but response did not include a job id.",
      fetchedAt,
    };
  }

  const createVerification = verifyBreezyPositionResponse(breezyJobId, parsed, {
    name: built.breezyTitle,
    city: built.draftSnapshot.city,
    state: built.draftSnapshot.usState,
  });

  const fetchedPosition = await fetchCreatedPosition(company.companyId, breezyJobId, apiKey);
  const verification =
    fetchedPosition !== null
      ? verifyBreezyPositionResponse(breezyJobId, fetchedPosition, {
          name: built.breezyTitle,
          city: built.draftSnapshot.city,
          state: built.draftSnapshot.usState,
        })
      : createVerification;

  if (!verification.ok) {
    const normalized = normalizeBreezyJobLocation(
      fetchedPosition && typeof fetchedPosition === "object"
        ? (fetchedPosition as Record<string, unknown>)
        : {},
    );
    console.warn("[breezy-position-write] post-create verification mismatch", {
      breezyJobId,
      mismatches: verification.mismatches,
      expected: verification.expected,
      actual: verification.actual,
      normalizedFromJob: {
        city: normalized.city,
        state: normalized.state,
        displayLocation: normalized.displayLocation,
      },
    });
  } else {
    console.info("[breezy-position-write] post-create verification ok", {
      breezyJobId,
      title: verification.actual.name,
      location: verification.actual.displayLocation,
    });
  }

  const publishFailure = await publishBreezyPosition(company.companyId, breezyJobId, apiKey, fetchedAt);
  if (publishFailure && !publishFailure.ok) {
    return {
      ok: false,
      error: `Position created in Breezy (${breezyJobId}) but publish failed: ${publishFailure.error}`,
      fetchedAt: publishFailure.fetchedAt,
      rateLimited: publishFailure.rateLimited,
    };
  }

  if (!verification.ok) {
    return {
      ok: false,
      error: `Breezy position ${breezyJobId} was created but location/title did not match the draft: ${verification.mismatches.join("; ")}`,
      fetchedAt,
    };
  }

  return { ok: true, breezyJobId, fetchedAt, raw: parsed, verification };
}
