import type { RecruitingActionType } from "@/lib/candidate-recruiting-actions";
import type {
  CandidateWorkflowBundle,
  CandidateWorkflowRecord,
  CandidateWorkflowState,
  RecruiterRosters,
} from "@/lib/candidate-workflow-types";

export type WorkflowApiResponse = {
  ok: boolean;
  workflows?: CandidateWorkflowState;
  rosters?: RecruiterRosters;
  workflow?: CandidateWorkflowRecord;
  count?: number;
  updatedAt?: string;
  error?: string;
};

export async function fetchCandidateWorkflowBundle(): Promise<WorkflowApiResponse> {
  const res = await fetch("/api/candidates/workflows", { cache: "no-store" });
  return (await res.json()) as WorkflowApiResponse;
}

export async function postCandidateWorkflow(body: Record<string, unknown>): Promise<WorkflowApiResponse> {
  const res = await fetch("/api/candidates/workflows", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const parsed = (await res.json()) as WorkflowApiResponse;
  if (!res.ok || !parsed.ok) {
    throw new Error(parsed.error ?? `Workflow request failed (${res.status})`);
  }
  return parsed;
}

export async function persistWorkflowUpdate(input: {
  candidateId: string;
  workflowStatus?: string;
  assignedRecruiter?: string;
  assignedDM?: string;
  note?: string;
}): Promise<CandidateWorkflowRecord> {
  const parsed = await postCandidateWorkflow(input);
  if (!parsed.workflow) throw new Error("Workflow response missing record");
  return parsed.workflow;
}

export async function persistRecruitingActionToggle(
  candidateId: string,
  type: RecruitingActionType,
  enabled?: boolean,
): Promise<CandidateWorkflowRecord> {
  const parsed = await postCandidateWorkflow({
    candidateId,
    recruitingAction: { type, enabled },
  });
  if (!parsed.workflow) throw new Error("Workflow response missing record");
  return parsed.workflow;
}

export async function addRecruiterToServerRoster(name: string): Promise<RecruiterRosters> {
  const parsed = await postCandidateWorkflow({ rosterAction: "add-recruiter", name });
  if (!parsed.rosters) throw new Error("Roster response missing");
  return parsed.rosters;
}

export async function addDmToServerRoster(name: string): Promise<RecruiterRosters> {
  const parsed = await postCandidateWorkflow({ rosterAction: "add-dm", name });
  if (!parsed.rosters) throw new Error("Roster response missing");
  return parsed.rosters;
}

export async function completeCandidateFollowUp(
  candidateId: string,
): Promise<CandidateWorkflowRecord> {
  const parsed = await postCandidateWorkflow({ candidateId, queueAction: "complete-follow-up" });
  if (!parsed.workflow) throw new Error("Workflow response missing record");
  return parsed.workflow;
}

export async function snoozeCandidate24h(candidateId: string): Promise<CandidateWorkflowRecord> {
  const parsed = await postCandidateWorkflow({ candidateId, queueAction: "snooze-24h" });
  if (!parsed.workflow) throw new Error("Workflow response missing record");
  return parsed.workflow;
}

export function bundleFromWorkflowResponse(parsed: WorkflowApiResponse): CandidateWorkflowBundle | null {
  if (!parsed.ok || !parsed.workflows || !parsed.rosters) return null;
  return {
    workflows: parsed.workflows,
    rosters: parsed.rosters,
    updatedAt: parsed.updatedAt ?? new Date().toISOString(),
  };
}
