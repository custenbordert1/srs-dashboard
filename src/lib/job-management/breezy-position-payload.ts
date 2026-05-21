import { normalizeGeoStateCode } from "@/lib/breezy-job-location";
import type { JobDraft } from "@/lib/job-management/job-draft-types";

export const BREEZY_POSITION_TYPES = new Set([
  "fullTime",
  "partTime",
  "contract",
  "temporary",
  "other",
]);
export const DEFAULT_BREEZY_POSITION_TYPE = "fullTime";
export const DEFAULT_BREEZY_DESCRIPTION = "Posted from SRS Recruiting Dashboard.";
export const BREEZY_COUNTRY_UNITED_STATES = "United States";

export type DraftPushFieldErrors = {
  title?: string;
  city?: string;
  usState?: string;
};

export type DraftPushValidationResult =
  | { ok: true }
  | { ok: false; errors: DraftPushFieldErrors; message: string };

export type BreezyPositionPayloadBuildResult =
  | {
      ok: true;
      payload: Record<string, unknown>;
      displayLocation: string;
      breezyTitle: string;
      draftSnapshot: {
        title: string;
        description: string;
        city: string;
        usState: string;
        payRate: string;
        department: string;
      };
    }
  | { ok: false; error: string; errors?: DraftPushFieldErrors };

export function normalizeDraftTitleForBreezy(title: string): string {
  return title.trim().replace(/\s+\(Draft\)\s*$/i, "").trim();
}

export function validateJobDraftForBreezyPush(draft: JobDraft): DraftPushValidationResult {
  const errors: DraftPushFieldErrors = {};
  const title = normalizeDraftTitleForBreezy(draft.title);
  const city = draft.city.trim();
  const usState = normalizeGeoStateCode(draft.usState);

  if (!title) {
    errors.title = "Job title is required.";
  }
  if (!city) {
    errors.city = "City is required before posting to Breezy.";
  }
  if (!usState) {
    errors.usState = "A valid US state (e.g. TX or Texas) is required before posting to Breezy.";
  }

  if (Object.keys(errors).length > 0) {
    return {
      ok: false,
      errors,
      message: "City and state must be filled in before pushing to Breezy.",
    };
  }

  return { ok: true };
}

export function buildDisplayLocation(city: string, state: string): string {
  return [city.trim(), state.trim()].filter(Boolean).join(", ");
}

export function buildBreezyPositionPayload(draft: JobDraft): BreezyPositionPayloadBuildResult {
  const validation = validateJobDraftForBreezyPush(draft);
  if (!validation.ok) {
    return { ok: false, error: validation.message, errors: validation.errors };
  }

  const breezyTitle = normalizeDraftTitleForBreezy(draft.title);
  const city = draft.city.trim();
  const usState = normalizeGeoStateCode(draft.usState);
  const description = draft.description.trim() || DEFAULT_BREEZY_DESCRIPTION;
  const displayLocation = buildDisplayLocation(city, usState);

  const typeCandidate = draft.metadata?.breezyPositionType?.trim();
  const type =
    typeCandidate && BREEZY_POSITION_TYPES.has(typeCandidate)
      ? typeCandidate
      : DEFAULT_BREEZY_POSITION_TYPE;

  const payload: Record<string, unknown> = {
    name: breezyTitle,
    description,
    type,
    location: {
      country: BREEZY_COUNTRY_UNITED_STATES,
      state: usState,
      city,
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

  if (draft.source.trim()) {
    payload.tags = [...(Array.isArray(payload.tags) ? (payload.tags as string[]) : []), draft.source.trim()];
  }

  return {
    ok: true,
    payload,
    displayLocation,
    breezyTitle,
    draftSnapshot: {
      title: breezyTitle,
      description,
      city,
      usState,
      payRate: draft.payRate.trim(),
      department: draft.department.trim(),
    },
  };
}

export type BreezyPositionVerification = {
  ok: boolean;
  breezyJobId: string;
  expected: { name: string; city: string; state: string };
  actual: { name: string; city: string; state: string; displayLocation: string };
  mismatches: string[];
};

export function verifyBreezyPositionResponse(
  breezyJobId: string,
  raw: unknown,
  expected: { name: string; city: string; state: string },
): BreezyPositionVerification {
  const record =
    raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const name =
    typeof record.name === "string"
      ? record.name.trim()
      : typeof record.title === "string"
        ? record.title.trim()
        : "";

  const location =
    record.location && typeof record.location === "object" && !Array.isArray(record.location)
      ? (record.location as Record<string, unknown>)
      : null;
  const city = typeof location?.city === "string" ? location.city.trim() : "";
  const stateRaw = location?.state;
  const state =
    typeof stateRaw === "string"
      ? normalizeGeoStateCode(stateRaw)
      : stateRaw && typeof stateRaw === "object"
        ? normalizeGeoStateCode(
            typeof (stateRaw as Record<string, unknown>).id === "string"
              ? String((stateRaw as Record<string, unknown>).id)
              : typeof (stateRaw as Record<string, unknown>).name === "string"
                ? String((stateRaw as Record<string, unknown>).name)
                : "",
          )
        : "";

  const actual = {
    name,
    city,
    state,
    displayLocation: buildDisplayLocation(city, state),
  };

  const mismatches: string[] = [];
  if (name && name !== expected.name) mismatches.push(`title (expected "${expected.name}", got "${name}")`);
  if (city && city.toLowerCase() !== expected.city.toLowerCase()) {
    mismatches.push(`city (expected "${expected.city}", got "${city}")`);
  }
  if (state && state !== expected.state) {
    mismatches.push(`state (expected "${expected.state}", got "${state}")`);
  }
  if (!city) mismatches.push("city missing in Breezy response");
  if (!state) mismatches.push("state missing in Breezy response");

  return {
    ok: mismatches.length === 0,
    breezyJobId,
    expected,
    actual,
    mismatches,
  };
}
