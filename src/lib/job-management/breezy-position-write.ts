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
import {
  bodyPreview,
  breezyNonJsonErrorMessage,
  logBreezyNonJsonResponse,
  parseHttpBody,
} from "@/lib/job-management/breezy-http-response";
import {
  breezyPayloadKeys,
  extractCreatedBreezyPositionId,
  formatBreezyRejectionMessage,
} from "@/lib/job-management/breezy-position-response";

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
  const preview = bodyPreview(text);
  const contentType = response.headers.get("content-type") ?? "(missing)";
  const body = parseHttpBody(text);

  if (!body.isJson) {
    logBreezyNonJsonResponse({
      endpoint: path,
      status: response.status,
      statusText: response.statusText,
      bodyPreview: preview,
      label: `${label} failed`,
    });
    console.error(`[breezy-position-write] ${label} failed (non-json)`, {
      endpoint: path,
      status: response.status,
      statusText: response.statusText,
      contentType,
      bodyPreview: preview,
    });
    return {
      ok: false,
      error: breezyNonJsonErrorMessage(response.status),
      fetchedAt,
      rateLimited: response.status === 429,
    };
  }

  console.error(`[breezy-position-write] ${label} failed`, {
    endpoint: path,
    status: response.status,
    statusText: response.statusText,
    contentType,
    isJson: true,
    bodyPreview: preview,
    breezyError:
      body.parsed && typeof body.parsed === "object" && "error" in body.parsed
        ? (body.parsed as { error?: { type?: string; message?: string } }).error
        : undefined,
  });

  return {
    ok: false,
    error: formatBreezyRejectionMessage(body.parsed, response.status),
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

  const contentType = response.headers.get("content-type") ?? "(missing)";
  if (response.status === 204 || response.ok) {
    console.info("[breezy-position-write] publish succeeded", {
      endpoint: path,
      status: response.status,
      contentType,
    });
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
        statusText: response.statusText,
        bodyPreview: bodyPreview(text),
      });
      return null;
    }
    const body = parseHttpBody(text);
    if (!body.isJson) {
      logBreezyNonJsonResponse({
        endpoint: path,
        status: response.status,
        statusText: response.statusText,
        bodyPreview: bodyPreview(text),
        label: "verify fetch non-json",
      });
      return null;
    }
    return body.parsed;
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
  console.info("[breezy-position-write] breezy create request", {
    endpoint: createPath,
    method: "POST",
    companyId: company.companyId,
    draftId: draft.id,
    payloadKeys: breezyPayloadKeys(built.payload),
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

  const body = parseHttpBody(text);
  const isJson = body.isJson;
  const contentType = response.headers.get("content-type") ?? "(missing)";

  console.info("[breezy-position-write] breezy create response", {
    endpoint: createPath,
    method: "POST",
    status: response.status,
    statusText: response.statusText,
    contentType,
    isJson,
    bodyPreview: bodyPreview(text),
    extractedPositionId: isJson ? extractCreatedBreezyPositionId(body.parsed) : null,
  });

  if (!isJson) {
    logBreezyNonJsonResponse({
      endpoint: createPath,
      status: response.status,
      statusText: response.statusText,
      bodyPreview: bodyPreview(text),
      label: "create non-json",
    });
    return {
      ok: false,
      error: breezyNonJsonErrorMessage(response.status),
      fetchedAt,
      rateLimited: response.status === 429,
    };
  }

  if (!response.ok) {
    return failureFromResponse("create", createPath, response, text, fetchedAt);
  }

  const breezyJobId = extractCreatedBreezyPositionId(body.parsed);
  if (!breezyJobId) {
    console.error("[breezy-position-write] create succeeded without position id", {
      endpoint: createPath,
      status: response.status,
      contentType,
      bodyPreview: bodyPreview(text),
      responseKeys:
        body.parsed && typeof body.parsed === "object" && !Array.isArray(body.parsed)
          ? Object.keys(body.parsed as Record<string, unknown>)
          : [],
    });
    return {
      ok: false,
      error:
        "Breezy accepted the request but did not return a position id. The job was not marked published.",
      fetchedAt,
    };
  }

  const createVerification = verifyBreezyPositionResponse(breezyJobId, body.parsed, {
    name: built.breezyTitle,
    city: built.draftSnapshot.city,
    state: built.draftSnapshot.usState,
    payRate: built.draftSnapshot.payRate,
  });

  const fetchedPosition = await fetchCreatedPosition(company.companyId, breezyJobId, apiKey);
  const verification =
    fetchedPosition !== null
      ? verifyBreezyPositionResponse(breezyJobId, fetchedPosition, {
          name: built.breezyTitle,
          city: built.draftSnapshot.city,
          state: built.draftSnapshot.usState,
          payRate: built.draftSnapshot.payRate,
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
      error: `Breezy created position ${breezyJobId} but publishing failed: ${publishFailure.error}`,
      fetchedAt: publishFailure.fetchedAt,
      rateLimited: publishFailure.rateLimited,
    };
  }

  if (!verification.ok) {
    console.warn("[breezy-position-write] post-publish verification advisory", {
      breezyJobId,
      mismatches: verification.mismatches,
    });
  }

  console.info("[breezy-position-write] push succeeded", {
    breezyJobId,
    endpoint: createPath,
    published: true,
    verificationOk: verification.ok,
  });

  return { ok: true, breezyJobId, fetchedAt, raw: body.parsed, verification };
}
