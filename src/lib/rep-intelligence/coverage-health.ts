import { matchRepToOpportunity } from "@/lib/rep-intelligence/opportunity-matching";
import { repUtilizationPercent } from "@/lib/rep-intelligence/rep-scoring";
import type {
  ActiveRep,
  CoverageGap,
  TerritoryCoverageHealth,
} from "@/lib/rep-intelligence/rep-types";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";

function healthFromGap(openProjects: number, activeReps: number): TerritoryCoverageHealth {
  if (openProjects === 0) return "green";
  const ratio = activeReps / Math.max(1, openProjects);
  if (ratio >= 0.5) return "green";
  if (ratio >= 0.25) return "yellow";
  return "red";
}

export function buildCoverageGaps(
  opportunities: MelOpportunity[],
  reps: ActiveRep[],
): CoverageGap[] {
  const byTerritory = new Map<string, { open: number; reps: Set<string>; states: Set<string> }>();

  for (const opportunity of opportunities.filter((o) => o.openStatus && !o.isStaffed)) {
    const key = opportunity.territoryOwner || "Unassigned";
    const entry = byTerritory.get(key) ?? { open: 0, reps: new Set<string>(), states: new Set<string>() };
    entry.open += 1;
    entry.states.add(opportunity.state);
    byTerritory.set(key, entry);
  }

  for (const rep of reps.filter((r) => r.active)) {
    const key = rep.dmOwner || "Unassigned";
    const entry = byTerritory.get(key) ?? { open: 0, reps: new Set<string>(), states: new Set<string>() };
    entry.reps.add(rep.repId);
    byTerritory.set(key, entry);
  }

  const gaps: CoverageGap[] = [];
  for (const [territory, stats] of byTerritory.entries()) {
    const activeReps = stats.reps.size;
    const gapScore = stats.open > 0 ? Math.round((stats.open / Math.max(1, activeReps)) * 10) / 10 : 0;
    gaps.push({
      territory,
      state: [...stats.states][0] ?? "",
      openProjects: stats.open,
      activeReps,
      gapScore,
      health: healthFromGap(stats.open, activeReps),
    });
  }

  return gaps.sort((a, b) => b.gapScore - a.gapScore);
}

export function territoryStaffingScore(gaps: CoverageGap[]): number {
  if (gaps.length === 0) return 100;
  const red = gaps.filter((g) => g.health === "red").length;
  const yellow = gaps.filter((g) => g.health === "yellow").length;
  const penalty = red * 12 + yellow * 5;
  return Math.max(0, Math.min(100, 100 - penalty));
}

export function fillProbabilityFromMatch(matchScore: number, openUnstaffed: boolean): number {
  const base = openUnstaffed ? 35 : 55;
  return Math.min(95, Math.max(5, Math.round(base + matchScore * 0.55)));
}

export function bestRepForOpportunity(
  reps: ActiveRep[],
  opportunity: MelOpportunity,
  territoryStates?: string[],
): { rep: ActiveRep; match: ReturnType<typeof matchRepToOpportunity> } | null {
  let best: { rep: ActiveRep; match: ReturnType<typeof matchRepToOpportunity> } | null = null;
  for (const rep of reps.filter((r) => r.active)) {
    const match = matchRepToOpportunity(rep, opportunity, { territoryStates });
    if (!best || match.matchScore > best.match.matchScore) {
      best = { rep, match };
    }
  }
  return best;
}

export function rankRepUtilization(reps: ActiveRep[]): Array<{
  repId: string;
  repName: string;
  utilizationPercent: number;
  openAssignments: number;
}> {
  return reps
    .map((rep) => ({
      repId: rep.repId,
      repName: rep.name,
      utilizationPercent: repUtilizationPercent(rep),
      openAssignments: rep.openAssignments,
    }))
    .sort((a, b) => b.utilizationPercent - a.utilizationPercent);
}
