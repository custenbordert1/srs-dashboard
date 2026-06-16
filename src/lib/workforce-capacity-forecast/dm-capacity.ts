import { countFollowUpsByDm } from "@/lib/predictive-territory-risk/build-forecasts";
import { normalizeStateCode } from "@/lib/dm-territory-map";
import { getAssignedStatesForDm, DISTRICT_MANAGERS } from "@/lib/dm-territory-map";
import { buildRecruiterProductivityLive } from "@/lib/recruiting-automation/recruiter-productivity-live";
import { capacityStateFromPercent } from "@/lib/workforce-capacity-forecast/recruiter-capacity";
import type { DmCapacityRow } from "@/lib/workforce-capacity-forecast/types";
import type { ExecutiveAlert } from "@/lib/alerts/alert-types";
import type { ExecutiveAlertFollowUp } from "@/lib/alerts/executive-alert-status-types";
import type { PredictiveTerritoryRiskSnapshot } from "@/lib/predictive-territory-risk/types";
import type { RecruitingIntelligenceRouteBundle } from "@/lib/recruiting-intelligence/load-recruiting-intelligence-route-bundle";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function dmNamesFromBundle(
  bundle: RecruitingIntelligenceRouteBundle,
  riskSnapshot: PredictiveTerritoryRiskSnapshot,
): string[] {
  const names = new Set<string>(DISTRICT_MANAGERS);
  for (const opp of bundle.opportunities) {
    if (opp.territoryOwner?.trim()) names.add(opp.territoryOwner.trim());
  }
  for (const row of riskSnapshot.territories) {
    if (row.dmName?.trim()) names.add(row.dmName.trim());
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

export function buildDmCapacityRow(input: {
  bundle: RecruitingIntelligenceRouteBundle;
  riskSnapshot: PredictiveTerritoryRiskSnapshot;
  followUps: ExecutiveAlertFollowUp[];
  alerts: ExecutiveAlert[];
  dmName: string;
  referenceMs: number;
}): DmCapacityRow {
  const dmStates = new Set(
    getAssignedStatesForDm(input.dmName).map((state) => normalizeStateCode(state)),
  );

  const territoryCount = dmStates.size || 1;
  const recruiterRows = buildRecruiterProductivityLive(
    input.bundle.candidates,
    input.bundle.workflows,
    input.bundle.fetchedAt,
  );
  const recruiterCount = recruiterRows.filter((row) => {
    if (dmStates.size === 0) return true;
    return input.bundle.candidates.some((candidate) => {
      const record = input.bundle.workflows[candidate.candidateId];
      if (record?.assignedRecruiter?.trim() !== row.recruiter) return false;
      return dmStates.has(normalizeStateCode(candidate.state));
    });
  }).length;

  const openCalls = input.bundle.opportunities.filter(
    (opp) =>
      opp.openStatus &&
      !opp.isStaffed &&
      (dmStates.size === 0 ||
        dmStates.has(normalizeStateCode(opp.state)) ||
        opp.territoryOwner?.toLowerCase() === input.dmName.toLowerCase()),
  ).length;

  const dmRiskRows = input.riskSnapshot.territories.filter(
    (row) => row.dmName.toLowerCase() === input.dmName.toLowerCase(),
  );
  const riskLoad =
    dmRiskRows.length > 0
      ? Math.round(dmRiskRows.reduce((sum, row) => sum + row.riskScore, 0) / dmRiskRows.length)
      : 50;

  const followUpCounts = countFollowUpsByDm(input.followUps, input.alerts, input.referenceMs);
  const followUpBacklog = followUpCounts.overdue.get(input.dmName) ?? 0;

  const loadScore =
    territoryCount * 6 +
    openCalls * 2.5 +
    riskLoad * 0.45 +
    followUpBacklog * 4 +
    Math.max(0, 4 - recruiterCount) * 12;
  const capacityScore = clamp(Math.round(100 - loadScore / 2.2), 5, 100);
  const state = capacityStateFromPercent(100 - capacityScore);

  return {
    dmName: input.dmName,
    territoryCount,
    recruiterCount,
    openCalls,
    riskLoad,
    followUpBacklog,
    capacityScore,
    state,
    atRisk: capacityScore < 45 || riskLoad >= 75 || followUpBacklog >= 5,
  };
}

export function buildDmCapacityRows(input: {
  bundle: RecruitingIntelligenceRouteBundle;
  riskSnapshot: PredictiveTerritoryRiskSnapshot;
  followUps: ExecutiveAlertFollowUp[];
  alerts: ExecutiveAlert[];
  referenceMs: number;
  dmFilter?: string | null;
}): DmCapacityRow[] {
  const names = input.dmFilter?.trim()
    ? [input.dmFilter.trim()]
    : dmNamesFromBundle(input.bundle, input.riskSnapshot);

  return names
    .map((dmName) =>
      buildDmCapacityRow({
        bundle: input.bundle,
        riskSnapshot: input.riskSnapshot,
        followUps: input.followUps,
        alerts: input.alerts,
        dmName,
        referenceMs: input.referenceMs,
      }),
    )
    .sort((a, b) => a.capacityScore - b.capacityScore);
}
