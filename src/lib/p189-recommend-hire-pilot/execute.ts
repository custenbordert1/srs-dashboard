import { appendFile } from "node:fs/promises";
import path from "node:path";
import {
  buildCandidateContextFromWorkflow,
  executeRecommendHire,
} from "@/lib/p188-1-hiring-recommendation-workflow";
import type { AppendRecommendHireAudit } from "@/lib/p188-1-hiring-recommendation-workflow/audit";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import { recruitingDataDir, safeRecruitingMkdir } from "@/lib/recruiting-data-dir";
import { assertCohortImmutable } from "@/lib/p189-recommend-hire-pilot/freeze";
import type { P189CandidateEnrichment } from "@/lib/p189-recommend-hire-pilot/freeze";
import {
  P189_MAX_RECOMMEND_HIRE_WRITES,
  P189_REASON,
  type P189Authorization,
  type P189ExecutionResult,
  type P189FrozenCohort,
  type P189RecommendAttempt,
} from "@/lib/p189-recommend-hire-pilot/types";

function auditJsonlPath(): string {
  return path.join(recruitingDataDir(), "p189-recommend-hire-audit.jsonl");
}

async function durableAuditAppend(
  record: Parameters<AppendRecommendHireAudit>[0],
): Promise<string> {
  const { appendRecommendHireAudit } = await import(
    "@/lib/p188-1-hiring-recommendation-workflow/audit"
  );
  const id = await appendRecommendHireAudit(record);
  try {
    await safeRecruitingMkdir(recruitingDataDir());
    await appendFile(
      auditJsonlPath(),
      `${JSON.stringify({ ...record, id, at: record.at ?? new Date().toISOString() })}\n`,
      "utf8",
    );
  } catch {
    // memory audit still recorded
  }
  return id;
}

/**
 * Sequential (concurrency=1) Recommend Hire writes for frozen cohort only.
 * Stops on first failure. Does not approve, send paperwork, enable P187, or touch MEL.
 */
export async function executeP189RecommendHirePilot(input: {
  cohort: P189FrozenCohort;
  authorization: P189Authorization;
  enrichments: Record<string, P189CandidateEnrichment>;
}): Promise<P189ExecutionResult> {
  const attempts: P189RecommendAttempt[] = [];
  let successful = 0;
  let failed = 0;
  let auditEvents = 0;
  let p186Observations = 0;
  let duplicateRecommendations = 0;
  let staleConflicts = 0;
  let stoppedEarly = false;
  let stopReason: string | null = null;

  const empty = (reason: string): P189ExecutionResult => ({
    cohortId: input.cohort.cohortId,
    fingerprint: input.cohort.fingerprint,
    attempted: 0,
    successful: 0,
    failed: 0,
    auditEvents: 0,
    p186Observations: 0,
    duplicateRecommendations: 0,
    staleConflicts: 0,
    stoppedEarly: true,
    stopReason: reason,
    attempts: [],
    approvalsCreated: 0,
    paperworkCreated: 0,
    paperworkSendsAttempted: 0,
    melWritesAttempted: 0,
    operatorApprovalsAttempted: 0,
  });

  if (input.authorization.fingerprint !== input.cohort.fingerprint) {
    return empty("Authorization fingerprint mismatch");
  }
  if (input.authorization.cohortId !== input.cohort.cohortId) {
    return empty("Authorization cohortId mismatch");
  }
  if (Date.parse(input.authorization.expiresAt) < Date.now()) {
    return empty("Authorization expired");
  }
  if (input.authorization.allowOperatorApproval || input.authorization.allowPaperwork) {
    return empty("Authorization must disallow OA and paperwork");
  }
  if (input.cohort.members.length > P189_MAX_RECOMMEND_HIRE_WRITES) {
    return empty("Cohort exceeds max Recommend Hire writes");
  }

  for (const member of input.cohort.members) {
    assertCohortImmutable(input.cohort, member.candidateId);

    const workflows = await getCandidateWorkflowState();
    const wf = workflows[member.candidateId];
    const enr = input.enrichments[member.candidateId];

    if (!wf || !enr?.jobId) {
      failed += 1;
      attempts.push({
        candidateId: member.candidateId,
        ok: false,
        status: "blocked",
        correlationId: null,
        idempotencyKey: member.idempotencyKey,
        auditId: null,
        p186Observed: false,
        previousStage: wf?.workflowStatus ?? null,
        resultingStage: wf?.workflowStatus ?? null,
        recommendedStage: null,
        recruiterPreserved: false,
        detail: "Missing workflow or job enrichment at execution time",
        blockers: ["missing_context"],
      });
      stoppedEarly = true;
      stopReason = `Missing context for ${member.candidateId}`;
      break;
    }

    const ctx = buildCandidateContextFromWorkflow(wf, wf.candidateId, {
      jobId: enr.jobId,
      jobLabel: enr.jobLabel,
      jobResolved: true,
      identityResolved: enr.identityResolved,
      recruiterId: member.recruiter,
      recruiterResolved: true,
    });
    ctx.expectedProductionRecordVersion = ctx.productionRecordVersion;

    if (ctx.hasPriorRecommendation) {
      duplicateRecommendations += 1;
      failed += 1;
      attempts.push({
        candidateId: member.candidateId,
        ok: false,
        status: "already_recommended",
        correlationId: null,
        idempotencyKey: member.idempotencyKey,
        auditId: null,
        p186Observed: false,
        previousStage: wf.workflowStatus,
        resultingStage: wf.workflowStatus,
        recommendedStage: wf.recommendedStage ?? null,
        recruiterPreserved: true,
        detail: "Duplicate recommendation detected",
        blockers: ["no_prior_recommendation"],
      });
      stoppedEarly = true;
      stopReason = `Duplicate recommendation for ${member.candidateId}`;
      break;
    }

    if (ctx.stale) {
      staleConflicts += 1;
      failed += 1;
      attempts.push({
        candidateId: member.candidateId,
        ok: false,
        status: "blocked",
        correlationId: null,
        idempotencyKey: member.idempotencyKey,
        auditId: null,
        p186Observed: false,
        previousStage: wf.workflowStatus,
        resultingStage: wf.workflowStatus,
        recommendedStage: null,
        recruiterPreserved: true,
        detail: "Stale workflow version",
        blockers: ["fresh_record_version"],
      });
      stoppedEarly = true;
      stopReason = `Stale workflow for ${member.candidateId}`;
      break;
    }

    const result = await executeRecommendHire(
      {
        candidateId: member.candidateId,
        actor: input.authorization.authorizedBy,
        role: "operator",
        reason: P189_REASON,
        source: "api",
        idempotencyKey: member.idempotencyKey,
        expectedProductionRecordVersion: ctx.productionRecordVersion,
        context: ctx,
      },
      { appendAudit: durableAuditAppend },
      { recommendationApi: true },
    );

    const afterState = await getCandidateWorkflowState();
    const after = afterState[member.candidateId];
    const recruiterPreserved =
      Boolean(after?.assignedRecruiter) &&
      after!.assignedRecruiter === member.recruiter;
    const persisted =
      after?.recommendedStage === "Hiring Recommendation" && recruiterPreserved;

    if (result.auditId) auditEvents += 1;
    if (result.p186Observed) p186Observations += 1;

    if (!result.ok || !persisted) {
      failed += 1;
      attempts.push({
        candidateId: member.candidateId,
        ok: false,
        status: result.status,
        correlationId: result.correlationId,
        idempotencyKey: result.idempotencyKey,
        auditId: result.auditId,
        p186Observed: result.p186Observed,
        previousStage: result.previousWorkflowStatus,
        resultingStage: after?.workflowStatus ?? result.resultingWorkflowStatus,
        recommendedStage: after?.recommendedStage ?? result.recommendedStage,
        recruiterPreserved,
        detail: persisted
          ? result.detail
          : `Persistence verify failed: ${result.detail}; recommendedStage=${after?.recommendedStage ?? "null"}`,
        blockers: result.blockers,
      });
      stoppedEarly = true;
      stopReason = `Recommend Hire failed for ${member.candidateId}: ${result.detail}`;
      break;
    }

    // Ownership/lifecycle history: workflow note/history from upsert; recruiter unchanged.
    const historyHasRecommend =
      (after?.history ?? []).some((h) =>
        /p1881_recommend_hire|P188\.1_RECOMMEND_HIRE|Hiring Recommendation|Await operator approval/i.test(
          h.message ?? "",
        ),
      ) ||
      (after?.notes ?? []).some((n) =>
        /P188\.1_RECOMMEND_HIRE|Hiring Recommendation/i.test(n),
      );

    successful += 1;
    attempts.push({
      candidateId: member.candidateId,
      ok: true,
      status: result.status,
      correlationId: result.correlationId,
      idempotencyKey: result.idempotencyKey,
      auditId: result.auditId,
      p186Observed: result.p186Observed,
      previousStage: result.previousWorkflowStatus,
      resultingStage: after?.workflowStatus ?? result.resultingWorkflowStatus,
      recommendedStage: after?.recommendedStage ?? result.recommendedStage,
      recruiterPreserved,
      detail: historyHasRecommend
        ? result.detail
        : `${result.detail}; history note soft-missing`,
      blockers: [],
    });
  }

  return {
    cohortId: input.cohort.cohortId,
    fingerprint: input.cohort.fingerprint,
    attempted: attempts.length,
    successful,
    failed,
    auditEvents,
    p186Observations,
    duplicateRecommendations,
    staleConflicts,
    stoppedEarly,
    stopReason,
    attempts,
    approvalsCreated: 0,
    paperworkCreated: 0,
    paperworkSendsAttempted: 0,
    melWritesAttempted: 0,
    operatorApprovalsAttempted: 0,
  };
}
