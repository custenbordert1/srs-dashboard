import type { BreezyCandidate } from "@/lib/breezy-api";
import { applyTerritoryToCandidates } from "@/lib/auth/territory-filter";
import type { AuthSession } from "@/lib/auth/types";
import { isAdminRole, isRecruiterRole } from "@/lib/auth/roles";
import type { CandidateWorkflowState } from "@/lib/candidate-workflow-types";
import type { RecruiterRosters } from "@/lib/candidate-workflow-types";

export function filterWorkflowsForSession(
  session: AuthSession,
  workflows: CandidateWorkflowState,
  candidates: BreezyCandidate[],
): CandidateWorkflowState {
  if (isAdminRole(session.role) || isRecruiterRole(session.role)) {
    return workflows;
  }

  const allowedIds = new Set(
    applyTerritoryToCandidates(session, candidates).map((c) => c.candidateId),
  );

  const filtered: CandidateWorkflowState = {};
  for (const [candidateId, workflow] of Object.entries(workflows)) {
    if (allowedIds.has(candidateId)) {
      filtered[candidateId] = workflow;
    }
  }
  return filtered;
}

/** DMs only see their own name on rosters — not the full recruiter/DM directory. */
export function filterRostersForSession(
  session: AuthSession,
  rosters: RecruiterRosters,
): RecruiterRosters {
  if (isAdminRole(session.role) || isRecruiterRole(session.role)) {
    return rosters;
  }
  const dmLabel = session.dmName?.trim() || session.name.trim();
  return {
    recruiters: [],
    dms: dmLabel ? [dmLabel] : [],
  };
}
