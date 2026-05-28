import type {
  CandidateWorkflowState,
  RecruiterRosters,
} from "@/lib/candidate-workflow-types";

export type CandidateWorkflowsSessionPayload = {
  ok: boolean;
  workflows?: CandidateWorkflowState;
  rosters?: RecruiterRosters;
  error?: string;
  fetchedAt: number;
};

/** Session memo window — skip repeat workflow GETs during the same Candidates visit. */
export const CANDIDATE_WORKFLOWS_SESSION_TTL_MS = 5 * 60 * 1000;

let sessionPayload: CandidateWorkflowsSessionPayload | null = null;

export function peekCandidateWorkflowsSessionCache(): CandidateWorkflowsSessionPayload | null {
  if (!sessionPayload) return null;
  if (Date.now() - sessionPayload.fetchedAt > CANDIDATE_WORKFLOWS_SESSION_TTL_MS) {
    sessionPayload = null;
    return null;
  }
  return sessionPayload;
}

export function shouldUseCandidateWorkflowsSessionCache(force: boolean): boolean {
  if (force) return false;
  const cached = peekCandidateWorkflowsSessionCache();
  return Boolean(cached?.ok && cached.workflows);
}

export function storeCandidateWorkflowsSessionCache(
  payload: Omit<CandidateWorkflowsSessionPayload, "fetchedAt">,
): CandidateWorkflowsSessionPayload {
  sessionPayload = { ...payload, fetchedAt: Date.now() };
  return sessionPayload;
}

export function clearCandidateWorkflowsSessionCache(): void {
  sessionPayload = null;
}

export function workflowCountFromSession(
  payload: CandidateWorkflowsSessionPayload | null,
): number {
  if (!payload?.workflows) return 0;
  return Object.keys(payload.workflows).length;
}
