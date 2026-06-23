import {
  getCorrelation,
  markCorrelationStatus,
  updateCorrelationLinks,
  type ExecutionCorrelation,
} from "@/lib/autonomous-recruiting-execution/execution-correlation";
import { createAutomationRun } from "@/lib/hiring-automation-engine/automation-run-store";
import { executeAutomationRun } from "@/lib/hiring-automation-engine/execute-automation-run";
import type { AutomationType } from "@/lib/hiring-automation-engine/types";

export type ExecuteHiringResult =
  | { ok: true; correlation: ExecutionCorrelation; summary: string }
  | { ok: false; error: string; correlation?: ExecutionCorrelation };

function resolveAutomationType(hiringAction?: string): AutomationType {
  if (hiringAction === "Hire Now") return "mark-ready-for-mel";
  return "send-paperwork";
}

export async function executeHiringCorrelation(
  correlationId: string,
  actor?: string,
): Promise<ExecuteHiringResult> {
  const correlation = await getCorrelation(correlationId);
  if (!correlation) return { ok: false, error: "Correlation not found." };
  if (correlation.type !== "hiring") {
    return { ok: false, error: "Correlation is not a hiring recommendation.", correlation };
  }
  if (!correlation.candidateId) {
    return { ok: false, error: "Missing candidate on correlation.", correlation };
  }
  if (correlation.status !== "approved") {
    return {
      ok: false,
      error: `Cannot execute in status: ${correlation.status}`,
      correlation,
    };
  }

  const executing = await markCorrelationStatus(correlationId, "executing");
  if (!executing) return { ok: false, error: "Failed to start execution.", correlation };

  const automationType = resolveAutomationType(correlation.hiringAction);

  try {
    const run = await createAutomationRun({
      type: automationType,
      candidateId: correlation.candidateId,
      reason: correlation.reason ?? `${correlation.hiringAction ?? "Hiring"} via autopilot execution`,
      dataUsed: ["autopilot-execution", correlation.territory],
      expectedOutcome:
        automationType === "mark-ready-for-mel"
          ? "Candidate advanced toward MEL review."
          : "Paperwork follow-up triggered in candidate workflow.",
      undoPath: "Review candidate workflow state in Candidates tab.",
      requiresApproval: false,
      actor,
    });

    await updateCorrelationLinks(correlationId, {
      automationRunId: run.id,
      candidateId: correlation.candidateId,
    });

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
    const message = error instanceof Error ? error.message : "Hiring execution failed.";
    const failed = await markCorrelationStatus(correlationId, "failed");
    return { ok: false, error: message, correlation: failed ?? executing };
  }
}

export async function executeCorrelation(
  correlationId: string,
  actor?: string,
): Promise<ExecuteHiringResult | Awaited<ReturnType<typeof import("./bridge-posting").executePostingCorrelation>>> {
  const correlation = await getCorrelation(correlationId);
  if (!correlation) return { ok: false, error: "Correlation not found." };

  if (correlation.type === "hiring") {
    return executeHiringCorrelation(correlationId, actor);
  }

  if (correlation.type === "posting" || correlation.type === "refresh") {
    const { executePostingCorrelation } = await import(
      "@/lib/autonomous-recruiting-execution/bridge-posting"
    );
    return executePostingCorrelation(correlationId, actor);
  }

  return {
    ok: false,
    error: `Coverage correlations delegate to Executive Accountability; open action ${correlation.accountabilityActionId ?? "in accountability center"}.`,
    correlation,
  };
}
