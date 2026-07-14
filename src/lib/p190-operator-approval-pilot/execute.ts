import { appendFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  getCandidateWorkflowState,
  upsertCandidateWorkflow,
} from "@/lib/candidate-workflow-store";
import { observeWorkflowUpsertSafe } from "@/lib/p186-2-event-adapters";
import { recruitingDataDir, safeRecruitingMkdir } from "@/lib/recruiting-data-dir";
import { assertCohortImmutable } from "@/lib/p190-operator-approval-pilot/freeze";
import { validateOperatorApprovalCandidate } from "@/lib/p190-operator-approval-pilot/validate";
import {
  P190_MAX_APPROVAL_WRITES,
  P190_OPERATOR_APPROVED_STATUS,
  P190_REASON,
  type P190Authorization,
  type P190ApprovalAttempt,
  type P190ExecutionResult,
  type P190FrozenCohort,
} from "@/lib/p190-operator-approval-pilot/types";

function auditJsonlPath(): string {
  return path.join(recruitingDataDir(), "p190-operator-approval-audit.jsonl");
}

async function appendP190Audit(record: Record<string, unknown>): Promise<string> {
  const id = String(record.id ?? `p190-aud-${randomUUID().slice(0, 10)}`);
  const full = { ...record, id, at: record.at ?? new Date().toISOString() };
  try {
    await safeRecruitingMkdir(recruitingDataDir());
    await appendFile(auditJsonlPath(), `${JSON.stringify(full)}\n`, "utf8");
  } catch {
    // continue — caller still counts attempt audit
  }
  return id;
}

/**
 * Sequential (concurrency=1) Operator Approval for frozen P190 cohort only.
 * Stops on first failure. Does not create Paperwork Needed / P184 / Dropbox / MEL.
 */
export async function executeP190OperatorApprovalPilot(input: {
  cohort: P190FrozenCohort;
  authorization: P190Authorization;
}): Promise<P190ExecutionResult> {
  const attempts: P190ApprovalAttempt[] = [];
  let successful = 0;
  let failed = 0;
  let auditEvents = 0;
  let p186Observations = 0;
  let duplicateApprovals = 0;
  let stoppedEarly = false;
  let stopReason: string | null = null;

  const empty = (reason: string): P190ExecutionResult => ({
    cohortId: input.cohort.cohortId,
    fingerprint: input.cohort.fingerprint,
    attempted: 0,
    successful: 0,
    failed: 0,
    auditEvents: 0,
    p186Observations: 0,
    duplicateApprovals: 0,
    paperworkCreated: 0,
    dropboxSignSends: 0,
    melExports: 0,
    stoppedEarly: true,
    stopReason: reason,
    attempts: [],
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
  if (
    input.authorization.allowPaperwork ||
    input.authorization.allowP184 ||
    input.authorization.allowP187 ||
    input.authorization.allowAutomation ||
    input.authorization.allowMel ||
    input.authorization.allowDropboxSign
  ) {
    return empty("Authorization must disallow paperwork/P184/P187/automation/MEL/Dropbox");
  }
  if (input.cohort.members.length > P190_MAX_APPROVAL_WRITES) {
    return empty("Cohort exceeds max Operator Approval writes");
  }

  for (const member of input.cohort.members) {
    assertCohortImmutable(input.cohort, member.candidateId);

    const workflows = await getCandidateWorkflowState();
    const wf = workflows[member.candidateId];
    const validation = validateOperatorApprovalCandidate({
      member,
      workflow: wf,
      jobResolved: Boolean(member.jobId.trim()),
    });

    if (!validation.ok) {
      const isDup = validation.blockers.some((b) => b.startsWith("not_already_approved"));
      if (isDup) duplicateApprovals += 1;
      failed += 1;
      const auditId = await appendP190Audit({
        action: "operator_approval_blocked",
        candidateId: member.candidateId,
        actor: input.authorization.authorizedBy,
        ok: false,
        blockers: validation.blockers,
        gates: validation.gates,
        cohortId: input.cohort.cohortId,
      });
      auditEvents += 1;
      attempts.push({
        candidateId: member.candidateId,
        ok: false,
        status: "blocked",
        correlationId: null,
        idempotencyKey: member.idempotencyKey,
        auditId,
        p186Observed: false,
        previousWorkflowStatus: wf?.workflowStatus ?? null,
        resultingWorkflowStatus: wf?.workflowStatus ?? null,
        recommendedStagePreserved: true,
        recruiterPreserved: true,
        paperworkCreated: false,
        dropboxSignSends: 0,
        melExports: 0,
        detail: validation.blockers.join("; "),
        blockers: validation.blockers,
      });
      stoppedEarly = true;
      stopReason = `Validation failed for ${member.candidateId}`;
      break;
    }

    const correlationId = `p190-${randomUUID().slice(0, 12)}`;
    const now = new Date().toISOString();
    const note = [
      `[P190_OPERATOR_APPROVED]`,
      `operator approved`,
      `actor=${input.authorization.authorizedBy}`,
      `cohort=${input.cohort.cohortId}`,
      `corr=${correlationId}`,
      `idem=${member.idempotencyKey}`,
      `no_paperwork=true`,
    ].join(" ");

    let record: Awaited<ReturnType<typeof upsertCandidateWorkflow>>;
    try {
      record = await upsertCandidateWorkflow({
        candidateId: member.candidateId,
        workflowStatus: P190_OPERATOR_APPROVED_STATUS,
        forceWorkflowStatus: true,
        assignedRecruiter: member.recruiter,
        expectedRecruiter: member.recruiter,
        expectedOwnershipVersion: member.expectedOwnershipVersion,
        progressionReason: P190_REASON,
        progressionConfidence: 100,
        progressionPriority: "high",
        progressionGeneratedAt: now,
        requiredAction: "Await Paperwork Needed authorization",
        actionType: "needs-review",
        actionPriority: "high",
        actionReason: `P190 Operator Approval by ${input.authorization.authorizedBy}`,
        actionGeneratedAt: now,
        note,
        audit: {
          action: "p190_operator_approval",
          byUserId: input.authorization.authorizedBy,
          metadata: {
            correlationId,
            idempotencyKey: member.idempotencyKey,
            cohortId: input.cohort.cohortId,
            fingerprint: input.cohort.fingerprint,
            sourceCohortId: input.cohort.sourceCohortId,
            liveSend: false,
            paperwork: false,
            p184: false,
            p187: false,
            mel: false,
          },
        },
      });
    } catch (err) {
      failed += 1;
      const auditId = await appendP190Audit({
        action: "operator_approval_failed",
        candidateId: member.candidateId,
        actor: input.authorization.authorizedBy,
        ok: false,
        detail: err instanceof Error ? err.message : String(err),
        correlationId,
      });
      auditEvents += 1;
      attempts.push({
        candidateId: member.candidateId,
        ok: false,
        status: "failed",
        correlationId,
        idempotencyKey: member.idempotencyKey,
        auditId,
        p186Observed: false,
        previousWorkflowStatus: wf!.workflowStatus,
        resultingWorkflowStatus: wf!.workflowStatus,
        recommendedStagePreserved: true,
        recruiterPreserved: true,
        paperworkCreated: false,
        dropboxSignSends: 0,
        melExports: 0,
        detail: err instanceof Error ? err.message : String(err),
        blockers: ["upsert_failed"],
      });
      stoppedEarly = true;
      stopReason = `Upsert failed for ${member.candidateId}`;
      break;
    }

    let p186Observed = false;
    try {
      await observeWorkflowUpsertSafe({
        candidateId: record.candidateId,
        workflowStatus: record.workflowStatus,
        paperworkStatus: record.paperworkStatus,
      });
      p186Observed = true;
      p186Observations += 1;
    } catch {
      p186Observed = false;
    }

    const afterState = await getCandidateWorkflowState();
    const after = afterState[member.candidateId];
    const recruiterPreserved = after?.assignedRecruiter === member.recruiter;
    const recommendedStagePreserved =
      after?.recommendedStage === member.recommendedStage;
    const statusOk = after?.workflowStatus === P190_OPERATOR_APPROVED_STATUS;
    const noPaperwork =
      after?.paperworkStatus === "not_sent" &&
      !after?.paperworkSentAt &&
      !after?.signatureRequestId &&
      after?.workflowStatus !== "Paperwork Needed";
    const auditId = await appendP190Audit({
      action: "operator_approval",
      candidateId: member.candidateId,
      actor: input.authorization.authorizedBy,
      ok: Boolean(statusOk && recruiterPreserved && noPaperwork),
      previousWorkflowStatus: wf!.workflowStatus,
      resultingWorkflowStatus: after?.workflowStatus ?? null,
      correlationId,
      idempotencyKey: member.idempotencyKey,
      p186Observed,
    });
    auditEvents += 1;

    if (!statusOk || !recruiterPreserved || !noPaperwork || !recommendedStagePreserved) {
      failed += 1;
      attempts.push({
        candidateId: member.candidateId,
        ok: false,
        status: "verify_failed",
        correlationId,
        idempotencyKey: member.idempotencyKey,
        auditId,
        p186Observed,
        previousWorkflowStatus: wf!.workflowStatus,
        resultingWorkflowStatus: after?.workflowStatus ?? null,
        recommendedStagePreserved,
        recruiterPreserved,
        paperworkCreated: false,
        dropboxSignSends: 0,
        melExports: 0,
        detail: `Post-write verify failed status=${after?.workflowStatus} recruiter=${after?.assignedRecruiter} paperwork=${after?.paperworkStatus}`,
        blockers: ["post_write_verify"],
      });
      stoppedEarly = true;
      stopReason = `Post-write verify failed for ${member.candidateId}`;
      break;
    }

    successful += 1;
    attempts.push({
      candidateId: member.candidateId,
      ok: true,
      status: "approved",
      correlationId,
      idempotencyKey: member.idempotencyKey,
      auditId,
      p186Observed,
      previousWorkflowStatus: wf!.workflowStatus,
      resultingWorkflowStatus: after!.workflowStatus,
      recommendedStagePreserved,
      recruiterPreserved,
      paperworkCreated: false,
      dropboxSignSends: 0,
      melExports: 0,
      detail: "Operator Approved persisted; no paperwork/P184/MEL",
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
    duplicateApprovals,
    paperworkCreated: 0,
    dropboxSignSends: 0,
    melExports: 0,
    stoppedEarly,
    stopReason,
    attempts,
  };
}
