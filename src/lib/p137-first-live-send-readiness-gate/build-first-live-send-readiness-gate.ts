import { DEFAULT_PAPERWORK_BY_GRADE } from "@/lib/candidate-onboarding-engine/paperwork-grade-policy";
import { validateCohortEmail } from "@/lib/test-cohort-validation/validate-cohort-contact";
import { buildApprovalDecisionsFromContext } from "@/lib/autonomous-paperwork-approval-engine/build-approval-report";
import type { CandidateApprovalRecord } from "@/lib/autonomous-paperwork-approval-engine/types";
import { evaluateCandidateEligibility } from "@/lib/autonomous-paperwork-orchestrator/evaluate-eligibility";
import { loadPaperworkCandidates, type LoadedPaperworkCandidates } from "@/lib/autonomous-paperwork-orchestrator/load-candidates";
import { p100AuditLogPath } from "@/lib/controlled-live-send/controlled-live-send-store";
import { buildPilotSendPacketPreview } from "@/lib/p122-controlled-live-paperwork-pilot/build-send-packet-preview";
import { buildSystemPilotSafetyChecks } from "@/lib/p122-controlled-live-paperwork-pilot/build-pilot-safety-gates";
import { evaluatePilotCandidate } from "@/lib/p122-controlled-live-paperwork-pilot/evaluate-pilot-candidate";
import { loadPilotConfig } from "@/lib/p122-controlled-live-paperwork-pilot/pilot-config";
import { loadPilotSendRegistry } from "@/lib/p122-controlled-live-paperwork-pilot/pilot-store";
import { P122_CONFIRMATION_PHRASE } from "@/lib/p122-controlled-live-paperwork-pilot/types";
import { resolveApprovedMapping } from "@/lib/p110-approved-mapping-integration/resolve-approved-mapping";
import { loadSchedulerState } from "@/lib/p136-autonomous-paperwork-scheduler/scheduler-store";
import {
  hasCleanAuditHistory,
  loadP100AuditEntries,
} from "@/lib/p137-first-live-send-readiness-gate/load-p100-audit-entries";
import type {
  FirstLiveSendReadinessGateReport,
  ReadinessGateCandidate,
  ReadinessSafetyChecklist,
} from "@/lib/p137-first-live-send-readiness-gate/types";
import { P137_GATE_MODE, P137_SOURCE_PHASE } from "@/lib/p137-first-live-send-readiness-gate/types";

function rankAutoApprovedCandidate(input: {
  approval: CandidateApprovalRecord;
  pilotEvaluation: ReturnType<typeof evaluatePilotCandidate>;
  auditClean: boolean;
}): number {
  const confirmations = buildConfirmations({
    approval: input.approval,
    pilotEvaluation: input.pilotEvaluation,
    auditClean: input.auditClean,
  });

  let score = input.approval.approvalScore;

  if (confirmations.validEmail) score += 100;
  if (confirmations.noDuplicateRisk) score += 100;
  if (confirmations.noAlreadySent) score += 100;
  if (confirmations.publishedJobOrApprovedMapping) score += 150;
  if (confirmations.templateAvailable) score += 50;
  if (confirmations.cleanAuditHistory) score += 75;

  if (input.pilotEvaluation.mappingSource === "native_published_job") score += 25;
  if (input.pilotEvaluation.status === "ready_to_send") score += 200;

  if (!confirmations.validEmail) score -= 10_000;
  if (!confirmations.noDuplicateRisk) score -= 10_000;
  if (!confirmations.noAlreadySent) score -= 10_000;
  if (!confirmations.publishedJobOrApprovedMapping) score -= 5000;
  if (!confirmations.templateAvailable) score -= 2500;
  if (!confirmations.cleanAuditHistory) score -= 1000;

  return score;
}

function buildConfirmations(input: {
  approval: CandidateApprovalRecord;
  pilotEvaluation: ReturnType<typeof evaluatePilotCandidate>;
  auditClean: boolean;
}): ReadinessGateCandidate["confirmations"] {
  return {
    validEmail:
      input.pilotEvaluation.safetyChecks.find((check) => check.id === "valid_email")?.passed === true ||
      validateCohortEmail(input.approval.email).valid,
    noDuplicateRisk:
      input.pilotEvaluation.safetyChecks.find((check) => check.id === "no_duplicate_risk")?.passed === true,
    noAlreadySent:
      input.pilotEvaluation.safetyChecks.find((check) => check.id === "not_already_sent")?.passed === true,
    publishedJobOrApprovedMapping:
      input.pilotEvaluation.safetyChecks.find((check) => check.id === "approved_mapping_or_native_project")
        ?.passed === true,
    templateAvailable: Boolean(input.pilotEvaluation.templateKey),
    cleanAuditHistory: input.auditClean,
  };
}

function buildCandidateEntry(input: {
  approval: CandidateApprovalRecord;
  pilotEvaluation: ReturnType<typeof evaluatePilotCandidate>;
  eligibilityStatus: string;
  rank: number;
  safetyRankScore: number;
  auditClean: boolean;
  reason: string;
}): ReadinessGateCandidate {
  return {
    candidateId: input.approval.candidateId,
    candidateName: input.approval.candidateName,
    email: input.approval.email,
    approvalDecision: input.approval.approvalDecision,
    approvalScore: input.approval.approvalScore,
    eligibilityStatus: input.eligibilityStatus,
    positionTitle: input.pilotEvaluation.projectLabel,
    projectLabel: input.pilotEvaluation.projectLabel,
    mappingSource: input.pilotEvaluation.mappingSource,
    templateKey: input.pilotEvaluation.templateKey,
    selectionRank: input.rank,
    selectionReason: input.reason,
    safetyRankScore: input.safetyRankScore,
    confirmations: buildConfirmations({
      approval: input.approval,
      pilotEvaluation: input.pilotEvaluation,
      auditClean: input.auditClean,
    }),
  };
}

function buildReadinessSafetyChecklist(basePilotConfig: ReturnType<typeof loadPilotConfig>): ReadinessSafetyChecklist {
  return {
    noBreezyWrites: true,
    executeOneOnly: true,
    pilotCapOne: basePilotConfig.maxSends === 1,
    operatorGoRequired: true,
    confirmationPhraseRequired: true,
    liveModeDisabledByDefault: !basePilotConfig.liveModeEnabled,
    executeBatchForbidden: true,
  };
}

export async function buildFirstLiveSendReadinessGate(input?: {
  contextOverride?: LoadedPaperworkCandidates;
}): Promise<FirstLiveSendReadinessGateReport> {
  const basePilotConfig = loadPilotConfig();
  const [context, registry, auditEntries, schedulerState] = await Promise.all([
    input?.contextOverride
      ? Promise.resolve(input.contextOverride)
      : loadPaperworkCandidates({ mtdOnly: false }),
    loadPilotSendRegistry(),
    loadP100AuditEntries(),
    loadSchedulerState(),
  ]);

  const approvalDecisions = buildApprovalDecisionsFromContext(context);
  const autoApproved = approvalDecisions.filter((decision) => decision.approvalDecision === "AUTO_APPROVED");

  const evaluated: Array<{
    approval: CandidateApprovalRecord;
    pilotEvaluation: ReturnType<typeof evaluatePilotCandidate>;
    eligibilityStatus: string;
    readyOnAllowlist: boolean;
    safetyRankScore: number;
    auditClean: boolean;
  }> = [];

  for (const approval of autoApproved) {
    const row = context.rowsByCandidateId.get(approval.candidateId) ?? null;
    const approvedMapping = resolveApprovedMapping({
      record: context.p109ByCandidate.get(approval.candidateId) ?? null,
      candidateId: approval.candidateId,
      closedPositionId: row?.positionId ?? null,
      publishedJobTitleById: context.publishedJobTitleById,
    });
    const eligibility = evaluateCandidateEligibility({
      candidateId: approval.candidateId,
      row,
      context,
      paperworkByGrade: DEFAULT_PAPERWORK_BY_GRADE,
      approvedMapping,
    });

    const previewConfig = {
      ...basePilotConfig,
      allowlist: [approval.candidateId],
    };

    const pilotEvaluation = evaluatePilotCandidate({
      candidateId: approval.candidateId,
      row,
      onboarding: context.onboardingByCandidateId.get(approval.candidateId) ?? null,
      jobsByPositionId: context.jobsByPositionId,
      closedJobsByPositionId: context.closedJobsByPositionId,
      publishedJobs: context.publishedJobs,
      paperworkByGrade: DEFAULT_PAPERWORK_BY_GRADE,
      p100SentIds: context.p100SentIds,
      pilotSentIds: context.pilotSentIds,
      approvedMapping,
      config: previewConfig,
      pilotSendCount: registry.sendCount,
    });

    const auditClean = hasCleanAuditHistory(approval.candidateId, auditEntries);

    evaluated.push({
      approval,
      pilotEvaluation,
      eligibilityStatus: eligibility.status,
      readyOnAllowlist: pilotEvaluation.status === "ready_to_send",
      safetyRankScore: rankAutoApprovedCandidate({ approval, pilotEvaluation, auditClean }),
      auditClean,
    });
  }

  const ranked = [...evaluated].sort((a, b) => b.safetyRankScore - a.safetyRankScore);

  if (ranked.length === 0) {
    throw new Error("P137 — no AUTO_APPROVED candidates available from P136 preview cohort.");
  }

  const selectedEval = ranked[0]!;
  const selectedCandidate = buildCandidateEntry({
    approval: selectedEval.approval,
    pilotEvaluation: selectedEval.pilotEvaluation,
    eligibilityStatus: selectedEval.eligibilityStatus,
    rank: 1,
    safetyRankScore: selectedEval.safetyRankScore,
    auditClean: selectedEval.auditClean,
    reason: selectedEval.readyOnAllowlist
      ? "Safest AUTO_APPROVED candidate — passes P122 gates on simulated allowlist."
      : "Highest-ranked AUTO_APPROVED candidate by safety score (preview allowlist simulation).",
  });

  const backupCandidates = ranked.slice(1, 4).map((entry, index) =>
    buildCandidateEntry({
      approval: entry.approval,
      pilotEvaluation: entry.pilotEvaluation,
      eligibilityStatus: entry.eligibilityStatus,
      rank: index + 2,
      safetyRankScore: entry.safetyRankScore,
      auditClean: entry.auditClean,
      reason: `Backup #${index + 1} — safety rank ${entry.safetyRankScore}.`,
    }),
  );

  const basePacket =
    buildPilotSendPacketPreview({
      candidate: selectedEval.pilotEvaluation,
      auditDestination: p100AuditLogPath(),
    }) ??
    (selectedCandidate.confirmations.validEmail && selectedCandidate.templateKey
      ? {
          candidateId: selectedCandidate.candidateId,
          candidateName: selectedCandidate.candidateName,
          candidateEmail: selectedCandidate.email,
          jobOrProject: selectedCandidate.projectLabel ?? "Unknown project",
          paperworkTemplate: selectedCandidate.templateKey ?? "onboarding_packet",
          safetyChecks: selectedEval.pilotEvaluation.safetyChecks,
          auditDestination: p100AuditLogPath(),
        }
      : null);

  const sendPacketPreview = basePacket
    ? {
        candidateId: basePacket.candidateId,
        candidateName: basePacket.candidateName,
        candidateEmail: basePacket.candidateEmail,
        jobOrProject: basePacket.jobOrProject,
        paperworkTemplate: basePacket.paperworkTemplate,
        approvalScore: selectedCandidate.approvalScore,
        safetyChecks: [
          ...basePacket.safetyChecks,
          {
            id: "approval_score",
            label: "Approval score",
            passed: selectedCandidate.approvalScore >= 90,
            detail: `${selectedCandidate.approvalScore} (AUTO_APPROVED threshold 90)`,
          },
        ],
        auditDestination: basePacket.auditDestination,
      }
    : null;

  const systemSafetyChecks = buildSystemPilotSafetyChecks({
    config: basePilotConfig,
    pilotSendCount: registry.sendCount,
    dryRun: true,
    confirmationPhrase: P122_CONFIRMATION_PHRASE,
  });

  const safetyChecks = [...systemSafetyChecks, ...selectedEval.pilotEvaluation.safetyChecks];

  const candidateSafetyPassed = selectedEval.pilotEvaluation.safetyChecks
    .filter((check) => check.id !== "on_allowlist")
    .every((check) => check.passed);

  const safetyChecklist = buildReadinessSafetyChecklist(basePilotConfig);

  let goNoGo: FirstLiveSendReadinessGateReport["goNoGo"] = "GO WITH CONDITIONS";
  let goNoGoReason =
    "AUTO_APPROVED candidate selected — enable pilot env vars, operator GO, and confirmation phrase before executeOne.";

  if (!candidateSafetyPassed) {
    goNoGo = "NO-GO";
    goNoGoReason = "Selected AUTO_APPROVED candidate fails one or more candidate-level safety checks.";
  } else if (
    selectedEval.readyOnAllowlist &&
    basePilotConfig.pilotEnabled &&
    basePilotConfig.liveModeEnabled &&
    basePilotConfig.operatorGo
  ) {
    goNoGo = "GO";
    goNoGoReason = "Selected AUTO_APPROVED candidate passes P122 preview gates and env locks are enabled.";
  } else if (selectedEval.readyOnAllowlist) {
    goNoGo = "GO WITH CONDITIONS";
    goNoGoReason =
      "Candidate ready on simulated allowlist — set pilot env vars and confirm operator GO before executeOne.";
  }

  const exactEnvVarsNeeded = {
    AUTONOMOUS_PAPERWORK_LIVE_PILOT_ENABLED: "true",
    AUTONOMOUS_PAPERWORK_LIVE_MODE: "true",
    AUTONOMOUS_PAPERWORK_OPERATOR_GO: "true",
    AUTONOMOUS_PAPERWORK_PILOT_ALLOWLIST: selectedCandidate.candidateId,
    AUTONOMOUS_PAPERWORK_PILOT_MAX_SENDS: "1",
  };

  const allowlistCommand = `export AUTONOMOUS_PAPERWORK_PILOT_ALLOWLIST="${selectedCandidate.candidateId}"`;
  const finalLiveCommand = `npx tsx scripts/p122-controlled-live-paperwork-pilot.ts --execute --confirm "${P122_CONFIRMATION_PHRASE}" --candidate-id ${selectedCandidate.candidateId}`;

  return {
    sourcePhase: P137_SOURCE_PHASE,
    generatedAt: new Date().toISOString(),
    mode: P137_GATE_MODE,
    p136Summary: {
      autoApprovedCount: schedulerState.lastCycleMetrics?.autoApproved ?? autoApproved.length,
      candidatesEvaluated: schedulerState.lastCycleMetrics?.candidatesEvaluated ?? context.candidateIds.length,
      schedulerLastCycleAt: schedulerState.lastCycleAt,
      readinessCount: schedulerState.lastCycleMetrics?.readinessCount ?? 0,
    },
    autoApprovedCount: autoApproved.length,
    selectedCandidate,
    backupCandidates,
    safetyChecklist,
    safetyChecks,
    sendPacketPreview,
    auditPath: p100AuditLogPath(),
    exactEnvVarsNeeded,
    allowlistCommand,
    finalLiveCommand,
    confirmationPhrase: P122_CONFIRMATION_PHRASE,
    goNoGo,
    goNoGoReason,
    executeBatchCalled: false,
    breezyWrites: false,
    liveModeEnabled: basePilotConfig.liveModeEnabled,
    paperworkSent: false,
    continuousRunnerEnabled: process.env.P125_RUNNER_CONTINUOUS_ENABLED === "true",
  };
}
