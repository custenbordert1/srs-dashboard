import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { upsertCandidateWorkflow } from "@/lib/candidate-workflow-store";
import type { CandidateAutomationMode } from "@/lib/candidate-automation-engine/types";
import {
  createExecutionId,
  findActiveExecution,
  getCandidateExecution,
  listFailedRetryableExecutions,
  recordCandidateExecution,
} from "@/lib/candidate-automation-execution/execution-record-store";
import { isCandidateExecutionActive } from "@/lib/candidate-automation-execution/execution-policy-store";
import type { CandidateExecutionPolicy } from "@/lib/candidate-automation-execution/types";
import type {
  CandidateExecutionDecision,
  CandidateExecutionRecord,
  CandidateExecutionResult,
} from "@/lib/candidate-automation-execution/types";
import { createAutomationRun } from "@/lib/hiring-automation-engine/automation-run-store";
import { executeAutomationRun } from "@/lib/hiring-automation-engine/execute-automation-run";
import type { AutomationType } from "@/lib/hiring-automation-engine/types";

function executionTypeAllowed(
  policy: CandidateExecutionPolicy,
  executionType: CandidateExecutionRecord["executionType"],
): boolean {
  if (!isCandidateExecutionActive(policy)) return false;
  if (executionType === "send-paperwork-request") return policy.paperwork.enabled;
  if (executionType === "create-escalation-task") return policy.escalation.enabled;
  return true;
}

function toAutomationType(executionType: CandidateExecutionRecord["executionType"]): AutomationType {
  switch (executionType) {
    case "send-paperwork-request":
      return "send-paperwork";
    case "schedule-recruiter-follow-up":
      return "follow-up-paperwork";
    case "create-escalation-task":
      return "escalate-recruiter-task";
  }
}

function requiresExecutionApproval(input: {
  policy: CandidateExecutionPolicy;
  automationMode: CandidateAutomationMode;
  executionType: CandidateExecutionRecord["executionType"];
  automationType: AutomationType;
}): boolean {
  if (input.policy.mode === "semi-automatic" || input.automationMode === "semi-automatic") {
    if (input.executionType === "create-escalation-task") {
      return input.policy.escalation.requireApproval;
    }
    if (input.automationType === "send-paperwork") return true;
  }
  if (input.executionType === "create-escalation-task") {
    return input.policy.escalation.requireApproval;
  }
  return input.automationType === "send-paperwork" && input.policy.mode !== "automatic";
}

async function markExecution(
  record: CandidateExecutionRecord,
  patch: Partial<CandidateExecutionRecord>,
): Promise<CandidateExecutionRecord> {
  return recordCandidateExecution({ ...record, ...patch });
}

function simulateSafetyCounts(input: {
  decisions: CandidateExecutionDecision[];
  candidatesById: Map<string, ScoredCandidateWorkflowRow>;
  policy: CandidateExecutionPolicy;
}): Pick<CandidateExecutionResult, "blockedByPolicy" | "blockedByBatchCap" | "eligibleExecutions"> {
  let blockedByPolicy = 0;
  let blockedByBatchCap = 0;
  let eligibleExecutions = 0;
  let escalationsThisRun = 0;

  for (const decision of input.decisions) {
    if (!input.candidatesById.has(decision.candidateId)) continue;
    eligibleExecutions += 1;

    if (!executionTypeAllowed(input.policy, decision.executionType)) {
      blockedByPolicy += 1;
      continue;
    }

    if (
      decision.executionType === "create-escalation-task" &&
      escalationsThisRun >= input.policy.maxEscalationsPerRun
    ) {
      blockedByBatchCap += 1;
      continue;
    }

    if (decision.executionType === "create-escalation-task") {
      escalationsThisRun += 1;
    }
  }

  return { eligibleExecutions, blockedByPolicy, blockedByBatchCap };
}

async function executeDecision(input: {
  decision: CandidateExecutionDecision;
  row: ScoredCandidateWorkflowRow;
  policy: CandidateExecutionPolicy;
  orchestratorRunId?: string;
  automationMode: CandidateAutomationMode;
  byUserId?: string;
  existingRecord?: CandidateExecutionRecord;
}): Promise<CandidateExecutionRecord> {
  const now = new Date().toISOString();
  if (!input.existingRecord) {
    const existing = await findActiveExecution(input.decision.candidateId, input.decision.executionType);
    if (existing) return existing;
  }

  let record: CandidateExecutionRecord = input.existingRecord ?? {
    executionId: createExecutionId(),
    orchestratorRunId: input.orchestratorRunId,
    candidateId: input.decision.candidateId,
    executionType: input.decision.executionType,
    status: "pending",
    actionType: input.decision.actionType,
    requiredAction: input.decision.requiredAction,
    createdAt: now,
    retryCount: 0,
  };
  if (!input.existingRecord) {
    record = await recordCandidateExecution(record);
  }

  if (!executionTypeAllowed(input.policy, input.decision.executionType)) {
    return markExecution(record, {
      status: "failed",
      failedAt: now,
      failureReason: `${input.decision.executionType} blocked by execution policy.`,
    });
  }

  record = await markExecution(record, { status: "in_progress", startedAt: now });

  const automationType = toAutomationType(input.decision.executionType);
  const needsApproval = requiresExecutionApproval({
    policy: input.policy,
    automationMode: input.automationMode,
    executionType: input.decision.executionType,
    automationType,
  });

  if (input.decision.executionType === "schedule-recruiter-follow-up") {
    const followUpDueAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await upsertCandidateWorkflow({
      candidateId: input.decision.candidateId,
      followUpDueAt,
      note: `Automation: recruiter follow-up scheduled — ${input.decision.reason}`,
      audit: { action: "automation_follow_up_scheduled", byUserId: input.byUserId },
    });
    return markExecution(record, {
      status: "completed",
      completedAt: new Date().toISOString(),
      resultSummary: `Follow-up scheduled for ${followUpDueAt}`,
    });
  }

  const automationRun = await createAutomationRun({
    type: automationType,
    candidateId: input.decision.candidateId,
    positionId: input.row.positionId,
    reason: input.decision.reason,
    dataUsed: ["p65-execution", input.decision.actionType],
    expectedOutcome: input.decision.requiredAction,
    undoPath: "Review execution record in automation execution history.",
    requiresApproval: needsApproval,
    payload: {
      candidateName: `${input.row.firstName} ${input.row.lastName}`.trim() || input.row.email,
      email: input.row.email,
      positionName: input.row.positionName,
    },
    actor: input.byUserId,
  });

  record = await markExecution(record, { automationRunId: automationRun.id });

  if (automationRun.requiresApproval) {
    return markExecution(record, {
      status: "completed",
      completedAt: new Date().toISOString(),
      resultSummary: "Execution planned — awaiting approval (semi-automatic / escalation policy).",
    });
  }

  const result = await executeAutomationRun({
    runId: automationRun.id,
    row: input.row,
    actor: input.byUserId,
    autoApprove: input.policy.mode === "automatic" || input.automationMode === "automatic",
  });

  if (result.ok) {
    return markExecution(record, {
      status: "completed",
      completedAt: new Date().toISOString(),
      resultSummary: result.summary,
    });
  }

  return markExecution(record, {
    status: "failed",
    failedAt: new Date().toISOString(),
    failureReason: result.error,
  });
}

export async function applyCandidateExecutions(input: {
  decisions: CandidateExecutionDecision[];
  candidatesById: Map<string, ScoredCandidateWorkflowRow>;
  policy: CandidateExecutionPolicy;
  orchestratorRunId?: string;
  automationMode: CandidateAutomationMode;
  byUserId?: string;
}): Promise<CandidateExecutionResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  let created = 0;
  let completed = 0;
  let failed = 0;
  let escalationsCreated = 0;
  let skipped = 0;
  let escalationsThisRun = 0;

  const simulated = simulateSafetyCounts({
    decisions: input.decisions,
    candidatesById: input.candidatesById,
    policy: input.policy,
  });

  if (!isCandidateExecutionActive(input.policy)) {
    return {
      ok: true,
      dryRun: input.policy.dryRun,
      eligibleExecutions: simulated.eligibleExecutions,
      created: 0,
      completed: 0,
      failed: 0,
      escalationsCreated: 0,
      retriesAttempted: 0,
      skipped: input.decisions.length,
      blockedByPolicy: simulated.eligibleExecutions,
      blockedByBatchCap: 0,
      errors,
      warnings: ["Execution policy disabled — skipped all decisions."],
    };
  }

  if (input.policy.dryRun) {
    return {
      ok: true,
      dryRun: true,
      eligibleExecutions: simulated.eligibleExecutions,
      created: 0,
      completed: 0,
      failed: 0,
      escalationsCreated: 0,
      retriesAttempted: 0,
      skipped: simulated.blockedByPolicy + simulated.blockedByBatchCap,
      blockedByPolicy: simulated.blockedByPolicy,
      blockedByBatchCap: simulated.blockedByBatchCap,
      errors,
      warnings: ["Dry run — no executions performed."],
    };
  }

  let blockedByPolicy = 0;
  let blockedByBatchCap = 0;

  for (const decision of input.decisions) {
    const row = input.candidatesById.get(decision.candidateId);
    if (!row) {
      skipped += 1;
      continue;
    }

    if (!executionTypeAllowed(input.policy, decision.executionType)) {
      blockedByPolicy += 1;
      skipped += 1;
      continue;
    }

    if (
      decision.executionType === "create-escalation-task" &&
      escalationsThisRun >= input.policy.maxEscalationsPerRun
    ) {
      blockedByBatchCap += 1;
      skipped += 1;
      warnings.push(
        `Escalation batch cap (${input.policy.maxEscalationsPerRun}) reached for ${decision.candidateId}.`,
      );
      continue;
    }

    try {
      const before = await findActiveExecution(decision.candidateId, decision.executionType);
      if (before?.status === "completed") {
        skipped += 1;
        continue;
      }
      const record = await executeDecision({
        decision,
        row,
        policy: input.policy,
        orchestratorRunId: input.orchestratorRunId,
        automationMode: input.automationMode,
        byUserId: input.byUserId,
      });
      if (!before) created += 1;
      if (record.status === "completed") completed += 1;
      if (record.status === "failed") failed += 1;
      if (record.executionType === "create-escalation-task") {
        if (record.status === "completed") {
          escalationsCreated += 1;
          escalationsThisRun += 1;
        }
      }
    } catch (error) {
      failed += 1;
      errors.push(error instanceof Error ? error.message : "Execution failed.");
    }
  }

  return {
    ok: errors.length === 0,
    dryRun: false,
    eligibleExecutions: simulated.eligibleExecutions,
    created,
    completed,
    failed,
    escalationsCreated,
    retriesAttempted: 0,
    skipped,
    blockedByPolicy,
    blockedByBatchCap,
    errors,
    warnings,
  };
}

export async function retryEligibleExecution(input: {
  executionId: string;
  policy: CandidateExecutionPolicy;
  candidatesById: Map<string, ScoredCandidateWorkflowRow>;
  automationMode: CandidateAutomationMode;
  byUserId?: string;
}): Promise<CandidateExecutionRecord | null> {
  if (input.policy.dryRun || !isCandidateExecutionActive(input.policy)) return null;

  const record = await getCandidateExecution(input.executionId);
  if (!record || record.status !== "failed") return record;
  if (record.retryCount >= input.policy.maxRetries) return record;

  const row = input.candidatesById.get(record.candidateId);
  if (!row) return record;

  const retried = await markExecution(record, {
    status: "retrying",
    retryCount: record.retryCount + 1,
    failureReason: undefined,
    failedAt: undefined,
  });

  const decision: CandidateExecutionDecision = {
    candidateId: record.candidateId,
    executionType: record.executionType,
    actionType: record.actionType ?? "none",
    requiredAction: record.requiredAction ?? record.executionType,
    reason: record.failureReason ?? "Retry eligible execution",
    stalled: record.executionType === "create-escalation-task",
  };

  return executeDecision({
    decision,
    row,
    policy: input.policy,
    orchestratorRunId: record.orchestratorRunId,
    automationMode: input.automationMode,
    byUserId: input.byUserId,
    existingRecord: retried,
  });
}

export async function retryFailedExecutions(input: {
  policy: CandidateExecutionPolicy;
  candidatesById: Map<string, ScoredCandidateWorkflowRow>;
  automationMode: CandidateAutomationMode;
  byUserId?: string;
}): Promise<number> {
  if (input.policy.dryRun || !isCandidateExecutionActive(input.policy)) return 0;

  const failed = await listFailedRetryableExecutions(input.policy.maxRetries);
  let retriesAttempted = 0;
  for (const record of failed) {
    const retried = await retryEligibleExecution({
      executionId: record.executionId,
      policy: input.policy,
      candidatesById: input.candidatesById,
      automationMode: input.automationMode,
      byUserId: input.byUserId,
    });
    if (retried && retried.status !== "failed") retriesAttempted += 1;
  }
  return retriesAttempted;
}
