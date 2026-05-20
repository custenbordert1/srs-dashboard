import { milesBetweenRepAndProject } from "@/lib/rep-intelligence/distance-engine";
import type { ActiveRep } from "@/lib/rep-intelligence/rep-types";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import type { NearbyRepCounts } from "@/lib/coverage-risk-engine/types";

export type RepProximityResult = NearbyRepCounts & {
  nearestActiveMiles: number | null;
};

export function countRepsNearOpportunity(
  reps: ActiveRep[],
  opportunity: MelOpportunity,
): RepProximityResult {
  let within10 = 0;
  let within25 = 0;
  let within50 = 0;
  let activeWithin50 = 0;
  let inactiveWithin50 = 0;
  let nearestActiveMiles: number | null = null;

  const project = { city: opportunity.city, state: opportunity.state };

  for (const rep of reps) {
    const miles = milesBetweenRepAndProject(rep, project);
    if (miles === null) continue;

    if (miles <= 10) within10 += 1;
    if (miles <= 25) within25 += 1;
    if (miles <= 50) {
      within50 += 1;
      if (rep.active) {
        activeWithin50 += 1;
        if (nearestActiveMiles === null || miles < nearestActiveMiles) {
          nearestActiveMiles = miles;
        }
      } else {
        inactiveWithin50 += 1;
      }
    }
  }

  return {
    within10,
    within25,
    within50,
    activeWithin50,
    inactiveWithin50,
    nearestActiveMiles,
  };
}
