import { normalizeStateCode } from "@/lib/dm-territory-map";
import type { MelProjectRow } from "@/lib/mel-projects-sheet";
import {
  isCompletedStoreCallStatus,
  resolveMelProjectColumnKeys,
} from "@/lib/mel-projects-metrics";
import { parseMelOpportunities } from "@/lib/mel-matching/mel-opportunity-parser";
import { repGeoPoint } from "@/lib/rep-intelligence/distance-engine";
import { inferSkillsFromProjects } from "@/lib/rep-intelligence/rep-scoring";
import type { ActiveRep, RepIntelligenceSnapshot, RepMelStatus, RepTrainingStatus } from "@/lib/rep-intelligence/rep-types";
import {
  bestRepForOpportunity,
  buildCoverageGaps,
  fillProbabilityFromMatch,
  rankRepUtilization,
  territoryStaffingScore,
} from "@/lib/rep-intelligence/coverage-health";
import { filterOpportunitiesByTerritory } from "@/lib/mel-matching/mel-opportunity-parser";

type RepAgg = {
  repId: string;
  name: string;
  city: string;
  state: string;
  zip: string;
  dmOwner: string;
  completed: number;
  open: number;
  noShows: number;
  projectTypes: string[];
  lastDate: string | null;
};

function cell(row: MelProjectRow, key: string | undefined): string {
  if (!key) return "";
  return (row[key] ?? "").trim();
}

function isAssignedRep(staffName: string): boolean {
  const name = staffName.trim().toLowerCase();
  return Boolean(name && name !== "open" && name !== "—" && name !== "unassigned" && name !== "tbd");
}

function inferMelStatus(open: number, completed: number): RepMelStatus {
  if (open > 0) return "active";
  if (completed > 0) return "inactive";
  return "unknown";
}

function inferTraining(completionRate: number): RepTrainingStatus {
  if (completionRate >= 90) return "certified";
  if (completionRate >= 75) return "in_training";
  return "needs_training";
}

export function buildActiveRepsFromMelRows(rows: MelProjectRow[]): ActiveRep[] {
  if (rows.length === 0) return [];
  const headers = Object.keys(rows[0] ?? {});
  const keys = resolveMelProjectColumnKeys(headers);
  const cityKey = headers.find((h) => /city/i.test(h));
  const zipKey = headers.find((h) => /zip|postal/i.test(h));

  const agg = new Map<string, RepAgg>();

  for (const row of rows) {
    const staffName = cell(row, keys.staffName);
    if (!isAssignedRep(staffName)) continue;
    const staffNumber = cell(row, keys.staffNumber);
    const repId = (staffNumber || staffName).toLowerCase();
    const state = normalizeStateCode(cell(row, keys.state));
    const city = cell(row, cityKey) || cell(row, keys.storeName) || "";
    const zip = cell(row, zipKey);
    const manager = cell(row, keys.manager) || "Unassigned";
    const status = cell(row, keys.status);
    const completed = isCompletedStoreCallStatus(status);
    const projectName = cell(row, keys.projectName);

    const entry =
      agg.get(repId) ??
      ({
        repId,
        name: staffName,
        city,
        state,
        zip,
        dmOwner: manager,
        completed: 0,
        open: 0,
        noShows: 0,
        projectTypes: [],
        lastDate: null,
      } satisfies RepAgg);

    if (projectName) entry.projectTypes.push(projectName);
    if (completed) entry.completed += 1;
    else entry.open += 1;
    if (/no\s*show|ncns|absent/i.test(status)) entry.noShows += 1;

    agg.set(repId, entry);
  }

  const reps: ActiveRep[] = [];
  for (const entry of agg.values()) {
    const total = entry.completed + entry.open;
    const completionRate = total > 0 ? Math.round((entry.completed / total) * 100) : 0;
    const noShowRate = total > 0 ? Math.round((entry.noShows / total) * 100) : 0;
    const point = repGeoPoint(entry.city, entry.state, entry.zip);

    reps.push({
      repId: entry.repId,
      name: entry.name,
      city: entry.city,
      state: entry.state,
      zip: entry.zip,
      lat: point?.lat ?? null,
      lng: point?.lng ?? null,
      active: entry.open > 0,
      skills: inferSkillsFromProjects(entry.projectTypes),
      travelRadius: 45,
      lastProjectDate: entry.lastDate,
      completionRate,
      noShowRate,
      dmOwner: entry.dmOwner,
      melStatus: inferMelStatus(entry.open, entry.completed),
      trainingStatus: inferTraining(completionRate),
      openAssignments: entry.open,
      completedAssignments: entry.completed,
    });
  }

  return reps.sort((a, b) => b.openAssignments - a.openAssignments);
}

export function buildRepIntelligenceSnapshot(
  melRows: MelProjectRow[],
  fetchedAt: string,
  territoryStates?: string[],
  repsOverride?: ActiveRep[],
): RepIntelligenceSnapshot {
  const allReps = repsOverride ?? buildActiveRepsFromMelRows(melRows);
  const reps =
    territoryStates && territoryStates.length > 0
      ? allReps.filter((r) => territoryStates.includes(normalizeStateCode(r.state)))
      : allReps;

  const opportunities = filterOpportunitiesByTerritory(parseMelOpportunities(melRows), territoryStates);
  const openUnstaffed = opportunities.filter((o) => o.openStatus && !o.isStaffed);
  const coverageGaps = buildCoverageGaps(opportunities, reps);

  const bestRepPerProject = openUnstaffed
    .map((opportunity) => {
      const best = bestRepForOpportunity(reps, opportunity, territoryStates);
      if (!best) return null;
      return {
        projectName: opportunity.projectName,
        client: opportunity.client,
        repName: best.rep.name,
        repId: best.rep.repId,
        matchScore: best.match.matchScore,
        distanceMiles: best.match.distanceMiles,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 12);

  const highRiskProjects = openUnstaffed
    .map((opportunity) => {
      const best = bestRepForOpportunity(reps, opportunity, territoryStates);
      const matchScore = best?.match.matchScore ?? 0;
      const riskScore = Math.max(0, 100 - matchScore);
      return {
        projectName: opportunity.projectName,
        client: opportunity.client,
        state: opportunity.state,
        riskScore,
        fillProbability: fillProbabilityFromMatch(matchScore, true),
        bestRepName: best?.rep.name ?? null,
      };
    })
    .filter((p) => p.riskScore >= 40)
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, 10);

  const nearbyActiveReps = reps
    .filter((r) => r.active)
    .slice(0, 12)
    .map((rep) => ({
      repName: rep.name,
      repId: rep.repId,
      state: rep.state,
      openAssignments: rep.openAssignments,
      utilizationPercent: Math.round(
        (rep.openAssignments / Math.max(1, rep.openAssignments + rep.completedAssignments)) * 100,
      ),
    }));

  return {
    fetchedAt,
    activeReps: reps,
    territoryStaffingScore: territoryStaffingScore(coverageGaps),
    coverageGaps: coverageGaps.slice(0, 10),
    highRiskProjects,
    bestRepPerProject,
    nearbyActiveReps,
    unstaffedOpportunities: openUnstaffed.slice(0, 12).map((o) => ({
      projectName: o.projectName,
      client: o.client,
      storeName: o.storeName,
      state: o.state,
      priority: o.priority,
    })),
    repUtilization: rankRepUtilization(reps).slice(0, 12),
    repProjectMatches: [],
    staffingRecommendations: [],
    geocodedRepCount: 0,
    geocodedOpportunityCount: 0,
    importedRepCount: 0,
  };
}
