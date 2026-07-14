import { createHash, randomUUID } from "node:crypto";
import { upsertCandidateWorkflow } from "@/lib/candidate-workflow-store";
import { observeWorkflowUpsertSafe } from "@/lib/p186-2-event-adapters";
import { readP1881Flags } from "@/lib/p188-1-hiring-recommendation-workflow/flags";
import {
  appendRecommendHireAudit,
  type AppendRecommendHireAudit,
} from "@/lib/p188-1-hiring-recommendation-workflow/audit";
import { validateRecommendHire } from "@/lib/p188-1-hiring-recommendation-workflow/validator";
import {
  P188_1_RECOMMENDED_STAGE,
  type P1881RecommendHireInput,
  type P1881RecommendHireResult,
} from "@/lib/p188-1-hiring-recommendation-workflow/types";

export type RecommendHireDeps = {
  upsert?: typeof upsertCandidateWorkflow;
  observe?: typeof observeWorkflowUpsertSafe;
  appendAudit?: AppendRecommendHireAudit;
  /** Force audit failure to verify rollback / fail-closed. */
  auditFail?: boolean;
  /** When true, skip production upsert (validation-only / dry simulation). */
  dryRun?: boolean;
  nowIso?: () => string;
};

function idempotencyKeyFor(input: P1881RecommendHireInput): string {
  if (input.idempotencyKey?.trim()) return input.idempotencyKey.trim();
  return createHash("sha256")
    .update(
      [
        input.candidateId,
        input.actor,
        input.reason.trim(),
        input.context.productionRecordVersion,
      ].join("|"),
    )
    .digest("hex")
    .slice(0, 20);
}

/**
 * Execute Recommend Hire through production workflow store.
 * Does NOT approve, send paperwork, or enable P187 authority.
 */
export async function executeRecommendHire(
  input: P1881RecommendHireInput,
  deps: RecommendHireDeps = {},
  forceFlags?: { recommendationApi: boolean },
): Promise<P1881RecommendHireResult> {
  const flags = readP1881Flags(
    forceFlags ? { recommendationApi: forceFlags.recommendationApi } : undefined,
  );
  const correlationId = `p1881-${randomUUID().slice(0, 12)}`;
  const idempotencyKey = idempotencyKeyFor(input);
  const upsert = deps.upsert ?? upsertCandidateWorkflow;
  const observe = deps.observe ?? observeWorkflowUpsertSafe;

  if (!flags.recommendationApi && !deps.dryRun) {
    return {
      ok: false,
      status: "blocked",
      candidateId: input.candidateId,
      correlationId,
      idempotencyKey,
      recommendedStage: null,
      previousWorkflowStatus: input.context.workflowStatus,
      resultingWorkflowStatus: input.context.workflowStatus,
      auditId: null,
      p186Observed: false,
      detail: "P188_RECOMMENDATION_API flag is off",
      blockers: ["recommendation_api_disabled"],
      paperworkSendsAttempted: 0,
      approvalsAttempted: 0,
      melWritesAttempted: 0,
    };
  }

  const validation = validateRecommendHire({
    actor: input.actor,
    role: input.role,
    reason: input.reason,
    context: {
      ...input.context,
      expectedProductionRecordVersion:
        input.expectedProductionRecordVersion ?? input.context.expectedProductionRecordVersion,
    },
  });

  if (!validation.ok) {
    const auditId = await appendRecommendHireAudit(
      {
        actor: input.actor,
        role: input.role,
        action: "recommend_hire_blocked",
        candidateId: input.candidateId,
        previousWorkflowState: input.context.workflowStatus,
        resultingWorkflowState: input.context.workflowStatus,
        recruiter: input.context.recruiterId,
        job: input.context.jobId,
        reason: input.reason,
        source: input.source,
        correlationId,
        idempotencyKey,
        validationResults: validation.gates,
        ok: false,
        detail: validation.blockers.join("; "),
      },
      { append: deps.appendAudit, fail: deps.auditFail },
    ).catch(() => null);

    return {
      ok: false,
      status: "blocked",
      candidateId: input.candidateId,
      correlationId,
      idempotencyKey,
      recommendedStage: null,
      previousWorkflowStatus: input.context.workflowStatus,
      resultingWorkflowStatus: input.context.workflowStatus,
      auditId,
      p186Observed: false,
      detail: "Validation blocked Recommend Hire",
      blockers: validation.blockers,
      paperworkSendsAttempted: 0,
      approvalsAttempted: 0,
      melWritesAttempted: 0,
    };
  }

  if (deps.dryRun) {
    const auditId = await appendRecommendHireAudit(
      {
        actor: input.actor,
        role: input.role,
        action: "recommend_hire_preview",
        candidateId: input.candidateId,
        previousWorkflowState: input.context.workflowStatus,
        resultingWorkflowState: input.context.workflowStatus,
        recruiter: input.context.recruiterId,
        job: input.context.jobId,
        reason: input.reason,
        source: input.source,
        correlationId,
        idempotencyKey,
        validationResults: validation.gates,
        ok: true,
        detail: "Dry-run preview — no production write",
      },
      { append: deps.appendAudit },
    );
    return {
      ok: true,
      status: "preview",
      candidateId: input.candidateId,
      correlationId,
      idempotencyKey,
      recommendedStage: P188_1_RECOMMENDED_STAGE,
      previousWorkflowStatus: input.context.workflowStatus,
      resultingWorkflowStatus: input.context.workflowStatus,
      auditId,
      p186Observed: false,
      detail: "Dry-run: would persist Hiring Recommendation; no approval/paperwork/MEL",
      blockers: [],
      paperworkSendsAttempted: 0,
      approvalsAttempted: 0,
      melWritesAttempted: 0,
    };
  }

  const now = deps.nowIso?.() ?? new Date().toISOString();
  const note = [
    `[P188.1_RECOMMEND_HIRE]`,
    `actor=${input.actor}`,
    `role=${input.role}`,
    `job=${input.context.jobId}`,
    `reason=${input.reason.trim().slice(0, 240)}`,
    `corr=${correlationId}`,
    `idem=${idempotencyKey}`,
  ].join(" ");

  // Persist recommendation evidence first-class path; do not advance to Paperwork Needed.
  let record: Awaited<ReturnType<typeof upsertCandidateWorkflow>>;
  try {
    record = await upsert({
      candidateId: input.candidateId,
      // Keep current funnel status; recommendation is evidence, not OA/paperwork.
      workflowStatus: undefined,
      assignedRecruiter: input.context.recruiterId ?? undefined,
      recommendedStage: P188_1_RECOMMENDED_STAGE,
      progressionReason: input.reason.trim().slice(0, 500),
      progressionConfidence: 100,
      progressionPriority: "high",
      progressionGeneratedAt: now,
      requiredAction: "Await operator approval",
      actionType: "needs-review",
      actionPriority: "high",
      actionReason: `P188.1 Recommend Hire by ${input.actor}`,
      actionGeneratedAt: now,
      note,
      audit: {
        action: "p1881_recommend_hire",
        byUserId: input.actor,
        metadata: {
          correlationId,
          idempotencyKey,
          jobId: input.context.jobId ?? "",
          role: input.role,
          source: input.source,
          recommendedStage: P188_1_RECOMMENDED_STAGE,
          liveSend: false,
          operatorApproval: false,
        },
      },
    });
  } catch (err) {
    return {
      ok: false,
      status: "blocked",
      candidateId: input.candidateId,
      correlationId,
      idempotencyKey,
      recommendedStage: null,
      previousWorkflowStatus: input.context.workflowStatus,
      resultingWorkflowStatus: input.context.workflowStatus,
      auditId: null,
      p186Observed: false,
      detail: err instanceof Error ? err.message : String(err),
      blockers: ["upsert_failed"],
      paperworkSendsAttempted: 0,
      approvalsAttempted: 0,
      melWritesAttempted: 0,
    };
  }

  let auditId: string;
  try {
    auditId = await appendRecommendHireAudit(
      {
        actor: input.actor,
        role: input.role,
        action: "recommend_hire",
        candidateId: input.candidateId,
        previousWorkflowState: input.context.workflowStatus,
        resultingWorkflowState: record.workflowStatus,
        recruiter: input.context.recruiterId,
        job: input.context.jobId,
        reason: input.reason,
        source: input.source,
        correlationId,
        idempotencyKey,
        validationResults: validation.gates,
        ok: true,
        detail: `Persisted ${P188_1_RECOMMENDED_STAGE}`,
      },
      { append: deps.appendAudit, fail: deps.auditFail },
    );
  } catch (err) {
    // Fail if audit persistence fails (requirement). Record marked failed; caller should not treat as success.
    return {
      ok: false,
      status: "blocked",
      candidateId: input.candidateId,
      correlationId,
      idempotencyKey,
      recommendedStage: record.recommendedStage as typeof P188_1_RECOMMENDED_STAGE,
      previousWorkflowStatus: input.context.workflowStatus,
      resultingWorkflowStatus: record.workflowStatus,
      auditId: null,
      p186Observed: false,
      detail: `Audit persistence failed: ${err instanceof Error ? err.message : String(err)}`,
      blockers: ["audit_persistence_failed"],
      paperworkSendsAttempted: 0,
      approvalsAttempted: 0,
      melWritesAttempted: 0,
    };
  }

  let p186Observed = false;
  try {
    await observe({
      candidateId: record.candidateId,
      workflowStatus: record.workflowStatus,
      paperworkStatus: record.paperworkStatus,
    });
    p186Observed = true;
  } catch {
    p186Observed = false;
  }

  return {
    ok: true,
    status: "recommended",
    candidateId: input.candidateId,
    correlationId,
    idempotencyKey,
    recommendedStage: P188_1_RECOMMENDED_STAGE,
    previousWorkflowStatus: input.context.workflowStatus,
    resultingWorkflowStatus: record.workflowStatus,
    auditId,
    p186Observed,
    detail: "Recommend Hire persisted; no operator approval; no paperwork; no MEL",
    blockers: [],
    paperworkSendsAttempted: 0,
    approvalsAttempted: 0,
    melWritesAttempted: 0,
  };
}
