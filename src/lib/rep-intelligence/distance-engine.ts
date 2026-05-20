import { normalizeStateCode } from "@/lib/dm-territory-map";
import {
  distanceBetweenLocations,
  estimateGeoPoint,
  haversineMiles,
  type GeoPoint,
} from "@/lib/mel-matching/distance-utils";

export function normalizeZip(zip: string): string {
  const digits = zip.replace(/\D/g, "");
  if (digits.length >= 5) return digits.slice(0, 5);
  return "";
}

export function repGeoPoint(city: string, state: string, zip: string): GeoPoint | null {
  const fromZip = zipToApproxPoint(normalizeZip(zip), state);
  if (fromZip) return fromZip;
  return estimateGeoPoint(city, state);
}

function zipToApproxPoint(zip: string, state: string): GeoPoint | null {
  if (!zip) return null;
  const base = estimateGeoPoint("", state);
  if (!base) return null;
  const n = Number(zip);
  if (Number.isNaN(n)) return base;
  const latOffset = ((n % 97) - 48) * 0.05;
  const lngOffset = (((n / 97) | 0) % 97 - 48) * 0.07;
  return { lat: base.lat + latOffset, lng: base.lng + lngOffset };
}

export function milesBetweenRepAndProject(
  rep: { city: string; state: string; zip: string; lat: number | null; lng: number | null },
  project: { city: string; state: string; lat?: number | null; lng?: number | null },
): number | null {
  const projectPoint =
    project.lat !== null &&
    project.lat !== undefined &&
    project.lng !== null &&
    project.lng !== undefined
      ? { lat: project.lat, lng: project.lng }
      : estimateGeoPoint(project.city, project.state);

  if (rep.lat !== null && rep.lng !== null && projectPoint) {
    return haversineMiles({ lat: rep.lat, lng: rep.lng }, projectPoint);
  }
  return distanceBetweenLocations(rep.city, rep.state, project.city, project.state);
}

export function driveRadiusScore(distanceMiles: number | null, travelRadius: number): number {
  if (distanceMiles === null) return 8;
  if (distanceMiles <= 15) return 30;
  if (distanceMiles <= travelRadius * 0.6) return 24;
  if (distanceMiles <= travelRadius) return 18;
  if (distanceMiles <= travelRadius * 1.25) return 10;
  return 3;
}

export function territoryProximityScore(repState: string, projectState: string, territoryStates?: string[]): number {
  const r = normalizeStateCode(repState);
  const p = normalizeStateCode(projectState);
  if (!r || !p) return 4;
  if (r === p) return 15;
  if (territoryStates?.includes(p)) return 10;
  return 2;
}
