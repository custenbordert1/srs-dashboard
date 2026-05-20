import { getBreezyApiKeySync, loadConfigSync } from "@/lib/config";
import { resolveBreezyCompany } from "@/lib/breezy-api";
import type { JobDraft } from "@/lib/job-management/job-draft-types";

const BREEZY_API_BASE = "https://api.breezy.hr/v3";
const BREEZY_WRITE_TIMEOUT_MS = 20_000;

export type BreezyPositionCreateResult =
  | { ok: true; breezyJobId: string; fetchedAt: string; raw?: unknown }
  | { ok: false; error: string; fetchedAt: string; rateLimited?: boolean };

function extractCreatedJobId(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const id = record._id ?? record.id ?? record.friendly_id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

/**
 * Creates a Breezy position (draft pipeline state) — caller must require explicit user confirmation.
 */
export async function createBreezyPositionFromDraft(
  draft: JobDraft,
): Promise<BreezyPositionCreateResult> {
  loadConfigSync();
  const apiKey = getBreezyApiKeySync();
  const fetchedAt = new Date().toISOString();
  if (!apiKey) {
    return { ok: false, error: "Breezy API key is not configured.", fetchedAt };
  }

  const company = await resolveBreezyCompany();
  if (!company.ok) {
    return { ok: false, error: company.error, fetchedAt };
  }

  const payload: Record<string, unknown> = {
    name: draft.title.trim(),
    description: draft.description.trim() || undefined,
    city: draft.city.trim() || undefined,
    state: "draft",
    location: {
      city: draft.city.trim() || undefined,
      state: draft.usState.trim() || undefined,
      country: "US",
    },
    department: draft.department.trim() ? { name: draft.department.trim() } : undefined,
    origin: draft.source || "SRS Dashboard",
  };

  if (draft.payRate.trim()) {
    payload.compensation = { value: draft.payRate.trim() };
  }

  let response: Response;
  try {
    response = await fetch(
      `${BREEZY_API_BASE}/company/${encodeURIComponent(company.companyId)}/position`,
      {
        method: "POST",
        headers: {
          Authorization: apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        cache: "no-store",
        signal: AbortSignal.timeout(BREEZY_WRITE_TIMEOUT_MS),
      },
    );
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to reach Breezy API",
      fetchedAt,
    };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return {
      ok: false,
      error: `Breezy returned non-JSON (HTTP ${response.status})`,
      fetchedAt,
      rateLimited: response.status === 429,
    };
  }

  if (!response.ok) {
    const message =
      typeof body === "object" && body && "error" in body
        ? String((body as { error?: { message?: string } }).error?.message ?? response.status)
        : `Breezy create failed (HTTP ${response.status})`;
    return {
      ok: false,
      error: message,
      fetchedAt,
      rateLimited: response.status === 429,
    };
  }

  const breezyJobId = extractCreatedJobId(body);
  if (!breezyJobId) {
    return {
      ok: false,
      error: "Breezy created a position but response did not include a job id.",
      fetchedAt,
    };
  }

  return { ok: true, breezyJobId, fetchedAt, raw: body };
}
