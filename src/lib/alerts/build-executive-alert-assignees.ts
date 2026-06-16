import { buildBaselineWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { DISTRICT_MANAGERS } from "@/lib/dm-territory-map";
import type { RecruitingIntelligenceRouteBundle } from "@/lib/recruiting-intelligence/load-recruiting-intelligence-route-bundle";

export type ExecutiveAlertAssigneeOptions = {
  dms: string[];
  recruiters: string[];
};

export function buildExecutiveAlertAssigneeOptions(
  bundle: RecruitingIntelligenceRouteBundle,
): ExecutiveAlertAssigneeOptions {
  const dmSet = new Set<string>(DISTRICT_MANAGERS);
  for (const row of bundle.coverage.opportunities) {
    if (row.territoryOwner) dmSet.add(row.territoryOwner);
  }

  const recruiterSet = new Set<string>();
  for (const candidate of bundle.candidates) {
    const workflow = bundle.workflows[candidate.candidateId];
    const row = buildBaselineWorkflowRow(candidate, workflow);
    if (row.assignedRecruiter?.trim()) {
      recruiterSet.add(row.assignedRecruiter.trim());
    }
  }

  return {
    dms: [...dmSet].sort((a, b) => a.localeCompare(b)),
    recruiters: [...recruiterSet].sort((a, b) => a.localeCompare(b)),
  };
}
