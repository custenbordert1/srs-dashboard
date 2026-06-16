import { isFollowUpOverdue } from "@/lib/candidate-action-sla";
import { normalizeStateCode } from "@/lib/dm-territory-map";
import { buildScopedCandidateRows } from "@/lib/recruiter-operating-system/build-scoped-rows";
import { resolveRecruiterOperatingSystemScope } from "@/lib/recruiter-operating-system/permissions";
import type { RecruiterCapacityRow, RecruiterCapacityState } from "@/lib/workforce-capacity-forecast/types";
import type { RecruitingIntelligenceRouteBundle } from "@/lib/recruiting-intelligence/load-recruiting-intelligence-route-bundle";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";

const TERMINAL_STATUSES = new Set(["Not Qualified", "Active Rep", "Loaded in MEL"]);

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function capacityStateFromPercent(percent: number): RecruiterCapacityState {
  if (percent < 45) return "underutilized";
  if (percent < 70) return "healthy";
  if (percent < 90) return "busy";
  return "overloaded";
}

function collectRecruiterNames(bundle: RecruitingIntelligenceRouteBundle): string[] {
  const names = new Set<string>();
  for (const candidate of bundle.candidates) {
    const record = bundle.workflows[candidate.candidateId];
    const recruiter = record?.assignedRecruiter?.trim();
    if (recruiter && !isUnassignedRecruiter(recruiter)) {
      names.add(recruiter);
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

export function buildRecruiterCapacityRow(input: {
  bundle: RecruitingIntelligenceRouteBundle;
  recruiterName: string;
  referenceMs: number;
}): RecruiterCapacityRow {
  const scope = resolveRecruiterOperatingSystemScope(
    {
      userId: "system",
      email: "system@internal",
      name: input.recruiterName,
      role: "recruiter",
      territoryStates: [],
      expiresAt: "2099-01-01T00:00:00.000Z",
    },
    input.recruiterName,
  );

  const rows = buildScopedCandidateRows(input.bundle, scope);
  const activeCandidates = rows.filter((row) => !TERMINAL_STATUSES.has(row.workflowStatus)).length;
  const followUpVolume = rows.filter(
    (row) =>
      row.recruitingActions.needsFollowUp ||
      isFollowUpOverdue({
        recruitingActions: row.recruitingActions,
        followUpDueAt: row.followUpDueAt,
        referenceMs: input.referenceMs,
      }),
  ).length;

  const recruiterStates = new Set(
    rows.map((row) => normalizeStateCode(row.state)).filter((s) => s.length === 2),
  );
  const openCallLoad = input.bundle.opportunities.filter(
    (opp) =>
      opp.openStatus &&
      !opp.isStaffed &&
      (recruiterStates.size === 0 || recruiterStates.has(normalizeStateCode(opp.state))),
  ).length;

  const territoryLoad = recruiterStates.size;
  const activeWorkload = activeCandidates + Math.round(followUpVolume * 0.6) + openCallLoad;

  const workloadScore =
    activeCandidates * 2.2 +
    followUpVolume * 1.8 +
    openCallLoad * 3.5 +
    territoryLoad * 4;
  const capacityPercent = clamp(Math.round(workloadScore / 1.8), 5, 100);
  const state = capacityStateFromPercent(capacityPercent);
  const spareCapacityPercent = clamp(100 - capacityPercent, 0, 100);

  return {
    recruiterName: input.recruiterName,
    activeWorkload,
    followUpVolume,
    candidateVolume: activeCandidates,
    territoryLoad,
    openCallLoad,
    capacityPercent,
    state,
    spareCapacityPercent,
    needsHelp: state === "overloaded" || (state === "busy" && followUpVolume > 8),
  };
}

export function buildRecruiterCapacityRows(input: {
  bundle: RecruitingIntelligenceRouteBundle;
  referenceMs: number;
  recruiterFilter?: string | null;
}): RecruiterCapacityRow[] {
  const names = input.recruiterFilter?.trim()
    ? [input.recruiterFilter.trim()]
    : collectRecruiterNames(input.bundle);

  return names
    .map((recruiterName) =>
      buildRecruiterCapacityRow({
        bundle: input.bundle,
        recruiterName,
        referenceMs: input.referenceMs,
      }),
    )
    .sort((a, b) => b.capacityPercent - a.capacityPercent);
}
