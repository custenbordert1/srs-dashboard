import { buildBaselineWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { BreezyCandidate } from "@/lib/breezy-api";
import type { CandidateWorkflowState } from "@/lib/candidate-workflow-types";
import { normalizeStateCode } from "@/lib/dm-territory-map";
import { isRecruiterNameInScope } from "@/lib/recruiter-operating-system/permissions";
import type { RecruiterOperatingSystemScope } from "@/lib/recruiter-operating-system/types";
import type { RecruitingIntelligenceRouteBundle } from "@/lib/recruiting-intelligence/load-recruiting-intelligence-route-bundle";

export function buildScopedCandidateRows(
  bundle: RecruitingIntelligenceRouteBundle,
  scope: RecruiterOperatingSystemScope,
): ScoredCandidateWorkflowRow[] {
  return bundle.candidates
    .map((candidate) => buildBaselineWorkflowRow(candidate, bundle.workflows[candidate.candidateId]))
    .filter((row) => matchesTerritoryScope(row, scope))
    .filter((row) => isRecruiterNameInScope(row.assignedRecruiter, scope));
}

function matchesTerritoryScope(
  row: ScoredCandidateWorkflowRow,
  scope: RecruiterOperatingSystemScope,
): boolean {
  if (scope.territoryStates.length === 0) return true;
  const allowed = new Set(scope.territoryStates.map(normalizeStateCode));
  const state = normalizeStateCode(row.state);
  return state.length === 2 && allowed.has(state);
}

export function candidateDisplayName(row: Pick<BreezyCandidate, "firstName" | "lastName" | "email" | "candidateId">): string {
  return `${row.firstName} ${row.lastName}`.trim() || row.email || row.candidateId;
}
