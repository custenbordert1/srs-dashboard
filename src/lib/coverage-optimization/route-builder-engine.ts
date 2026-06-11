import { estimateGeoPoint, haversineMiles } from "@/lib/mel-matching/distance-utils";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import {
  AVERAGE_HOTEL_NIGHT_USD,
  estimateDriveTimeMinutes,
  estimateMileageCostUsd,
  requiresOvernightStay,
  ROAD_DISTANCE_FACTOR,
} from "@/lib/coverage-optimization/travel-cost-model";
import type { RoutePlan, RoutePlanStop } from "@/lib/coverage-optimization/types";

function opportunityPoint(opportunity: MelOpportunity) {
  return estimateGeoPoint(opportunity.city, opportunity.state);
}

/** Nearest-neighbor ordering — provider-ready for Google Maps / Mapbox replacement. */
function orderStops(opportunities: MelOpportunity[]): MelOpportunity[] {
  if (opportunities.length <= 1) return opportunities;
  const remaining = [...opportunities];
  const ordered: MelOpportunity[] = [];
  let current = remaining.shift()!;
  ordered.push(current);

  while (remaining.length > 0) {
    const currentPoint = opportunityPoint(current);
    let bestIdx = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let i = 0; i < remaining.length; i += 1) {
      const point = opportunityPoint(remaining[i]!);
      if (!currentPoint || !point) continue;
      const miles = haversineMiles(currentPoint, point);
      if (miles < bestDistance) {
        bestDistance = miles;
        bestIdx = i;
      }
    }
    current = remaining.splice(bestIdx, 1)[0]!;
    ordered.push(current);
  }

  return ordered;
}

export function buildRoutePlan(opportunityIds: string[], opportunities: MelOpportunity[]): RoutePlan | null {
  const selected = opportunities.filter((row) => opportunityIds.includes(row.opportunityId));
  if (selected.length === 0) return null;

  const ordered = orderStops(selected);
  const stops: RoutePlanStop[] = [];
  let totalMiles = 0;
  let totalDriveTimeMinutes = 0;
  let previousPoint = opportunityPoint(ordered[0]!);

  for (let index = 0; index < ordered.length; index += 1) {
    const opportunity = ordered[index]!;
    const point = opportunityPoint(opportunity);
    let distanceFromPrevious: number | null = null;
    if (index > 0 && previousPoint && point) {
      distanceFromPrevious = Math.round(haversineMiles(previousPoint, point) * ROAD_DISTANCE_FACTOR);
      totalMiles += distanceFromPrevious;
      const legMinutes = estimateDriveTimeMinutes(distanceFromPrevious) ?? 0;
      totalDriveTimeMinutes += legMinutes;
    }
    stops.push({
      opportunityId: opportunity.opportunityId,
      projectName: opportunity.projectName,
      city: opportunity.city,
      state: opportunity.state,
      order: index + 1,
      distanceFromPreviousMiles: distanceFromPrevious,
      driveTimeMinutes: distanceFromPrevious !== null ? estimateDriveTimeMinutes(distanceFromPrevious) : null,
    });
    previousPoint = point;
  }

  const overnightRecommended = requiresOvernightStay(totalDriveTimeMinutes, totalMiles);
  const hotelNights = overnightRecommended ? Math.max(1, Math.ceil(totalDriveTimeMinutes / (8 * 60)) - 1) : 0;
  const mileageCostUsd = estimateMileageCostUsd(totalMiles) ?? 0;
  const hotelCostUsd = hotelNights * AVERAGE_HOTEL_NIGHT_USD;

  return {
    routeId: `route:${opportunityIds.sort().join("|")}`,
    stops,
    totalMiles: Math.round(totalMiles),
    totalDriveTimeMinutes,
    overnightRecommended,
    estimatedTotalCostUsd: mileageCostUsd + hotelCostUsd,
    hotelNights,
    mileageCostUsd,
    hotelCostUsd,
  };
}
