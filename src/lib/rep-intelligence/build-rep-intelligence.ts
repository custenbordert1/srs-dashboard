import { listImportedReps } from "@/lib/active-rep-store";
import { batchResolveCoordinates } from "@/lib/geocoding/geocoder";
import type { MelProjectRow } from "@/lib/mel-projects-sheet";
import { parseMelOpportunities, filterOpportunitiesByTerritory } from "@/lib/mel-matching/mel-opportunity-parser";
import { matchRepToOpportunity } from "@/lib/rep-intelligence/opportunity-matching";
import {
  buildActiveRepsFromMelRows,
  buildRepIntelligenceSnapshot,
} from "@/lib/rep-intelligence/rep-engine";
import { buildStaffingRecommendations } from "@/lib/rep-intelligence/staffing-recommendation-engine";
import type { ActiveRep, RepIntelligenceSnapshot, RepProjectMatchRow } from "@/lib/rep-intelligence/rep-types";

function mergeReps(melReps: ActiveRep[], imported: ActiveRep[]): ActiveRep[] {
  const map = new Map<string, ActiveRep>();
  for (const rep of melReps) map.set(rep.repId, rep);
  for (const rep of imported) {
    const existing = map.get(rep.repId);
    if (existing) {
      map.set(rep.repId, {
        ...existing,
        ...rep,
        openAssignments: existing.openAssignments,
        completedAssignments: existing.completedAssignments,
        skills: rep.skills.length > 0 ? rep.skills : existing.skills,
        travelRadius: rep.travelRadius || existing.travelRadius,
      });
    } else {
      map.set(rep.repId, rep);
    }
  }
  return [...map.values()];
}

async function applyGeocodesToReps(reps: ActiveRep[]): Promise<{ reps: ActiveRep[]; geocoded: number }> {
  const coords = await batchResolveCoordinates(
    reps.map((r) => ({ id: r.repId, city: r.city, state: r.state, zip: r.zip })),
    { maxNetwork: 10 },
  );
  let geocoded = 0;
  const updated = reps.map((rep) => {
    const c = coords.get(rep.repId);
    if (!c) return rep;
    if (c.source === "nominatim") geocoded += 1;
    return { ...rep, lat: c.lat, lng: c.lng };
  });
  return { reps: updated, geocoded };
}

function buildRepProjectMatches(
  reps: ActiveRep[],
  opportunities: ReturnType<typeof parseMelOpportunities>,
  territoryStates?: string[],
): RepProjectMatchRow[] {
  const openUnstaffed = opportunities.filter((o) => o.openStatus && !o.isStaffed);
  const rows: RepProjectMatchRow[] = [];

  for (const opportunity of openUnstaffed) {
    for (const rep of reps.filter((r) => r.active)) {
      const match = matchRepToOpportunity(rep, opportunity, { territoryStates });
      if (match.matchScore < 50) continue;
      rows.push({
        repId: rep.repId,
        repName: rep.name,
        opportunityId: opportunity.opportunityId,
        projectName: opportunity.projectName,
        client: opportunity.client,
        storeName: opportunity.storeName,
        state: opportunity.state,
        matchScore: match.matchScore,
        fitLevel: match.fitLevel,
        riskLevel: match.riskLevel,
        distanceMiles: match.distanceMiles,
        recommendedAction: match.recommendedAction,
      });
    }
  }

  return rows.sort((a, b) => b.matchScore - a.matchScore).slice(0, 40);
}

export async function buildRepIntelligenceWithGeocoding(
  melRows: MelProjectRow[],
  fetchedAt: string,
  territoryStates?: string[],
): Promise<RepIntelligenceSnapshot> {
  const imported = await listImportedReps();
  const melReps = buildActiveRepsFromMelRows(melRows);
  const merged = mergeReps(melReps, imported);
  const scopedReps =
    territoryStates && territoryStates.length > 0
      ? merged.filter((r) => territoryStates.includes(r.state))
      : merged;

  const { reps: geocodedReps, geocoded: geocodedRepCount } = await applyGeocodesToReps(scopedReps);

  const base = buildRepIntelligenceSnapshot(melRows, fetchedAt, territoryStates, geocodedReps);
  const opportunities = filterOpportunitiesByTerritory(parseMelOpportunities(melRows), territoryStates);

  const repProjectMatches = buildRepProjectMatches(geocodedReps, opportunities, territoryStates);
  const staffingRecommendations = buildStaffingRecommendations({
    reps: geocodedReps,
    opportunities,
    coverageGaps: base.coverageGaps,
    territoryStates,
  });

  return {
    ...base,
    activeReps: geocodedReps,
    repProjectMatches,
    staffingRecommendations,
    geocodedRepCount,
    geocodedOpportunityCount: 0,
    importedRepCount: imported.length,
  };
}
