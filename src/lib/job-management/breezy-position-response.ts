/** Parse Breezy position create responses and API error bodies (no secrets). */

export type BreezyApiErrorBody = {
  error?: { type?: string; message?: string };
};

export function extractCreatedBreezyPositionId(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;

  if (Array.isArray(body)) {
    if (body.length === 1) return extractCreatedBreezyPositionId(body[0]);
    return null;
  }

  const record = body as Record<string, unknown>;
  for (const key of ["_id", "id", "friendly_id", "position_id"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  for (const nestedKey of ["position", "data", "result"]) {
    const nested = record[nestedKey];
    if (nested && typeof nested === "object") {
      const nestedId = extractCreatedBreezyPositionId(nested);
      if (nestedId) return nestedId;
    }
  }

  return null;
}

export function formatBreezyRejectionMessage(body: unknown, status: number): string {
  if (status === 401 || status === 403) {
    return "Breezy authentication failed. Check that BREEZY_API_KEY is active and has permission to create and publish positions for this company.";
  }
  if (status === 429) {
    return "Breezy rate limit reached. Retry after Breezy allows additional requests.";
  }
  if (status >= 500) {
    return `Breezy appears unavailable right now (HTTP ${status}). Retry shortly.`;
  }
  if (body && typeof body === "object" && "error" in body) {
    const err = (body as BreezyApiErrorBody).error;
    if (err?.message && err?.type) {
      return `Breezy rejected this job: ${err.message} (${err.type})`;
    }
    if (err?.message) return `Breezy rejected this job: ${err.message}`;
    if (err?.type) return `Breezy rejected this job (${err.type})`;
  }
  return `Breezy API request failed (HTTP ${status})`;
}

export function breezyPayloadKeys(payload: Record<string, unknown>): string[] {
  return Object.keys(payload).sort();
}
