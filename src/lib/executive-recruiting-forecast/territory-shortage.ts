import type { BreezyCandidate } from "@/lib/breezy-api";
import type { CandidateWorkflowState } from "@/lib/candidate-workflow-types";
import { getDmForState, normalizeStateCode } from "@/lib/dm-territory-map";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import type { TerritoryShortageForecastRow } from "@/lib/executive-recruiting-forecast/types";

function activeRepCount(candidates: BreezyCandidate[], workflows: CandidateWorkflowState, state: string): number {
  let count = 0;
  for (const candidate of candidates) {
    const record = workflows[candidate.candidateId];
    if (record?.workflowStatus !== "Active Rep") continue;
    if (normalizeStateCode(candidate.state ?? "") === state) count += 1;
  }
  return count;
}

/**
 * Territory shortage = open opportunities minus staffed reps minus weighted pipeline.
 * Pipeline candidates count at 35% toward future coverage.
 */
export function buildTerritoryShortageForecast(input: {
  candidates: BreezyCandidate[];
  workflows: CandidateWorkflowState;
  opportunities: MelOpportunity[];
}): TerritoryShortageForecastRow[] {
  const byDm = new Map<
    string,
    {
      territoryLabel: string;
      openOpportunities: number;
      activeReps: number;
      pipelineCandidates: number;
      states: Set<string>;
    }
  >();

  for (const opp of input.opportunities.filter((row) => row.openStatus)) {
    const state = normalizeStateCode(opp.state);
    const dmName = opp.territoryOwner?.trim() || getDmForState(state) || "Unassigned";
    const entry = byDm.get(dmName) ?? {
      territoryLabel: state,
      openOpportunities: 0,
      activeReps: 0,
      pipelineCandidates: 0,
      states: new Set<string>(),
    };
    entry.openOpportunities += 1;
    entry.states.add(state);
    entry.activeReps = Math.max(entry.activeReps, activeRepCount(input.candidates, input.workflows, state));
    byDm.set(dmName, entry);
  }

  for (const candidate of input.candidates) {
    const state = normalizeStateCode(candidate.state ?? "");
    const dmName = getDmForState(state) ?? "Unassigned";
    const entry = byDm.get(dmName) ?? {
      territoryLabel: state || dmName,
      openOpportunities: 0,
      activeReps: 0,
      pipelineCandidates: 0,
      states: new Set<string>(),
    };
    entry.pipelineCandidates += 1;
    if (state) entry.states.add(state);
    byDm.set(dmName, entry);
  }

  return [...byDm.entries()]
    .map(([dmName, row]) => {
      const effectiveCoverage = row.activeReps + row.pipelineCandidates * 0.35;
      const projectedShortage = Math.max(0, Math.ceil(row.openOpportunities - effectiveCoverage));
      const shortageScore = Math.min(
        100,
        Math.round(projectedShortage * 14 + row.openOpportunities * 4 - row.activeReps * 3),
      );
      const reasons: string[] = [];
      if (row.openOpportunities > row.activeReps + 2) {
        reasons.push("Open store calls exceed active reps");
      }
      if (row.pipelineCandidates < row.openOpportunities) {
        reasons.push("Pipeline depth is below open opportunity count");
      }
      if (row.activeReps === 0 && row.openOpportunities > 0) {
        reasons.push("No active reps in territory");
      }
      return {
        dmName,
        territoryLabel: [...row.states].slice(0, 3).join(", ") || row.territoryLabel,
        shortageScore,
        projectedShortage,
        openOpportunities: row.openOpportunities,
        activeReps: row.activeReps,
        pipelineCandidates: row.pipelineCandidates,
        likelyMissCoverage: projectedShortage >= 2 || shortageScore >= 60,
        reasons: reasons.length > 0 ? reasons : ["Monitor — shortage risk is moderate"],
      };
    })
    .sort((a, b) => b.shortageScore - a.shortageScore || b.projectedShortage - a.projectedShortage);
}
