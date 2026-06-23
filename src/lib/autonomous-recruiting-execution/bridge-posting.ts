import type { RecommendedAd } from "@/lib/autonomous-recruiting-engine/types";
import {
  getCorrelation,
  markCorrelationStatus,
  updateCorrelationLinks,
  type ExecutionCorrelation,
} from "@/lib/autonomous-recruiting-execution/execution-correlation";
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
  | { ok: true; correlation: ExecutionCorrelation; summary: string }
  | { ok: false; error: string; correlation?: ExecutionCorrelation };

export async function executePostingCorrelation(
  correlationId: string,
  actor?: string,
): Promise<ExecutePostingResult> {
  const correlation = await getCorrelation(correlationId);
  if (!correlation) return { ok: false, error: "Correlation not found." };
  if (correlation.type !== "posting" && correlation.type !== "refresh") {
    return { ok: false, error: "Correlation is not a posting recommendation.", correlation };
  }
  if (correlation.status !== "approved") {
    return {
      ok: false,
      error: `Cannot execute in status: ${correlation.status}`,
      correlation,
    };
  }

  const adType = correlation.adType;
  if (!adType) return { ok: false, error: "Missing ad type.", correlation };

  const executing = await markCorrelationStatus(correlationId, "executing");
  if (!executing) return { ok: false, error: "Failed to start execution.", correlation };

  try {
    if (adType === "create-new-ad") {
      const draft = await createJobDraft({
        title: correlation.displayTitle ?? "Field Merchandiser",
        description: correlation.reason ?? "Autopilot posting recommendation",
        city: correlation.city ?? "",
        usState: correlation.state ?? "",
        payRate: "",
        department: "Field",
        source: "autopilot-execution",
        metadata: {
          autopilotCorrelationId: correlationId,
          recommendationId: correlation.recommendationId,
          priority: correlation.priority,
        },
        breezyJobId: correlation.breezyJobId,
      });

      await updateCorrelationLinks(correlationId, { jobDraftId: draft.id });

      const completed = await markCorrelationStatus(correlationId, "completed", {
        completedAt: new Date().toISOString(),
      });

      return {
        ok: true,
        correlation: completed!,
        summary: `Job draft created (${draft.id}) — requires push approval in Job Management.`,
      };
    }

    const run = await createAutomationRun({
      type: adType,
      positionId: correlation.positionId,
      breezyJobId: correlation.breezyJobId,
      reason: correlation.reason ?? `${adType} from autopilot execution`,
      dataUsed: ["autopilot-execution", correlation.territory],
      expectedOutcome:
        adType === "refresh-ad"
          ? "Posting refreshed to improve applicant flow."
          : "Ad paused or closed per coverage recommendation.",
      undoPath: "Re-open or republish in Job Management.",
      requiresApproval: false,
      payload: {
        suggestedTitle: correlation.displayTitle ?? "",
        suggestedCity: correlation.city ?? "",
        suggestedPriority: correlation.priority,
      },
      actor,
    });

    await updateCorrelationLinks(correlationId, { automationRunId: run.id });

    const result = await executeAutomationRun({
      runId: run.id,
      actor,
      autoApprove: true,
    });

    if (!result.ok) {
      const failed = await markCorrelationStatus(correlationId, "failed");
      return { ok: false, error: result.error, correlation: failed ?? executing };
    }

    const completed = await markCorrelationStatus(correlationId, "completed", {
      completedAt: new Date().toISOString(),
    });

    return {
      ok: true,
      correlation: completed!,
      summary: result.summary,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Posting execution failed.";
    const failed = await markCorrelationStatus(correlationId, "failed");
    return { ok: false, error: message, correlation: failed ?? executing };
  }
}

/** @deprecated Use executePostingCorrelation */
export const executePostingRecommendation = executePostingCorrelation;
