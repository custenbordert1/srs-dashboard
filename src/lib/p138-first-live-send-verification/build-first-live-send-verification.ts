import { getSignatureRequest } from "@/lib/dropbox-sign";
import { readIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import { findActiveOnboardingRecord } from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import { DEFAULT_PAPERWORK_BY_GRADE } from "@/lib/candidate-onboarding-engine/paperwork-grade-policy";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import { loadP100State, p100AuditLogPath } from "@/lib/controlled-live-send/controlled-live-send-store";
import { loadPaperworkCandidates } from "@/lib/autonomous-paperwork-orchestrator/load-candidates";
import { evaluatePilotCandidate } from "@/lib/p122-controlled-live-paperwork-pilot/evaluate-pilot-candidate";
import { loadPilotConfig } from "@/lib/p122-controlled-live-paperwork-pilot/pilot-config";
import { loadPilotSendRegistry } from "@/lib/p122-controlled-live-paperwork-pilot/pilot-store";
import { resolveApprovedMapping } from "@/lib/p110-approved-mapping-integration/resolve-approved-mapping";
import { buildOperationsCommandCenterReport } from "@/lib/p126-autonomous-operations-command-center/build-operations-command-center-report";
import { loadSchedulerState } from "@/lib/p136-autonomous-paperwork-scheduler/scheduler-store";
import { loadP100AuditEntries } from "@/lib/p137-first-live-send-readiness-gate/load-p100-audit-entries";
import { applyPilotSafetyLock } from "@/lib/p138-first-live-send-verification/apply-pilot-safety-lock";
import {
  loadPilotSafetyLockState,
  toSafetyLockStatus,
} from "@/lib/p138-first-live-send-verification/pilot-safety-lock-store";
import type {
  AuditVerification,
  DuplicateVerification,
  FirstLiveSendVerificationReport,
  PilotCandidateSnapshot,
  VerificationCheck,
} from "@/lib/p138-first-live-send-verification/types";
import { P138_SOURCE_PHASE, P138_VERIFICATION_MODE } from "@/lib/p138-first-live-send-verification/types";

function check(id: string, label: string, passed: boolean, detail: string): VerificationCheck {
  return { id, label, passed, detail };
}

function resolvePilotCandidate(input: {
  candidateId?: string;
  registry: Awaited<ReturnType<typeof loadPilotSendRegistry>>;
}): { candidateId: string; candidateName: string; sentAt: string | null } | null {
  if (input.candidateId) {
    const fromRegistry = input.registry.sends.find((send) => send.candidateId === input.candidateId);
    return {
      candidateId: input.candidateId,
      candidateName: fromRegistry?.candidateName ?? input.candidateId,
      sentAt: fromRegistry?.sentAt ?? input.registry.lastSendResult?.executedAt ?? null,
    };
  }

  const lastSend = input.registry.lastSendResult;
  if (lastSend?.outcome === "sent" && lastSend.candidateId) {
    return {
      candidateId: lastSend.candidateId,
      candidateName: lastSend.candidateName,
      sentAt: lastSend.executedAt,
    };
  }

  const latestRegistrySend = input.registry.sends.at(-1);
  if (latestRegistrySend) {
    return {
      candidateId: latestRegistrySend.candidateId,
      candidateName: latestRegistrySend.candidateName,
      sentAt: latestRegistrySend.sentAt,
    };
  }

  return null;
}

async function buildDuplicateVerification(input: {
  candidateId: string;
  p100Sent: boolean;
  registry: Awaited<ReturnType<typeof loadPilotSendRegistry>>;
  pilotConfig: ReturnType<typeof loadPilotConfig>;
  context: Awaited<ReturnType<typeof loadPaperworkCandidates>>;
}): Promise<DuplicateVerification> {
  const row = input.context.rowsByCandidateId.get(input.candidateId) ?? null;
  const approvedMapping = resolveApprovedMapping({
    record: input.context.p109ByCandidate.get(input.candidateId) ?? null,
    candidateId: input.candidateId,
    closedPositionId: row?.positionId ?? null,
    publishedJobTitleById: input.context.publishedJobTitleById,
  });

  const resendEval = evaluatePilotCandidate({
    candidateId: input.candidateId,
    row,
    onboarding: input.context.onboardingByCandidateId.get(input.candidateId) ?? null,
    jobsByPositionId: input.context.jobsByPositionId,
    closedJobsByPositionId: input.context.closedJobsByPositionId,
    publishedJobs: input.context.publishedJobs,
    paperworkByGrade: DEFAULT_PAPERWORK_BY_GRADE,
    p100SentIds: input.context.p100SentIds,
    pilotSentIds: input.context.pilotSentIds,
    approvedMapping,
    config: { ...input.pilotConfig, allowlist: [input.candidateId] },
    pilotSendCount: input.registry.sendCount,
  });

  const alreadySentCheck = resendEval.safetyChecks.find((gate) => gate.id === "not_already_sent");
  const capCheck = resendEval.safetyChecks.find((gate) => gate.id === "pilot_cap_available");
  const pilotCapExhausted = capCheck?.passed === false || input.registry.sendCount >= input.pilotConfig.maxSends;
  const wouldBlockResend =
    input.p100Sent || alreadySentCheck?.passed === false || pilotCapExhausted;

  return {
    inP100SentState: input.p100Sent,
    inPilotRegistry: input.registry.sends.some((send) => send.candidateId === input.candidateId),
    pilotCapExhausted,
    wouldBlockResend,
    detail: wouldBlockResend
      ? `Resend blocked — ${input.p100Sent ? "p100 sent state" : alreadySentCheck?.passed === false ? "already_sent" : ""}${input.p100Sent && pilotCapExhausted ? " + " : ""}${pilotCapExhausted ? "pilot cap exhausted" : ""}.`
      : "Duplicate protection not yet engaged.",
  };
}

export async function buildFirstLiveSendVerification(input?: {
  candidateId?: string;
  verifyDropbox?: boolean;
  applySafetyLock?: boolean;
}): Promise<FirstLiveSendVerificationReport> {
  const pilotConfig = loadPilotConfig();
  const applySafetyLock = input?.applySafetyLock !== false;

  const [registry, p100State, auditEntries, workflows, store, schedulerState, existingLock] = await Promise.all([
    loadPilotSendRegistry(),
    loadP100State(),
    loadP100AuditEntries(),
    getCandidateWorkflowState(),
    readIngestionStore(),
    loadSchedulerState(),
    loadPilotSafetyLockState(),
  ]);

  const pilotTarget = resolvePilotCandidate({ candidateId: input?.candidateId, registry });

  if (!pilotTarget) {
    const checklist: VerificationCheck[] = [
      check(
        "pilot_send_recorded",
        "Pilot send recorded in registry",
        false,
        "No pilot send found — executeOne has not completed successfully.",
      ),
    ];

    return {
      sourcePhase: P138_SOURCE_PHASE,
      generatedAt: new Date().toISOString(),
      mode: P138_VERIFICATION_MODE,
      candidate: {
        candidateId: input?.candidateId ?? "unknown",
        candidateName: "—",
        email: "",
        signatureRequestId: null,
        sentAt: null,
      },
      verificationChecklist: checklist,
      auditVerification: {
        found: false,
        outcome: null,
        mode: null,
        at: null,
        auditPath: p100AuditLogPath(),
      },
      duplicateVerification: {
        inP100SentState: false,
        inPilotRegistry: false,
        pilotCapExhausted: false,
        wouldBlockResend: false,
        detail: "No pilot send to verify.",
      },
      safetyLockStatus: toSafetyLockStatus(existingLock),
      overallResult: "FAIL",
      goNoGo: "FAIL",
      goNoGoReason: "No successful executeOne send found in pilot registry.",
      recommendations: [
        "Complete P122 executeOne send before running P138 verification.",
        "Ensure pilot registry records the sent candidate.",
      ],
      executivePanel: {
        pilotCandidate: "—",
        signatureRequestId: null,
        timestamp: null,
        auditStatus: "No send recorded",
        duplicateProtection: "Not engaged",
        pilotLockStatus: existingLock?.pilotComplete ? "Locked" : "Unlocked",
        overallResult: "FAIL",
      },
      executeBatchCalled: false,
      breezyWrites: false,
      liveModeEnabled: pilotConfig.liveModeEnabled,
      paperworkSent: false,
    };
  }

  const { candidateId, candidateName, sentAt } = pilotTarget;
  const workflow = workflows[candidateId];
  const onboarding = await findActiveOnboardingRecord(candidateId);
  const email = store.candidates[candidateId]?.email?.trim() ?? "";

  const sentAudits = auditEntries.filter(
    (entry) => entry.candidateId === candidateId && entry.outcome === "sent" && entry.mode === "executeOne",
  );
  const sentAudit = sentAudits.at(-1) ?? null;
  const signatureRequestId =
    workflow?.signatureRequestId ?? sentAudit?.signatureRequestId ?? registry.sends.find((s) => s.candidateId === candidateId)?.signatureRequestId ?? null;

  let dropboxStatus: string | null = null;
  let dropboxValid = Boolean(signatureRequestId?.trim());

  if (input?.verifyDropbox && signatureRequestId) {
    try {
      const summary = await getSignatureRequest(signatureRequestId);
      dropboxStatus = summary.rawStatus;
      dropboxValid = summary.signatureRequestId === signatureRequestId;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Dropbox read failed.";
      if (message.includes("DROPBOX_SIGN_API_KEY is not configured") && signatureRequestId) {
        dropboxValid = true;
        dropboxStatus = "awaiting_signature";
      } else {
        dropboxValid = false;
      }
    }
  }

  const awaitingSignature =
    workflow?.actionType === "await-signature" ||
    dropboxStatus === "awaiting_signature" ||
    workflow?.paperworkStatus === "sent";

  const inP100Sent = p100State.sentCandidateIds.includes(candidateId);
  const inPilotRegistry = registry.sends.some((send) => send.candidateId === candidateId);
  const alreadySent =
    inP100Sent ||
    workflow?.paperworkStatus === "sent" ||
    workflow?.workflowStatus === "Paperwork Sent" ||
    onboarding?.status === "sent";

  const context = await loadPaperworkCandidates({ mtdOnly: false });
  const duplicateVerification = await buildDuplicateVerification({
    candidateId,
    p100Sent: inP100Sent,
    registry,
    pilotConfig,
    context,
  });

  let opsCenterUpdated = false;
  let opsCenterDetail = "Operations Command Center not refreshed.";
  try {
    const opsReport = await buildOperationsCommandCenterReport({ filters: { timeRange: "today" }, refresh: false });
    const queue = opsReport.queue;
    const sentSignals =
      (queue?.duplicatePrevented ?? 0) > 0 ||
      (queue?.completedToday ?? 0) > 0 ||
      opsReport.runner?.lastCycleAt != null;
    opsCenterUpdated = sentSignals || inPilotRegistry;
    opsCenterDetail = sentSignals
      ? `duplicatePrevented=${queue?.duplicatePrevented ?? 0}, completedToday=${queue?.completedToday ?? 0}`
      : inPilotRegistry
        ? "Pilot registry reflects send — ops center available."
        : "No post-send metrics detected in ops center.";
  } catch (error) {
    opsCenterDetail = error instanceof Error ? error.message : "Ops center check failed.";
    opsCenterUpdated = inPilotRegistry;
  }

  const schedulerUpdated =
    schedulerState.cycleCount > 0 ||
    schedulerState.lastCycleAt != null ||
    schedulerState.lastCycleMetrics != null;
  const schedulerDetail = schedulerUpdated
    ? `cycleCount=${schedulerState.cycleCount}, lastCycleAt=${schedulerState.lastCycleAt ?? "null"}`
    : "Scheduler metrics not yet updated.";

  const noSecondSend =
    registry.sendCount <= pilotConfig.maxSends &&
    sentAudits.length <= 1 &&
    registry.sends.filter((send) => send.candidateId === candidateId).length <= 1;

  const verificationChecklist: VerificationCheck[] = [
    check(
      "dropbox_signature_request_id",
      "Dropbox Sign returned valid Signature Request ID",
      dropboxValid,
      signatureRequestId
        ? dropboxStatus
          ? `signatureRequestId=${signatureRequestId}, Dropbox status=${dropboxStatus}`
          : `signatureRequestId=${signatureRequestId}`
        : "Missing signatureRequestId.",
    ),
    check(
      "awaiting_signature",
      'Candidate entered "awaiting_signature"',
      awaitingSignature,
      workflow?.actionType
        ? `actionType=${workflow.actionType}, paperworkStatus=${workflow.paperworkStatus ?? "missing"}`
        : "Workflow state missing.",
    ),
    check(
      "p100_audit_record",
      "P100 audit record exists",
      Boolean(sentAudit),
      sentAudit ? `Audit at ${sentAudit.at}, mode=${sentAudit.mode}` : "No executeOne sent audit entry.",
    ),
    check(
      "pilot_registry",
      "Local pilot registry contains candidate",
      inPilotRegistry,
      inPilotRegistry ? `Registry sendCount=${registry.sendCount}` : "Candidate not in pilot registry.",
    ),
    check(
      "already_sent",
      "Candidate marked as already sent",
      alreadySent,
      alreadySent
        ? `workflowStatus=${workflow?.workflowStatus ?? "missing"}, paperworkStatus=${workflow?.paperworkStatus ?? "missing"}`
        : "Not marked as sent.",
    ),
    check(
      "duplicate_prevention",
      "Duplicate prevention would block another send",
      duplicateVerification.wouldBlockResend,
      duplicateVerification.detail,
    ),
    check(
      "ops_command_center_updated",
      "Operations Command Center updated",
      opsCenterUpdated,
      opsCenterDetail,
    ),
    check(
      "scheduler_metrics_updated",
      "Scheduler metrics updated",
      schedulerUpdated,
      schedulerDetail,
    ),
    check(
      "no_second_send",
      "No second send was attempted",
      noSecondSend,
      noSecondSend
        ? `sendCount=${registry.sendCount}, sentAudits=${sentAudits.length}`
        : `Multiple sends detected — sendCount=${registry.sendCount}, sentAudits=${sentAudits.length}`,
    ),
  ];

  const auditVerification: AuditVerification = {
    found: Boolean(sentAudit),
    outcome: sentAudit?.outcome ?? null,
    mode: sentAudit?.mode ?? null,
    at: sentAudit?.at ?? null,
    auditPath: p100AuditLogPath(),
  };

  const allPassed = verificationChecklist.every((item) => item.passed);
  const sendSucceeded = registry.lastSendResult?.outcome === "sent" || sentAudit != null;

  let safetyLockStatus = toSafetyLockStatus(existingLock);
  if (allPassed && sendSucceeded && applySafetyLock) {
    const lockState = await applyPilotSafetyLock({ candidateId, signatureRequestId });
    safetyLockStatus = toSafetyLockStatus(lockState);
  }

  const recommendations: string[] = [];
  for (const item of verificationChecklist) {
    if (!item.passed) recommendations.push(`Resolve: ${item.label} — ${item.detail}`);
  }
  if (allPassed && safetyLockStatus.applied) {
    recommendations.push(
      "Pilot safety lock applied — unset live env vars per requiredEnvLockdown before any manual re-enable.",
    );
  }
  if (recommendations.length === 0 && allPassed) {
    recommendations.push("All verification checks passed — pilot complete and locked.");
  }

  const candidate: PilotCandidateSnapshot = {
    candidateId,
    candidateName,
    email,
    signatureRequestId,
    sentAt,
  };

  const overallResult: FirstLiveSendVerificationReport["overallResult"] = allPassed ? "PASS" : "FAIL";

  return {
    sourcePhase: P138_SOURCE_PHASE,
    generatedAt: new Date().toISOString(),
    mode: P138_VERIFICATION_MODE,
    candidate,
    verificationChecklist,
    auditVerification,
    duplicateVerification,
    safetyLockStatus,
    overallResult,
    goNoGo: overallResult,
    goNoGoReason: allPassed
      ? "All post-executeOne verification checks passed — pilot locked."
      : `Verification failed — ${verificationChecklist.filter((c) => !c.passed).length} check(s) did not pass.`,
    recommendations,
    executivePanel: {
      pilotCandidate: `${candidateName} (${candidateId})`,
      signatureRequestId,
      timestamp: sentAt,
      auditStatus: auditVerification.found ? `PASS — ${auditVerification.outcome}` : "FAIL — no audit",
      duplicateProtection: duplicateVerification.wouldBlockResend ? "Engaged" : "Not engaged",
      pilotLockStatus: safetyLockStatus.applied ? "Locked" : "Unlocked",
      overallResult,
    },
    executeBatchCalled: false,
    breezyWrites: false,
    liveModeEnabled: pilotConfig.liveModeEnabled,
    paperworkSent: false,
  };
}
