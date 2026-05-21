import { parseCityStateFromText } from "@/lib/breezy-job-location";
import {
  formatUsDisplayLocation,
  resolveUsStateCode,
  sanitizeCityValue,
} from "@/lib/job-management/us-location-rules";

export type NormalizedJobLocationFields = {
  city: string;
  usState: string;
  displayLocation: string;
  wasSplit: boolean;
  stateInvalid: boolean;
};

/** Split "Dallas, TX" in city field into separate city + state when state is empty. */
export function normalizeJobLocationFields(
  city: string,
  usState: string,
): NormalizedJobLocationFields {
  let normalizedCity = sanitizeCityValue(city);
  let stateResolution = resolveUsStateCode(usState);
  let normalizedState = stateResolution.code;
  let stateInvalid = stateResolution.invalid;

  let wasSplit = false;
  if (normalizedCity.includes(",") && !normalizedState) {
    const parsed = parseCityStateFromText(normalizedCity);
    if (parsed.city) normalizedCity = sanitizeCityValue(parsed.city);
    if (parsed.state) {
      stateResolution = resolveUsStateCode(parsed.state);
      normalizedState = stateResolution.code;
      stateInvalid = stateResolution.invalid;
    }
    wasSplit = Boolean(parsed.city || parsed.state);
  }

  if (!normalizedState && normalizedCity) {
    const tailState = normalizedCity.match(/\s+([A-Za-z]{2})$/);
    if (tailState) {
      stateResolution = resolveUsStateCode(tailState[1]);
      if (stateResolution.code) {
        normalizedCity = sanitizeCityValue(
          normalizedCity.slice(0, -tailState[0].length).trim(),
        );
        normalizedState = stateResolution.code;
        stateInvalid = false;
        wasSplit = true;
      }
    }
  }

  normalizedCity = sanitizeCityValue(normalizedCity);
  const displayLocation = formatUsDisplayLocation(normalizedCity, normalizedState);

  return {
    city: normalizedCity,
    usState: normalizedState,
    displayLocation,
    wasSplit,
    stateInvalid,
  };
}

export function normalizeJobDraftLocationPatch<T extends { city?: string; usState?: string }>(
  patch: T,
): T & { city?: string; usState?: string } {
  if (patch.city === undefined && patch.usState === undefined) return patch;
  const normalized = normalizeJobLocationFields(patch.city ?? "", patch.usState ?? "");
  return {
    ...patch,
    ...(patch.city !== undefined ? { city: normalized.city } : {}),
    ...(patch.usState !== undefined ? { usState: normalized.usState } : {}),
  };
}
