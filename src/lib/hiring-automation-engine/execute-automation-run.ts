import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { upsertCandidateWorkflow } from "@/lib/candidate-workflow-store";
import { createJobDraft } from "@/lib/job-management/job-draft-store";
import {
  approveAutomationRun,
  getAutomationRun,
  markAutomationExecuted,
  markAutomationFailed,
} from "@/lib/hiring-automation-engine/automation-run-store";
import { sendCandidatePaperwork } from "@/lib/hiring-automation-engine/send-candidate-paperwork";
import { checkAutomationSafety } from "@/lib/hiring-automation-engine/safety-rules";
import type { AutomationRun } from "@/lib/hiring-automation-engine/types";

export type ExecuteAutomationInput = {
  runId: string;
  row?: ScoredCandidateWorkflowRow;
  actor?: string;
  autoApprove?: boolean;
};

export type ExecuteAutomationResult =
  | { ok: true; run: AutomationRun; summary: string }
  | { ok: false; error: string; run?: AutomationRun };

export async function executeAutomationRun(
  input: ExecuteAutomationInput,
): Promise<ExecuteAutomationResult> {
  let run = await getAutomationRun(input.runId);
  if (!run) return { ok: false, error: "Automation run not found." };

  if (run.status === "pending") {
    if (!input.autoApprove && run.requiresApproval) {
      return { ok: false, error: "Automation requires approval before execution.", run };
    }
    const approved = await approveAutomationRun(run.id, input.actor);
    if (!approved) return { ok: false, error: "Failed to approve automation.", run };
    run = approved;
  }

  if (run.status !== "approved") {
    return { ok: false, error: `Cannot execute run in status: ${run.status}`, run };
  }

  const safety = checkAutomationSafety(run.type, input.row);
  if (!safety.allowed) {
    const failed = await markAutomationFailed(run.id, safety.reason, input.actor);
    return { ok: false, error: safety.reason, run: failed ?? run };
  }

  try {
    switch (run.type) {
      case "send-paperwork": {
        if (!run.candidateId || !input.row?.email?.trim()) {
          throw new Error("Candidate email required for paperwork send.");
        }
        const result = await sendCandidatePaperwork({
          candidateId: run.candidateId,
          candidateName: run.payload?.candidateName ?? input.row.firstName,
          candidateEmail: input.row.email,
          byUserId: input.actor,
        });
        if (!result.ok) throw new Error(result.error);
        const executed = await markAutomationExecuted(
          run.id,
          `Paperwork sent — request ${result.signatureRequestId}.`,
          input.actor,
        );
        return { ok: true, run: executed!, summary: executed!.resultSummary! };
      }

      case "mark-ready-for-mel": {
        if (!run.candidateId) throw new Error("Candidate required.");
        await upsertCandidateWorkflow({
          candidateId: run.candidateId,
          workflowStatus: "Ready for MEL",
          note: "Automation: paperwork signed — moved to Ready for MEL.",
          audit: { action: "automation_ready_for_mel", byUserId: input.actor },
        });
        const executed = await markAutomationExecuted(
          run.id,
          "Candidate marked Ready for MEL; ops handoff task created.",
          input.actor,
        );
        return { ok: true, run: executed!, summary: executed!.resultSummary! };
      }

      case "follow-up-paperwork":
      case "escalate-recruiter-task": {
        const executed = await markAutomationExecuted(
          run.id,
          `Task recorded: ${run.type}. Recruiter action required in inbox.`,
          input.actor,
        );
        return { ok: true, run: executed!, summary: executed!.resultSummary! };
      }

      case "create-new-ad": {
        const draft = await createJobDraft({
          title: run.payload?.suggestedTitle ?? "Field Merchandiser",
          description: run.reason,
          city: run.payload?.suggestedCity ?? "",
          usState: run.payload?.nearbyLocations?.split(", ").pop() ?? "",
          payRate: "",
          department: "Field",
          source: "automation-engine",
          metadata: {
            automationRunId: run.id,
            priority: run.payload?.suggestedPriority ?? "medium",
          },
        });
        const executed = await markAutomationExecuted(
          run.id,
          `Job draft created (${draft.id}) — requires push approval in Job Management.`,
          input.actor,
        );
        return { ok: true, run: executed!, summary: executed!.resultSummary! };
      }

      case "close-pause-ad":
      case "refresh-ad": {
        const executed = await markAutomationExecuted(
          run.id,
          `${run.type} recommendation logged — complete in Job Management after approval.`,
          input.actor,
        );
        return { ok: true, run: executed!, summary: executed!.resultSummary! };
      }

      default:
        throw new Error(`Unsupported automation type: ${run.type}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Execution failed.";
    const failed = await markAutomationFailed(run.id, message, input.actor);
    return { ok: false, error: message, run: failed ?? run };
  }
}
