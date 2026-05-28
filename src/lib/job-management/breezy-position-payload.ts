import { normalizeGeoStateCode } from "@/lib/breezy-job-location";
import { normalizeJobLocationFields } from "@/lib/job-management/normalize-job-location-fields";
import {
  BREEZY_COUNTRY_CODE,
  formatUsDisplayLocation,
} from "@/lib/job-management/us-location-rules";
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
export { BREEZY_COUNTRY_CODE } from "@/lib/job-management/us-location-rules";

export type DraftPushFieldErrors = {
  title?: string;
  description?: string;
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
  const description = draft.description.trim();
  const location = normalizeJobLocationFields(draft.city, draft.usState);

  if (!title) {
    errors.title = "Job title is required.";
  }
  if (!description) {
    errors.description = "Job description is required before posting to Breezy.";
  }
  if (!location.city) {
    errors.city = "City is required (US city only — do not include state in the city field).";
  }
  if (location.stateInvalid) {
    errors.usState = "State must be a valid 2-letter US abbreviation (e.g. TX). International states are not supported.";
  } else if (!location.usState) {
    errors.usState = "State is required (2-letter US code, e.g. TX). Full names like Texas are accepted and normalized.";
  }

  if (Object.keys(errors).length > 0) {
    return {
      ok: false,
      errors,
      message: "Title, description, city, and state are required before pushing to Breezy.",
    };
  }

  return { ok: true };
}

export function buildDisplayLocation(city: string, state: string): string {
  return formatUsDisplayLocation(city, state);
}

export function buildBreezyPositionPayload(draft: JobDraft): BreezyPositionPayloadBuildResult {
  const validation = validateJobDraftForBreezyPush(draft);
  if (!validation.ok) {
    return { ok: false, error: validation.message, errors: validation.errors };
  }

  const breezyTitle = normalizeDraftTitleForBreezy(draft.title);
  const location = normalizeJobLocationFields(draft.city, draft.usState);
  const city = location.city;
  const usState = location.usState;
  const description = draft.description.trim();
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
      country: BREEZY_COUNTRY_CODE,
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

function payRateFromBreezyRecord(record: Record<string, unknown>): string {
  const attrs = record.custom_attributes;
  if (!Array.isArray(attrs)) return "";
  for (const item of attrs) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const attr = item as Record<string, unknown>;
    const name = typeof attr.name === "string" ? attr.name.trim().toLowerCase() : "";
    if (name !== "pay rate") continue;
    const value = typeof attr.value === "string" ? attr.value.trim() : "";
    if (value) return value;
  }
  return "";
}

export type BreezyPositionVerification = {
  ok: boolean;
  breezyJobId: string;
  expected: { name: string; city: string; state: string; payRate: string };
  actual: { name: string; city: string; state: string; displayLocation: string; payRate: string };
  mismatches: string[];
};

export function verifyBreezyPositionResponse(
  breezyJobId: string,
  raw: unknown,
  expected: { name: string; city: string; state: string; payRate?: string },
): BreezyPositionVerification {
  const expectedPayRate = (expected.payRate ?? "").trim();
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

  const payRate = payRateFromBreezyRecord(record);

  const actual = {
    name,
    city,
    state,
    displayLocation: buildDisplayLocation(city, state),
    payRate,
  };

  const mismatches: string[] = [];
  if (name && name !== expected.name) mismatches.push(`title (expected "${expected.name}", got "${name}")`);
  if (city && city.toLowerCase() !== expected.city.toLowerCase()) {
    mismatches.push(`city (expected "${expected.city}", got "${city}")`);
  }
  if (state && state !== expected.state) {
    mismatches.push(`state (expected "${expected.state}", got "${state}")`);
  }
  if (expectedPayRate && payRate && payRate !== expectedPayRate) {
    mismatches.push(`pay rate (expected "${expectedPayRate}", got "${payRate}")`);
  }

  return {
    ok: mismatches.length === 0,
    breezyJobId,
    expected: {
      name: expected.name,
      city: expected.city,
      state: expected.state,
      payRate: expectedPayRate,
    },
    actual,
    mismatches,
  };
}
