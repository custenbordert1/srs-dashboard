import type { RecommendedAd } from "@/lib/autonomous-recruiting-engine/types";
import {
  approveExecution,
  completeExecution,
  failExecution,
  getExecution,
  linkExecutionResources,
  startExecution,
  type AutopilotExecution,
} from "@/lib/autonomous-recruiting-execution/execution-store";
import { createAutomationRun } from "@/lib/hiring-automation-engine/automation-run-store";
import { executeAutomationRun } from "@/lib/hiring-automation-engine/execute-automation-run";
import { createJobDraft } from "@/lib/job-management/job-draft-store";

export function mapRecommendedAdToExecutionPayload(ad: RecommendedAd) {
  return {
    title: ad.title,
    adType: ad.adType,
    city: ad.city,
    state: ad.state,
    breezyJobId: ad.breezyJobId,
    positionId: ad.positionId,
    reason: ad.reason,
    refreshCount: ad.adType === "refresh-ad" ? 1 : 0,
  };
}

export type ExecutePostingResult =
  | { ok: true; execution: AutopilotExecution; summary: string }
  | { ok: false; error: string; execution?: AutopilotExecution };

export async function executePostingRecommendation(
  executionId: string,
  actor?: string,
): Promise<ExecutePostingResult> {
  const execution = await getExecution(executionId);
  if (!execution) return { ok: false, error: "Execution not found." };
  if (execution.type !== "posting" && execution.type !== "refresh") {
    return { ok: false, error: "Execution is not a posting recommendation.", execution };
  }
  if (execution.status !== "approved") {
    return { ok: false, error: `Cannot execute in status: ${execution.status}`, execution };
  }

  const adType = execution.payload.adType;
  if (!adType) return { ok: false, error: "Missing ad type in execution payload.", execution };

  const started = await startExecution(executionId, actor);
  if (!started) return { ok: false, error: "Failed to start execution.", execution };

  try {
    if (adType === "create-new-ad") {
      const draft = await createJobDraft({
        title: execution.payload.title ?? "Field Merchandiser",
        description: execution.payload.reason ?? "Autopilot posting recommendation",
        city: execution.payload.city ?? "",
        usState: execution.payload.state ?? "",
        payRate: "",
        department: "Field",
        source: "autopilot-execution",
        metadata: {
          autopilotExecutionId: executionId,
          priority: execution.priority,
        },
        breezyJobId: execution.payload.breezyJobId,
      });

      await linkExecutionResources(executionId, { linkedJobDraftId: draft.id });

      const completed = await completeExecution(
        executionId,
        {
          summary: `Job draft created (${draft.id}) — requires push approval in Job Management.`,
          success: true,
          linkedResourceType: "job-draft",
          linkedResourceId: draft.id,
        },
        actor,
      );

      return {
        ok: true,
        execution: completed!,
        summary: completed!.outcome!.summary,
      };
    }

    const run = await createAutomationRun({
      type: adType,
      positionId: execution.payload.positionId,
      breezyJobId: execution.payload.breezyJobId,
      reason: execution.payload.reason ?? `${adType} from autopilot execution`,
      dataUsed: ["autopilot-execution", execution.territory],
      expectedOutcome:
        adType === "refresh-ad"
          ? "Posting refreshed to improve applicant flow."
          : "Ad paused or closed per coverage recommendation.",
      undoPath: "Re-open or republish in Job Management.",
      requiresApproval: false,
      payload: {
        suggestedTitle: execution.payload.title ?? "",
        suggestedCity: execution.payload.city ?? "",
        suggestedPriority: execution.priority,
      },
      actor,
    });

    await linkExecutionResources(executionId, { linkedAutomationRunId: run.id });

    const result = await executeAutomationRun({
      runId: run.id,
      actor,
      autoApprove: true,
    });

    if (!result.ok) {
      const failed = await failExecution(executionId, result.error, actor);
      return { ok: false, error: result.error, execution: failed ?? started };
    }

    const completed = await completeExecution(
      executionId,
      {
        summary: result.summary,
        success: true,
        linkedResourceType: "automation-run",
        linkedResourceId: run.id,
      },
      actor,
    );

    return {
      ok: true,
      execution: completed!,
      summary: result.summary,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Posting execution failed.";
    const failed = await failExecution(executionId, message, actor);
    return { ok: false, error: message, execution: failed ?? started };
  }
}

export async function approveAndExecutePosting(
  executionId: string,
  actor?: string,
): Promise<ExecutePostingResult> {
  const approved = await approveExecution(executionId, actor);
  if (!approved) return { ok: false, error: "Execution cannot be approved." };
  return executePostingRecommendation(executionId, actor);
}
