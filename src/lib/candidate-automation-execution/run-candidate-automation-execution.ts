import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { CandidateAutomationMode } from "@/lib/candidate-automation-engine/types";
import {
  applyCandidateExecutions,
  retryFailedExecutions,
} from "@/lib/candidate-automation-execution/apply-candidate-executions";
import { buildExecutionDecisions } from "@/lib/candidate-automation-execution/build-execution-decisions";
import { saveExecutionRunSummary } from "@/lib/candidate-automation-execution/execution-last-run-store";
import { loadCandidateExecutionPolicy } from "@/lib/candidate-automation-execution/execution-policy-store";
import type { CandidateExecutionResult } from "@/lib/candidate-automation-execution/types";

export async function runCandidateAutomationExecution(input: {
  candidates: ScoredCandidateWorkflowRow[];
  orchestratorRunId?: string;
  automationMode: CandidateAutomationMode;
  byUserId?: string;
}): Promise<CandidateExecutionResult> {
  const policy = await loadCandidateExecutionPolicy();
  const candidatesById = new Map(input.candidates.map((row) => [row.candidateId, row]));

  const decisions = buildExecutionDecisions({
    candidates: input.candidates,
    escalationDelayHours: policy.escalationDelayHours,
  });

  const result = await applyCandidateExecutions({
    decisions,
    candidatesById,
    policy,
    orchestratorRunId: input.orchestratorRunId,
    automationMode: input.automationMode,
    byUserId: input.byUserId,
  });

  const retriesAttempted = policy.dryRun
    ? 0
    : await retryFailedExecutions({
        policy,
        candidatesById,
        automationMode: input.automationMode,
        byUserId: input.byUserId,
      });

  const finalResult: CandidateExecutionResult = {
    ...result,
    retriesAttempted,
  };

  await saveExecutionRunSummary({
    runAt: new Date().toISOString(),
    orchestratorRunId: input.orchestratorRunId,
    dryRun: finalResult.dryRun,
    eligibleExecutions: finalResult.eligibleExecutions,
    executed: finalResult.completed,
    blockedByPolicy: finalResult.blockedByPolicy,
    blockedByBatchCap: finalResult.blockedByBatchCap,
  });

  return finalResult;
}
