import type { BreezyCandidate } from "@/lib/breezy-api";
import { normalizeStateCode } from "@/lib/dm-territory-map";
import { DEFAULT_TRAVEL_RADIUS_MILES } from "@/lib/mel-matching/distance-utils";
import { matchCandidateToOpportunities } from "@/lib/mel-matching/matching-engine";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import { filterOpportunitiesByTerritory } from "@/lib/mel-matching/mel-opportunity-parser";

export type TopMatchRow = {
  candidateId: string;
  candidateName: string;
  opportunityId: string;
  projectName: string;
  client: string;
  fitPercent: number;
  distanceMiles: number | null;
  matchLabel: string;
};

export type OpportunityGapRow = {
  opportunityId: string;
  projectName: string;
  client: string;
  state: string;
  territoryOwner: string;
  priority: string;
  nearestCandidateFit: number | null;
};

export type ExecutiveMelMatchingMetrics = {
  candidatesWithNoNearbyOpportunities: number;
  hardToFillOpportunitiesLackingCandidates: number;
  territoryCoverageGaps: Array<{ territory: string; openUnstaffed: number; strongMatches: number }>;
  topCandidateProjectMatches: TopMatchRow[];
};

export type DmMelMatchingMetrics = {
  bestCandidateForOpenProjects: Array<{
    projectName: string;
    client: string;
    candidateName: string;
    candidateId: string;
    fitPercent: number;
    distanceMiles: number | null;
  }>;
  candidatesNearAgingOpportunities: Array<{
    candidateName: string;
    candidateId: string;
    projectName: string;
    distanceMiles: number | null;
    fitPercent: number;
  }>;
  unstaffedHighPriorityStores: Array<{
    projectName: string;
    client: string;
    storeName: string;
    state: string;
    territoryOwner: string;
  }>;
};

function candidateName(c: BreezyCandidate): string {
  const name = `${c.firstName} ${c.lastName}`.trim();
  return name || c.email || c.candidateId;
}

export function buildExecutiveMelMatchingMetrics(
  candidates: BreezyCandidate[],
  opportunities: MelOpportunity[],
): ExecutiveMelMatchingMetrics {
  const openOpportunities = opportunities.filter((o) => o.openStatus);
  const topMatches: TopMatchRow[] = [];
  let noNearby = 0;

  for (const candidate of candidates) {
    const result = matchCandidateToOpportunities(candidate, openOpportunities, { limit: 3 });
    const hasNearby = result.matches.some(
      (m) =>
        (m.distanceMiles === null || m.distanceMiles <= DEFAULT_TRAVEL_RADIUS_MILES) &&
        m.matchLabel !== "Outside Territory",
    );
    if (!hasNearby) noNearby += 1;
    for (const match of result.matches) {
      topMatches.push({
        candidateId: candidate.candidateId,
        candidateName: candidateName(candidate),
        opportunityId: match.opportunityId,
        projectName: match.projectName,
        client: match.client,
        fitPercent: match.fitPercent,
        distanceMiles: match.distanceMiles,
        matchLabel: match.matchLabel,
      });
    }
  }

  topMatches.sort((a, b) => b.fitPercent - a.fitPercent);

  const hardToFill: OpportunityGapRow[] = [];
  for (const opportunity of openOpportunities.filter((o) => !o.isStaffed)) {
    let bestFit = 0;
    for (const candidate of candidates) {
      const result = matchCandidateToOpportunities(candidate, [opportunity], { limit: 1 });
      const fit = result.matches[0]?.fitPercent ?? 0;
      if (fit > bestFit) bestFit = fit;
    }
    if (bestFit < 62) {
      hardToFill.push({
        opportunityId: opportunity.opportunityId,
        projectName: opportunity.projectName,
        client: opportunity.client,
        state: opportunity.state,
        territoryOwner: opportunity.territoryOwner,
        priority: opportunity.priority,
        nearestCandidateFit: bestFit || null,
      });
    }
  }

  const territoryMap = new Map<string, { openUnstaffed: number; strongMatches: number }>();
  for (const opportunity of openOpportunities.filter((o) => !o.isStaffed)) {
    const key = opportunity.territoryOwner || "Unassigned";
    const entry = territoryMap.get(key) ?? { openUnstaffed: 0, strongMatches: 0 };
    entry.openUnstaffed += 1;
    territoryMap.set(key, entry);
  }

  for (const candidate of candidates) {
    const result = matchCandidateToOpportunities(candidate, openOpportunities, { limit: 1 });
    const top = result.matches[0];
    if (top && top.matchLabel === "Strong Match") {
      const owner = openOpportunities.find((o) => o.opportunityId === top.opportunityId)?.territoryOwner;
      if (owner) {
        const entry = territoryMap.get(owner) ?? { openUnstaffed: 0, strongMatches: 0 };
        entry.strongMatches += 1;
        territoryMap.set(owner, entry);
      }
    }
  }

  const territoryCoverageGaps = [...territoryMap.entries()]
    .map(([territory, stats]) => ({
      territory,
      openUnstaffed: stats.openUnstaffed,
      strongMatches: stats.strongMatches,
    }))
    .filter((row) => row.openUnstaffed >= 3 && row.strongMatches < 2)
    .sort((a, b) => b.openUnstaffed - a.openUnstaffed)
    .slice(0, 8);

  return {
    candidatesWithNoNearbyOpportunities: noNearby,
    hardToFillOpportunitiesLackingCandidates: hardToFill.length,
    territoryCoverageGaps,
    topCandidateProjectMatches: topMatches.slice(0, 12),
  };
}

export function buildDmMelMatchingMetrics(
  candidates: BreezyCandidate[],
  opportunities: MelOpportunity[],
  territoryStates: string[],
): DmMelMatchingMetrics {
  const scopedOpportunities = filterOpportunitiesByTerritory(opportunities, territoryStates);
  const openUnstaffed = scopedOpportunities.filter((o) => o.openStatus && !o.isStaffed);

  const bestCandidateForOpenProjects: DmMelMatchingMetrics["bestCandidateForOpenProjects"] = [];
  const projectKeys = new Map<string, MelOpportunity>();
  for (const o of openUnstaffed) {
    const key = o.projectNo || o.projectName;
    if (!projectKeys.has(key)) projectKeys.set(key, o);
  }

  for (const opportunity of projectKeys.values()) {
    let best: { candidate: BreezyCandidate; fitPercent: number; distanceMiles: number | null } | null = null;
    for (const candidate of candidates) {
      const result = matchCandidateToOpportunities(candidate, [opportunity], { limit: 1, territoryStates });
      const match = result.matches[0];
      if (!match) continue;
      if (!best || match.fitPercent > best.fitPercent) {
        best = { candidate, fitPercent: match.fitPercent, distanceMiles: match.distanceMiles };
      }
    }
    if (best) {
      bestCandidateForOpenProjects.push({
        projectName: opportunity.projectName,
        client: opportunity.client,
        candidateName: candidateName(best.candidate),
        candidateId: best.candidate.candidateId,
        fitPercent: best.fitPercent,
        distanceMiles: best.distanceMiles,
      });
    }
  }

  bestCandidateForOpenProjects.sort((a, b) => b.fitPercent - a.fitPercent);

  const agingOpportunities = openUnstaffed.filter((o) => o.priority === "high" || o.priority === "medium");
  const candidatesNearAgingOpportunities: DmMelMatchingMetrics["candidatesNearAgingOpportunities"] = [];

  for (const opportunity of agingOpportunities.slice(0, 15)) {
    for (const candidate of candidates) {
      const result = matchCandidateToOpportunities(candidate, [opportunity], {
        limit: 1,
        territoryStates,
      });
      const match = result.matches[0];
      if (!match) continue;
      if (match.distanceMiles !== null && match.distanceMiles <= DEFAULT_TRAVEL_RADIUS_MILES && match.fitPercent >= 55) {
        candidatesNearAgingOpportunities.push({
          candidateName: candidateName(candidate),
          candidateId: candidate.candidateId,
          projectName: opportunity.projectName,
          distanceMiles: match.distanceMiles,
          fitPercent: match.fitPercent,
        });
        break;
      }
    }
  }

  const unstaffedHighPriorityStores = openUnstaffed
    .filter((o) => o.priority === "high")
    .slice(0, 12)
    .map((o) => ({
      projectName: o.projectName,
      client: o.client,
      storeName: o.storeName,
      state: normalizeStateCode(o.state),
      territoryOwner: o.territoryOwner,
    }));

  return {
    bestCandidateForOpenProjects: bestCandidateForOpenProjects.slice(0, 10),
    candidatesNearAgingOpportunities: candidatesNearAgingOpportunities.slice(0, 10),
    unstaffedHighPriorityStores,
  };
}
