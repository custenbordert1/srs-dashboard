import type { BreezyJob } from "@/lib/breezy-api";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import {
  buildPaperworkSendDecisions,
} from "@/lib/autonomous-paperwork-send-engine/build-paperwork-send-eligibility";
import {
  canLiveSendPaperwork,
  loadP84FeatureFlags,
} from "@/lib/autonomous-paperwork-send-engine/feature-flags-store";
import { prepareOnboardingSend } from "@/lib/autonomous-paperwork-send-engine/prepare-onboarding-send";
import { buildPaperworkRetryPlan } from "@/lib/autonomous-paperwork-send-engine/retry-engine";
import { runSignatureMonitoring } from "@/lib/autonomous-paperwork-send-engine/run-signature-monitoring";
import {
  P84_SOURCE_PHASE,
  type PaperworkSendRunResult,
} from "@/lib/autonomous-paperwork-send-engine/types";
import {
  executeOnboardingSend,
  type ExecuteOnboardingSendDeps,
} from "@/lib/candidate-onboarding-send-queue/execute-onboarding-send";
import { transitionOnboardingRecordStatus } from "@/lib/candidate-onboarding-send-queue/send-queue-onboarding-updates";
import { loadOnboardingSendQueueConfig } from "@/lib/candidate-onboarding-send-queue/send-queue-config-store";
import {
  recordCandidatePaperworkFailed,
  upsertCandidateWorkflow,
} from "@/lib/candidate-workflow-store";
import {
  appendPaperworkSendAuditEvent,
  buildPaperworkSendAuditEventId,
} from "@/lib/autonomous-paperwork-send-engine/audit-log-store";

async function auditSendEvent(input: {
  candidateId: string;
  previousStatus: string;
  newStatus: string;
  reason: string;
  simulated: boolean;
  packetId?: string;
  signatureRequestId?: string;
  retryCount?: number;
  error?: string;
  referenceMs?: number;
}): Promise<void> {
  const at = new Date(input.referenceMs ?? Date.now()).toISOString();
  await appendPaperworkSendAuditEvent({
    id: buildPaperworkSendAuditEventId(Date.parse(at), input.candidateId),
    at,
    candidateId: input.candidateId,
    phase: P84_SOURCE_PHASE,
    previousStatus: input.previousStatus,
    newStatus: input.newStatus,
    reason: input.reason,
    packetId: input.packetId,
    signatureRequestId: input.signatureRequestId,
    retryCount: input.retryCount,
    error: input.error,
    simulated: input.simulated,
  });
}

async function createRecruiterFollowUp(input: {
  candidateId: string;
  error: string;
  byUserId?: string;
}): Promise<void> {
  await upsertCandidateWorkflow({
    candidateId: input.candidateId,
    requiredAction: `Follow up — automated paperwork send failed: ${input.error}`,
    actionType: "follow-up",
    actionPriority: "high",
    actionReason: "P84 paperwork send exhausted retries — recruiter follow-up required.",
    note: `P84 send failure: ${input.error}`,
    audit: { action: "p84_paperwork_send_failed", byUserId: input.byUserId },
  });
}

export async function runAutonomousPaperworkSend(input: {
  candidates: ScoredCandidateWorkflowRow[];
  onboardingByCandidateId: Map<string, CandidateOnboardingRecord>;
  jobsByPositionId: Map<string, BreezyJob>;
  orchestratorRunId?: string;
  byUserId?: string;
  sendDeps?: ExecuteOnboardingSendDeps;
}): Promise<PaperworkSendRunResult> {
  const flags = await loadP84FeatureFlags();
  const queueConfig = await loadOnboardingSendQueueConfig();
  const errors: string[] = [];
  const warnings: string[] = [];
  const result: PaperworkSendRunResult = {
    evaluated: 0,
    eligible: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    retriesScheduled: 0,
    signaturesSynced: 0,
    readyForWork: 0,
    errors,
    warnings,
  };

  if (!flags.enabled) {
    warnings.push("P84 paperwork send skipped — disabled in feature flags.");
    return result;
  }

  const eligibilityResults = buildPaperworkSendDecisions(input.candidates, {
    onboardingByCandidateId: input.onboardingByCandidateId,
    jobsByPositionId: input.jobsByPositionId,
  });
  result.evaluated = eligibilityResults.length;

  const liveSend = canLiveSendPaperwork(flags);
  let sendsThisRun = 0;

  for (const eligibility of eligibilityResults) {
    const row = input.candidates.find((candidate) => candidate.candidateId === eligibility.candidateId);
    if (!row) {
      result.skipped += 1;
      continue;
    }

    if (!eligibility.eligible || !eligibility.templateKey) {
      result.skipped += 1;
      continue;
    }

    result.eligible += 1;

    if (sendsThisRun >= flags.maxSendsPerRun) {
      result.skipped += 1;
      warnings.push(`P84 send batch cap (${flags.maxSendsPerRun}) reached.`);
      continue;
    }

    const previousStatus = row.workflowStatus;
    const onboarding = input.onboardingByCandidateId.get(row.candidateId) ?? null;

    if (!liveSend) {
      await auditSendEvent({
        candidateId: row.candidateId,
        previousStatus,
        newStatus: previousStatus,
        reason: `Eligible for send — simulated (${eligibility.blockingReasons.length === 0 ? "all gates passed" : eligibility.blockingReasons.join("; ")})`,
        simulated: true,
        packetId: onboarding?.onboardingId,
        retryCount: onboarding?.retryCount ?? 0,
      });
      result.skipped += 1;
      continue;
    }

    if (flags.requireApproval) {
      result.skipped += 1;
      warnings.push(`P84 requires approval — skipped live send for ${row.candidateId}.`);
      continue;
    }

    const prepared = await prepareOnboardingSend({
      candidateId: row.candidateId,
      templateKey: eligibility.templateKey,
      orchestratorRunId: input.orchestratorRunId,
      actionType: row.actionType ?? undefined,
    });

    const sendingAt = new Date().toISOString();
    await transitionOnboardingRecordStatus({
      onboardingId: prepared.onboardingId,
      status: "sending",
      detail: "P84 autonomous send started",
      now: sendingAt,
      patch: { lastSendAttemptAt: sendingAt },
    });

    const candidateName = `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim() || row.email || "Candidate";
    const sendResult = await executeOnboardingSend(
      {
        candidateId: row.candidateId,
        candidateName,
        candidateEmail: row.email ?? "",
        templateKey: eligibility.templateKey,
        byUserId: input.byUserId,
        recordWorkflowFailureOnError: false,
        inFlightOnboardingId: prepared.onboardingId,
      },
      input.sendDeps,
    );

    if (sendResult.ok) {
      sendsThisRun += 1;
      result.sent += 1;
      await upsertCandidateWorkflow({
        candidateId: row.candidateId,
        actionType: "await-signature",
        requiredAction: "Paperwork sent — awaiting signature.",
        actionReason: "P84 autonomous send completed.",
        audit: { action: "p84_paperwork_sent", byUserId: input.byUserId },
      });
      await auditSendEvent({
        candidateId: row.candidateId,
        previousStatus,
        newStatus: "Paperwork Sent",
        reason: "Autonomous paperwork send succeeded",
        simulated: false,
        packetId: prepared.onboardingId,
        signatureRequestId: sendResult.signatureRequestId,
        retryCount: prepared.retryCount,
      });
      continue;
    }

    const attemptNumber = prepared.retryCount + 1;
    const retryPlan = buildPaperworkRetryPlan({
      attemptNumber,
      maxAttempts: queueConfig.maxRetries,
      transient: sendResult.transient,
      baseBackoffMs: queueConfig.retryBackoffBaseMs,
    });

    if (retryPlan.shouldRetry && retryPlan.nextRetryAt) {
      result.retriesScheduled += 1;
      await transitionOnboardingRecordStatus({
        onboardingId: prepared.onboardingId,
        status: "retry_scheduled",
        detail: retryPlan.label,
        patch: {
          retryCount: attemptNumber,
          failureReason: sendResult.error,
          nextRetryAt: retryPlan.nextRetryAt,
          lastSendAttemptAt: new Date().toISOString(),
        },
      });
      await auditSendEvent({
        candidateId: row.candidateId,
        previousStatus,
        newStatus: previousStatus,
        reason: retryPlan.label,
        simulated: false,
        packetId: prepared.onboardingId,
        retryCount: attemptNumber,
        error: sendResult.error,
      });
      continue;
    }

    result.failed += 1;
    errors.push(`${row.candidateId}: ${sendResult.error}`);
    await transitionOnboardingRecordStatus({
      onboardingId: prepared.onboardingId,
      status: "failed",
      detail: sendResult.error,
      patch: {
        failureReason: sendResult.error,
        failedAt: new Date().toISOString(),
        lastSendAttemptAt: new Date().toISOString(),
        nextRetryAt: undefined,
      },
    });
    await recordCandidatePaperworkFailed({
      candidateId: row.candidateId,
      error: sendResult.error,
      byUserId: input.byUserId,
    });
    await createRecruiterFollowUp({
      candidateId: row.candidateId,
      error: sendResult.error,
      byUserId: input.byUserId,
    });
    await auditSendEvent({
      candidateId: row.candidateId,
      previousStatus,
      newStatus: "Paperwork Needed",
      reason: "Autonomous paperwork send failed — recruiter follow-up created",
      simulated: false,
      packetId: prepared.onboardingId,
      retryCount: attemptNumber,
      error: sendResult.error,
    });
  }

  if (flags.monitorSignatures) {
    const monitoring = await runSignatureMonitoring({
      candidates: input.candidates,
      orchestratorRunId: input.orchestratorRunId,
      byUserId: input.byUserId,
    });
    result.signaturesSynced = monitoring.synced;
    result.readyForWork = monitoring.readyForMel;
    if (monitoring.errors.length > 0) errors.push(...monitoring.errors);
  }

  return result;
}

export function countEligiblePaperworkSends(input: {
  candidates: ScoredCandidateWorkflowRow[];
  onboardingByCandidateId: Map<string, CandidateOnboardingRecord>;
  jobsByPositionId: Map<string, BreezyJob>;
}): number {
  return buildPaperworkSendDecisions(input.candidates, {
    onboardingByCandidateId: input.onboardingByCandidateId,
    jobsByPositionId: input.jobsByPositionId,
  }).filter((entry) => entry.eligible).length;
}

export async function estimateImmediatePaperworkSends(): Promise<{
  count: number;
  reason: string | null;
}> {
  try {
    const { fetchBreezyJobs } = await import("@/lib/breezy-api");
    const { buildScoredWorkflowRow } = await import("@/lib/build-candidate-workflow-row");
    const { isUnassignedRecruiter } = await import("@/lib/candidate-action-queue");
    const { filterMtdCandidates } = await import("@/lib/candidate-ingestion/mtd-candidates");
    const { listIngestedCandidates, readIngestionStore } = await import(
      "@/lib/candidate-ingestion/ingestion-store"
    );
    const { getCandidateWorkflowBundle } = await import("@/lib/candidate-workflow-store");
    const { listAllCandidateOnboardingRecords } = await import(
      "@/lib/candidate-onboarding-engine/onboarding-record-store"
  );

    const store = await readIngestionStore();
    const mtdCandidates = filterMtdCandidates(listIngestedCandidates(store));
    if (mtdCandidates.length === 0) {
      return { count: 0, reason: "No MTD candidates in ingestion store." };
    }

    const bundle = await getCandidateWorkflowBundle();
    const jobsResult = await fetchBreezyJobs("published");
    const jobs = jobsResult.ok ? jobsResult.jobs : [];
    const jobsByPositionId = new Map(jobs.map((job) => [job.jobId, job]));
    const onboardingRecords = await listAllCandidateOnboardingRecords();
    const onboardingByCandidateId = new Map(
      onboardingRecords.map((record) => [record.candidateId, record] as const),
    );

    const assignedMtd = mtdCandidates.filter((candidate) => {
      const workflow = bundle.workflows[candidate.candidateId];
      return workflow && !isUnassignedRecruiter(workflow.assignedRecruiter);
    });

    const scored = assignedMtd.map((candidate) =>
      buildScoredWorkflowRow(candidate, bundle.workflows[candidate.candidateId], {
        job: jobsByPositionId.get(candidate.positionId),
      }),
    );

    const count = countEligiblePaperworkSends({
      candidates: scored,
      onboardingByCandidateId,
      jobsByPositionId,
    });
    return { count, reason: null };
  } catch (error) {
    return {
      count: 0,
      reason: error instanceof Error ? error.message : "Failed to estimate immediate sends.",
    };
  }
}
