import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { recommendNextStep } from "@/lib/hiring-automation-engine/recommend-next-step";
import {
  createAutomationRun,
  findPendingRun,
  findPendingAdRun,
} from "@/lib/hiring-automation-engine/automation-run-store";
import {
  buildJobPipelineContext,
  recommendAdActions,
} from "@/lib/hiring-automation-engine/recommend-ad-actions";
import type { AutomationRun, PlanAutomationInput } from "@/lib/hiring-automation-engine/types";

export type PlanAutomationResult = {
  candidateRuns: AutomationRun[];
  adRuns: AutomationRun[];
  skipped: number;
};

export async function planCandidateAutomations(
  input: PlanAutomationInput & { actor?: string; onboardingConfigured?: boolean },
): Promise<PlanAutomationResult> {
  const candidateRuns: AutomationRun[] = [];
  let skipped = 0;

  for (const row of input.candidates) {
    const next = recommendNextStep(row, { onboardingConfigured: input.onboardingConfigured });
    if (next.action === "none") {
      skipped += 1;
      continue;
    }

    const existing = await findPendingRun(row.candidateId, next.action);
    if (existing) {
      skipped += 1;
      continue;
    }

    const run = await createAutomationRun({
      type: next.action,
      candidateId: row.candidateId,
      positionId: row.positionId,
      reason: next.reason,
      dataUsed: next.dataUsed,
      expectedOutcome: next.expectedOutcome,
      undoPath: next.undoPath,
      requiresApproval: next.requiresApproval,
      payload: {
        candidateName: `${row.firstName} ${row.lastName}`.trim() || row.email,
        email: row.email,
        positionName: row.positionName,
      },
      actor: input.actor,
    });
    candidateRuns.push(run);
  }

  return { candidateRuns, adRuns: [], skipped };
}

export async function planAdAutomations(input: {
  jobs: Array<{
    positionId: string;
    breezyJobId?: string;
    title: string;
    city: string;
    state: string;
    pipelineStatus?: string;
  }>;
  candidates: ScoredCandidateWorkflowRow[];
  actor?: string;
}): Promise<AutomationRun[]> {
  const contexts = buildJobPipelineContext(input.jobs, input.candidates);
  const recommendations = recommendAdActions(contexts);
  const adRuns: AutomationRun[] = [];

  for (const rec of recommendations) {
    const type = rec.type;
    const existing = rec.positionId
      ? await findPendingAdRun(rec.positionId, type)
      : null;
    if (existing) continue;

    const run = await createAutomationRun({
      type,
      positionId: rec.positionId,
      breezyJobId: rec.breezyJobId,
      reason: rec.reason,
      dataUsed: rec.dataUsed,
      expectedOutcome: rec.expectedOutcome,
      undoPath: "Reject automation or revert ad status in Job Management.",
      requiresApproval: true,
      payload: {
        suggestedCity: rec.suggestedCity ?? "",
        suggestedTitle: rec.suggestedTitle ?? rec.title,
        suggestedPriority: rec.suggestedPriority ?? "medium",
        nearbyLocations: rec.nearbyLocations?.join(", ") ?? "",
      },
      actor: input.actor,
    });
    adRuns.push(run);
  }

  return adRuns;
}

export async function planAllAutomations(input: {
  candidates: ScoredCandidateWorkflowRow[];
  jobs?: Array<{
    positionId: string;
    breezyJobId?: string;
    title: string;
    city: string;
    state: string;
    pipelineStatus?: string;
  }>;
  actor?: string;
  onboardingConfigured?: boolean;
}): Promise<PlanAutomationResult & { adRuns: AutomationRun[] }> {
  const candidateResult = await planCandidateAutomations(input);
  const adRuns = input.jobs?.length
    ? await planAdAutomations({ jobs: input.jobs, candidates: input.candidates, actor: input.actor })
    : [];
  return { ...candidateResult, adRuns };
}
