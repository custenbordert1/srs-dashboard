import type { RecruitingActionType } from "@/lib/candidate-recruiting-actions";
import type { ApplicantCaptureHealth } from "@/lib/candidate-ingestion/types";
import type {
  CandidateAutomationHealth,
  CandidateAutomationPolicy,
  CandidateAutomationRunResult,
} from "@/lib/candidate-automation-engine/types";
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

export type AutoAssignApiResponse = WorkflowApiResponse & {
  assigned?: number;
  skipped?: number;
  metrics?: {
    autoAssignmentRate: number;
    manualAssignmentRequired: number;
    averageConfidence: number;
  };
};

export type AutoActionApiResponse = WorkflowApiResponse & {
  generated?: number;
  skipped?: number;
  metrics?: {
    overdueRecruiterActions: number;
    actionsDueToday: number;
    averageActionAgeDays: number;
    recruiterSlaCompliance: number;
  };
};

export type AutoProgressionApiResponse = WorkflowApiResponse & {
  generated?: number;
  skipped?: number;
  metrics?: {
    candidatesReadyToAdvance: number;
    stalledCandidates: number;
    progressionSlaCompliance: number;
    progressionBottlenecks: string[];
  };
};

export type IngestionSyncApiResponse = {
  ok: boolean;
  error?: string;
  positionCoveragePct?: number;
  cycleComplete?: boolean;
  captureHealth?: ApplicantCaptureHealth;
};

export type CandidateAutomationApiResponse = {
  ok: boolean;
  skipped?: boolean;
  skipReason?: string;
  runId?: string;
  trigger?: string;
  durationMs?: number;
  mtdCandidatesProcessed?: number;
  p62Assigned?: number;
  p63ActionsGenerated?: number;
  p64ProgressionsGenerated?: number;
  p62CoveragePct?: number;
  p63CoveragePct?: number;
  p64CoveragePct?: number;
  health?: import("@/lib/candidate-automation-engine/types").CandidateAutomationHealth;
  errors?: string[];
  warnings?: string[];
  workflows?: CandidateWorkflowState;
  rosters?: RecruiterRosters;
  updatedAt?: string;
  error?: string;
};

export async function runCandidateIngestionSync(options?: {
  complete?: boolean;
  runPipeline?: boolean;
}): Promise<IngestionSyncApiResponse> {
  const params = new URLSearchParams();
  if (options?.complete) params.set("complete", "true");
  if (options?.runPipeline === false) params.set("run_pipeline", "false");
  const query = params.size > 0 ? `?${params.toString()}` : "";
  const res = await fetch(`/api/candidates/ingestion/sync${query}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  const parsed = (await res.json()) as IngestionSyncApiResponse;
  if (!res.ok || !parsed.ok) {
    throw new Error(parsed.error ?? `Ingestion sync failed (${res.status})`);
  }
  return parsed;
}

export async function runCandidateAutomation(): Promise<CandidateAutomationApiResponse> {
  const res = await fetch("/api/candidates/automation/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  const parsed = (await res.json()) as CandidateAutomationApiResponse;
  if (!res.ok || !parsed.ok) {
    throw new Error(parsed.error ?? `Automation run failed (${res.status})`);
  }
  return parsed;
}

export async function runAutoRecruiterAssignment(): Promise<AutoAssignApiResponse> {
  const res = await fetch("/api/candidates/workflows/auto-assign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  const parsed = (await res.json()) as AutoAssignApiResponse;
  if (!res.ok || !parsed.ok) {
    throw new Error(parsed.error ?? `Auto-assign request failed (${res.status})`);
  }
  return parsed;
}

export async function runAutoRecruiterAction(): Promise<AutoActionApiResponse> {
  const res = await fetch("/api/candidates/workflows/auto-action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  const parsed = (await res.json()) as AutoActionApiResponse;
  if (!res.ok || !parsed.ok) {
    throw new Error(parsed.error ?? `Auto-action request failed (${res.status})`);
  }
  return parsed;
}

export async function runAutoCandidateProgression(): Promise<AutoProgressionApiResponse> {
  const res = await fetch("/api/candidates/workflows/auto-progression", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  const parsed = (await res.json()) as AutoProgressionApiResponse;
  if (!res.ok || !parsed.ok) {
    throw new Error(parsed.error ?? `Auto-progression request failed (${res.status})`);
  }
  return parsed;
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
