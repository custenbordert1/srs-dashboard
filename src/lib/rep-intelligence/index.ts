export type {
  ActiveRep,
  RepIntelligenceSnapshot,
  RepOpportunityMatch,
  CoverageGap,
  TerritoryCoverageHealth,
} from "@/lib/rep-intelligence/rep-types";
export { buildActiveRepsFromMelRows, buildRepIntelligenceSnapshot } from "@/lib/rep-intelligence/rep-engine";
export { matchRepToOpportunity } from "@/lib/rep-intelligence/opportunity-matching";
export {
  milesBetweenRepAndProject,
  driveRadiusScore,
  territoryProximityScore,
} from "@/lib/rep-intelligence/distance-engine";
