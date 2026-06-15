import type { DistrictManager } from "@/lib/dm-territory-map";
import { getDmForState, normalizeStateCode } from "@/lib/dm-territory-map";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import type { ActiveRep } from "@/lib/rep-intelligence/rep-types";
import type { RepCapacityRow } from "@/lib/territory-action-engine/types";

const RECENT_REP_DAYS = 21;
const CAPACITY_LIMIT = 16;

function recentlyActive(rep: ActiveRep): boolean {
  if (!rep.active) return false;
  if (rep.lastLoginDaysAgo !== null && rep.lastLoginDaysAgo !== undefined) {
    return rep.lastLoginDaysAgo <= RECENT_REP_DAYS;
  }
  if (rep.lastProjectDate) {
    const days = Math.floor(
      (Date.now() - new Date(rep.lastProjectDate).getTime()) / (1000 * 60 * 60 * 24),
    );
    return days <= RECENT_REP_DAYS;
  }
  return false;
}

function capacityLabel(score: number): RepCapacityRow["capacityLabel"] {
  if (score >= 65) return "can-absorb";
  if (score >= 40) return "near-capacity";
  return "at-risk";
}

function capacityRecommendation(
  label: RepCapacityRow["capacityLabel"],
  openOpportunities: number,
  inactiveReps: number,
): string {
  switch (label) {
    case "can-absorb":
      return `Can absorb ${Math.max(1, Math.floor(openOpportunities * 0.2))} additional open calls`;
    case "near-capacity":
      return "Monitor rep activation before assigning new projects";
    default:
      return `Reactivate ${Math.min(8, inactiveReps)} inactive reps or escalate staffing`;
  }
}

export function buildRepCapacityRows(input: {
  reps: ActiveRep[];
  opportunities: MelOpportunity[];
}): RepCapacityRow[] {
  const dmNames = new Set<DistrictManager>();
  for (const rep of input.reps) {
    const dm = getDmForState(rep.state);
    if (dm) dmNames.add(dm);
  }
  for (const opp of input.opportunities) {
    const dm = getDmForState(opp.state);
    if (dm) dmNames.add(dm);
  }

  const rows: RepCapacityRow[] = [];
  for (const dmName of dmNames) {
    const dmStates = new Set(
      input.reps
        .filter((rep) => getDmForState(rep.state) === dmName)
        .map((rep) => normalizeStateCode(rep.state)),
    );
    const scopedReps = input.reps.filter((rep) => dmStates.has(normalizeStateCode(rep.state)));
    const activeReps = scopedReps.filter((rep) => rep.active).length;
    const recentlyActiveReps = scopedReps.filter(recentlyActive).length;
    const inactiveReps = scopedReps.filter((rep) => !rep.active).length;
    const openOpportunities = input.opportunities.filter(
      (opp) =>
        opp.openStatus &&
        !opp.isStaffed &&
        getDmForState(opp.state) === dmName,
    ).length;

    const utilization =
      activeReps > 0
        ? scopedReps
            .filter((rep) => rep.active)
            .reduce((sum, rep) => sum + rep.openAssignments, 0) / activeReps
        : openOpportunities;

    const capacityScore = Math.max(
      0,
      Math.min(
        100,
        Math.round(
          (recentlyActiveReps / Math.max(1, activeReps)) * 50 +
            (activeReps / Math.max(1, openOpportunities)) * 30 +
            (100 - Math.min(100, utilization * 12)),
        ),
      ),
    );

    const label = capacityLabel(capacityScore);
    rows.push({
      dmName,
      activeReps,
      recentlyActiveReps,
      inactiveReps,
      openOpportunities,
      capacityScore,
      capacityLabel: label,
      recommendation: capacityRecommendation(label, openOpportunities, inactiveReps),
    });
  }

  return rows
    .sort((a, b) => a.capacityScore - b.capacityScore)
    .slice(0, CAPACITY_LIMIT);
}
