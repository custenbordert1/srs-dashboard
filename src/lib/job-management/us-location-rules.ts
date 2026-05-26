import { normalizeGeoStateCode } from "@/lib/breezy-job-location";

/** SRS operates in the United States only — always sent to Breezy as "US". */
export const BREEZY_COUNTRY_CODE = "US";

/** Trim whitespace and stray commas from city input (city must not include state). */
export function sanitizeCityValue(city: string): string {
  return city
    .trim()
    .replace(/^[\s,]+|[\s,]+$/g, "")
    .replace(/\s*,\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type UsStateResolution = {
  /** Two-letter US state code, or empty when missing/invalid. */
  code: string;
  /** True when user entered a value that is not a recognized US state. */
  invalid: boolean;
};

/** Resolve state to a 2-letter US code; reject international or unknown values. */
export function resolveUsStateCode(raw: string): UsStateResolution {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { code: "", invalid: false };
  }

  const code = normalizeGeoStateCode(trimmed);
  if (!code) {
    return { code: "", invalid: true };
  }

  return { code, invalid: false };
}

/** Display format for dashboards: "Dallas, TX". */
export function formatUsDisplayLocation(city: string, stateCode: string): string {
  const cleanCity = sanitizeCityValue(city);
  const code = normalizeGeoStateCode(stateCode);
  if (!cleanCity && !code) return "";
  if (!code) return cleanCity;
  if (!cleanCity) return code;
  return `${cleanCity}, ${code}`;
}
