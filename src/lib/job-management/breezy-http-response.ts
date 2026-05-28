import type { BreezyPositionVerification } from "@/lib/job-management/breezy-position-payload";
import type { JobDraft } from "@/lib/job-management/job-draft-types";

/** Safe parsing for Breezy HR and Job Management API HTTP bodies. */

export const BREEZY_NON_JSON_USER_MESSAGE =
  "Breezy returned a non-JSON response while posting this job. Check Breezy auth/API endpoint.";

export const BREEZY_HTTP_BODY_PREVIEW_MAX = 300;

export function isJsonContentType(contentType: string | null | undefined): boolean {
  const normalized = (contentType ?? "").toLowerCase();
  return normalized.includes("application/json") || normalized.includes("+json");
}

export function bodyPreview(text: string, maxLen = BREEZY_HTTP_BODY_PREVIEW_MAX): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (!compact) return "(empty body)";
  return compact.length <= maxLen ? compact : `${compact.slice(0, maxLen)}…`;
}

export function parseHttpBody(
  text: string,
): { isJson: true; parsed: unknown } | { isJson: false } {
  const trimmed = text.trim();
  if (!trimmed) {
    return { isJson: true, parsed: null };
  }
  if (trimmed.startsWith("<")) {
    return { isJson: false };
  }
  try {
    return { isJson: true, parsed: JSON.parse(text) as unknown };
  } catch {
    return { isJson: false };
  }
}

export function logBreezyNonJsonResponse(input: {
  endpoint: string;
  status: number;
  statusText: string;
  bodyPreview: string;
  label?: string;
}): void {
  console.error(`[breezy-position-write] ${input.label ?? "non-json response"}`, {
    endpoint: input.endpoint,
    status: input.status,
    statusText: input.statusText,
    bodyPreview: input.bodyPreview,
  });
}

export function breezyNonJsonErrorMessage(status: number): string {
  return `${BREEZY_NON_JSON_USER_MESSAGE} (HTTP ${status}).`;
}

export type JobManagementPushResponse = {
  ok?: boolean;
  draft?: JobDraft;
  breezyJobId?: string;
  error?: string;
  rateLimited?: boolean;
  fieldErrors?: Record<string, string>;
  verification?: BreezyPositionVerification;
  postedAt?: string;
};

/** Parse Job Management draft push API responses without throwing on HTML error pages. */
export async function parseJobManagementPushResponse(
  res: Response,
): Promise<JobManagementPushResponse> {
  const contentType = res.headers.get("content-type") ?? "";
  const text = await res.text();

  const looksLikeHtml = text.trim().startsWith("<");
  if (looksLikeHtml || !isJsonContentType(contentType)) {
    console.warn("[job-draft-push] non-json api response", {
      status: res.status,
      statusText: res.statusText,
      contentType: contentType || "(missing)",
      bodyPreview: bodyPreview(text),
    });
    return {
      ok: false,
      error:
        res.status === 401 || res.status === 403
          ? "Session expired or unauthorized. Sign in again and retry the push."
          : breezyNonJsonErrorMessage(res.status),
    };
  }

  const body = parseHttpBody(text);
  if (!body.isJson) {
    return {
      ok: false,
      error: breezyNonJsonErrorMessage(res.status),
    };
  }

  if (body.parsed && typeof body.parsed === "object") {
    return body.parsed as JobManagementPushResponse;
  }

  return {
    ok: false,
    error: `Push API returned an unexpected response (HTTP ${res.status}).`,
  };
}
