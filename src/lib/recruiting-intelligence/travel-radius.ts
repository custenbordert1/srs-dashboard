import { distanceBetweenLocations, haversineMiles, estimateGeoPoint, type GeoPoint } from "@/lib/mel-matching/distance-utils";
import { normalizeStateCode } from "@/lib/dm-territory-map";
import { normalizeZip } from "@/lib/recruiting-intelligence/resume-parser";
import type { CandidateIntelligenceJobContext } from "@/lib/recruiting-intelligence/types";

/** Lightweight ZIP3 → offset from state centroid (miles-scale approximation). */
const ZIP3_OFFSETS: Record<string, { dLat: number; dLng: number }> = {
  "100": { dLat: 0.4, dLng: -0.6 },
  "200": { dLat: 0.2, dLng: -0.5 },
  "300": { dLat: -0.3, dLng: -0.4 },
  "400": { dLat: -0.1, dLng: -0.3 },
  "500": { dLat: 0.1, dLng: -0.2 },
  "600": { dLat: 0.3, dLng: -0.3 },
  "700": { dLat: -0.2, dLng: -0.5 },
  "800": { dLat: 0.5, dLng: -1.2 },
  "900": { dLat: 0.4, dLng: -1.4 },
};

function estimatePointFromZip(zip: string, fallbackState: string): GeoPoint | null {
  const normalized = normalizeZip(zip);
  if (!normalized) return null;
  const state = normalizeStateCode(fallbackState);
  const base = estimateGeoPoint("", state);
  if (!base) return null;
  const prefix = normalized.slice(0, 3);
  const offset = ZIP3_OFFSETS[prefix] ?? { dLat: 0, dLng: 0 };
  return { lat: base.lat + offset.dLat, lng: base.lng + offset.dLng };
}

export function distanceMilesForCandidateToJob(
  candidateZip: string,
  candidateCity: string,
  candidateState: string,
  job: CandidateIntelligenceJobContext,
): number | null {
  const jobCity = job.city.trim();
  const jobState = job.state.trim();

  const zipPoint = candidateZip ? estimatePointFromZip(candidateZip, candidateState) : null;
  const jobZipPoint = job.zip ? estimatePointFromZip(job.zip, jobState) : null;
  const jobPoint = jobZipPoint ?? estimateGeoPoint(jobCity, jobState);
  const candidatePoint = zipPoint ?? estimateGeoPoint(candidateCity, candidateState);

  if (candidatePoint && jobPoint) {
    return haversineMiles(candidatePoint, jobPoint);
  }

  return distanceBetweenLocations(candidateCity, candidateState, jobCity, jobState);
}

export function scoreTravelRadiusMatch(distanceMiles: number | null, resumeMentionsTravel: boolean): number {
  if (distanceMiles === null) {
    return resumeMentionsTravel ? 55 : 45;
  }
  if (distanceMiles <= 25) return 100;
  if (distanceMiles <= 45) return 88;
  if (distanceMiles <= 75) return 72;
  if (distanceMiles <= 120) return 52;
  if (distanceMiles <= 200) return 32;
  return resumeMentionsTravel ? 28 : 18;
}
