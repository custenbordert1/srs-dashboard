/** Future-ready travel cost model — heuristic until Maps/hotel APIs are wired. */
export const MILEAGE_REIMBURSEMENT_RATE_USD = 0.67;
export const AVERAGE_HOTEL_NIGHT_USD = 128;
export const AVERAGE_DRIVE_SPEED_MPH = 52;
export const ROAD_DISTANCE_FACTOR = 1.28;
export const OVERNIGHT_DRIVE_MINUTES = 8 * 60;

export function estimateDriveTimeMinutes(distanceMiles: number | null): number | null {
  if (distanceMiles === null) return null;
  return Math.round((distanceMiles * ROAD_DISTANCE_FACTOR) / AVERAGE_DRIVE_SPEED_MPH * 60);
}

export function requiresOvernightStay(driveTimeMinutes: number | null, distanceMiles: number | null): boolean {
  if (driveTimeMinutes !== null && driveTimeMinutes >= OVERNIGHT_DRIVE_MINUTES) return true;
  if (distanceMiles !== null && distanceMiles >= 250) return true;
  return false;
}

export function estimateMileageCostUsd(distanceMiles: number | null): number | null {
  if (distanceMiles === null) return null;
  return Math.round(distanceMiles * ROAD_DISTANCE_FACTOR * MILEAGE_REIMBURSEMENT_RATE_USD);
}

export function estimateProjectTravelCostUsd(input: {
  distanceMiles: number | null;
  driveTimeMinutes: number | null;
}): number | null {
  const mileage = estimateMileageCostUsd(input.distanceMiles);
  if (mileage === null) return null;
  const nights = requiresOvernightStay(input.driveTimeMinutes, input.distanceMiles) ? 1 : 0;
  return mileage + nights * AVERAGE_HOTEL_NIGHT_USD;
}

export type RoutingProviderId = "heuristic" | "google-maps" | "mapbox";

export const ROUTING_PROVIDER_CAPABILITIES = {
  heuristic: { enabled: true, label: "Heuristic (haversine)" },
  "google-maps": { enabled: false, label: "Google Maps API (stub)" },
  mapbox: { enabled: false, label: "Mapbox API (stub)" },
} as const;
