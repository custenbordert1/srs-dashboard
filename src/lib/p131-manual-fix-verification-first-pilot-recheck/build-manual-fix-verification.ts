import { DEFAULT_PAPERWORK_BY_GRADE } from "@/lib/candidate-onboarding-engine/paperwork-grade-policy";
import { isAutoApprovedForSendQueue } from "@/lib/autonomous-paperwork-approval-engine/evaluate-approval-decision";
import { evaluateOrchestratorApproval } from "@/lib/autonomous-paperwork-orchestrator/evaluate-approvals";
import { evaluateCandidateEligibility } from "@/lib/autonomous-paperwork-orchestrator/evaluate-eligibility";
import { loadPaperworkCandidates, type LoadedPaperworkCandidates } from "@/lib/autonomous-paperwork-orchestrator/load-candidates";
import { buildSystemPilotSafetyChecks } from "@/lib/p122-controlled-live-paperwork-pilot/build-pilot-safety-gates";
import { evaluatePilotCandidate } from "@/lib/p122-controlled-live-paperwork-pilot/evaluate-pilot-candidate";
import { loadPilotConfig } from "@/lib/p122-controlled-live-paperwork-pilot/pilot-config";
import { loadPilotSendRegistry } from "@/lib/p122-controlled-live-paperwork-pilot/pilot-store";
import { P122_CONFIRMATION_PHRASE } from "@/lib/p122-controlled-live-paperwork-pilot/types";
import { buildFirstLivePilotCandidateSelection } from "@/lib/p128-first-live-pilot-candidate-selection/build-first-live-pilot-candidate-selection";
import { buildFirstAutoApprovedCandidateFixPlan } from "@/lib/p130-first-auto-approved-candidate-fix-plan/build-first-auto-approved-candidate-fix-plan";
import { resolveApprovedMapping } from "@/lib/p110-approved-mapping-integration/resolve-approved-mapping";
import type {
  ManualFixVerificationReport,
  VerificationCheck,
} from "@/lib/p131-manual-fix-verification-first-pilot-recheck/types";
import {
  P131_RECOMMENDED_JOB_ID,
  P131_SOURCE_PHASE,
  P131_TARGET_CANDIDATE_ID,
  P131_TARGET_CANDIDATE_NAME,
  P131_VERIFICATION_MODE,
} from "@/lib/p131-manual-fix-verification-first-pilot-recheck/types";

const MAPPING_CONFIDENCE_MIN = 80;

function enrichContextWithApprovedMappings(context: LoadedPaperworkCandidates): LoadedPaperworkCandidates {
  const approvedMappingsByCandidate = new Map(context.approvedMappingsByCandidate);
  for (const candidateId of context.candidateIds) {
    if (approvedMappingsByCandidate.has(candidateId)) continue;
    const row = context.rowsByCandidateId.get(candidateId) ?? null;
    const resolved = resolveApprovedMapping({
      record: context.p109ByCandidate.get(candidateId) ?? null,
      candidateId,
      closedPositionId: row?.positionId ?? null,
      publishedJobTitleById: context.publishedJobTitleById,
    });
    if (resolved) approvedMappingsByCandidate.set(candidateId, resolved);
  }
  return { ...context, approvedMappingsByCandidate };
}

function buildVerificationChecks(input: {
  currentState: Awaited<ReturnType<typeof buildFirstAutoApprovedCandidateFixPlan>>["currentState"];
  recommendedJobPublished: boolean;
  recommendedJobTitle: string | null;
}): VerificationCheck[] {
  const { currentState: state } = input;
  return [
    {
      id: "questionnaire_resume_complete",
      label: "Questionnaire / resume complete",
      passed: state.questionnaireResume.complete,
      expected: "hasResume=true, paperworkReady=true",
      actual: `hasResume=${state.questionnaireResume.hasResume}, paperworkReady=${state.questionnaireResume.paperworkReady}`,
    },
    {
      id: "recruiter_assigned",
      label: "Recruiter assigned",
      passed: state.recruiterAssignment.assigned,
      expected: "Named recruiter assigned",
      actual: state.recruiterAssignment.assigned
        ? (state.recruiterAssignment.recruiter ?? "assigned")
        : "Unassigned",
    },
    {
      id: "mapping_confidence_80",
      label: "P109 mapping confidence ≥80%",
      passed: state.mappingConfidence >= MAPPING_CONFIDENCE_MIN,
      expected: "≥80%",
      actual: `${state.mappingConfidence}%`,
    },
    {
      id: "recommended_job_published",
      label: `Recommended job ${P131_RECOMMENDED_JOB_ID} published`,
      passed: input.recommendedJobPublished,
      expected: `Published Breezy job ${P131_RECOMMENDED_JOB_ID}`,
      actual: input.recommendedJobPublished
        ? (input.recommendedJobTitle ?? P131_RECOMMENDED_JOB_ID)
        : "Not found in published jobs",
    },
    {
      id: "template_available",
      label: "Template available",
      passed: state.template.available,
      expected: "Paperwork template assigned",
      actual: state.template.templateKey ?? "none",
    },
    {
      id: "no_duplicate_risk",
      label: "No duplicate risk",
      passed: !state.duplicateStatus.isDuplicate,
      expected: "No duplicate detected",
      actual: state.duplicateStatus.detail,
    },
    {
      id: "no_already_sent",
      label: "No already_sent record",
      passed: !state.alreadySentStatus.alreadySent,
      expected: "Paperwork not previously sent",
      actual: state.alreadySentStatus.detail,
    },
    {
      id: "valid_email",
      label: "Valid email",
      passed: state.emailValid,
      expected: "Valid cohort email",
      actual: state.email || "missing",
    },
  ];
}

export async function buildManualFixVerificationFirstPilotRecheck(input?: {
  candidateId?: string;
  contextOverride?: LoadedPaperworkCandidates;
  skipP127Drill?: boolean;
}): Promise<ManualFixVerificationReport> {
  const candidateId = input?.candidateId ?? P131_TARGET_CANDIDATE_ID;
  const basePilotConfig = loadPilotConfig();
  const loadedContext = input?.contextOverride ?? (await loadPaperworkCandidates({ mtdOnly: false }));
  const context = enrichContextWithApprovedMappings(loadedContext);
  const registry = await loadPilotSendRegistry();

  const fixPlan = await buildFirstAutoApprovedCandidateFixPlan({
    candidateId,
    contextOverride: context,
  });
  const currentState = fixPlan.currentState;

  const recommendedJob = context.publishedJobs.find((job) => job.jobId === P131_RECOMMENDED_JOB_ID);
  const recommendedJobPublished = Boolean(recommendedJob && recommendedJob.status === "published");

  const checks = buildVerificationChecks({
    currentState,
    recommendedJobPublished,
    recommendedJobTitle: recommendedJob?.name ?? null,
  });
  const passedCount = checks.filter((check) => check.passed).length;
  const failedCount = checks.length - passedCount;
  const allPassed = failedCount === 0;

  const row = context.rowsByCandidateId.get(candidateId) ?? null;
  const approvedMapping =
    context.approvedMappingsByCandidate.get(candidateId) ??
    resolveApprovedMapping({
      record: context.p109ByCandidate.get(candidateId) ?? null,
      candidateId,
      closedPositionId: row?.positionId ?? null,
      publishedJobTitleById: context.publishedJobTitleById,
    });

  const eligibility = evaluateCandidateEligibility({
    candidateId,
    row,
    context,
    paperworkByGrade: DEFAULT_PAPERWORK_BY_GRADE,
    approvedMapping,
  });

  const previewAllowlistConfig = {
    ...basePilotConfig,
    allowlist: [candidateId],
  };

  const orchestrator = evaluateOrchestratorApproval({
    context,
    candidateId,
    candidateName: currentState.candidateName,
    eligibilityStatus: eligibility.status,
    templateKey: eligibility.templateKey,
    mappingConfidence: eligibility.mappingConfidence,
    approvedMappingReady: eligibility.approvedMappingReady,
    onPilotAllowlist: true,
    row,
  });

  const p124Approval = orchestrator.approval;
  const autoApproved = isAutoApprovedForSendQueue(p124Approval.approvalDecision);

  const p128 = await buildFirstLivePilotCandidateSelection({
    skipP127Drill: input?.skipP127Drill ?? true,
    contextOverride: context,
  });

  const pilotEvaluation = evaluatePilotCandidate({
    candidateId,
    row,
    onboarding: context.onboardingByCandidateId.get(candidateId) ?? null,
    jobsByPositionId: context.jobsByPositionId,
    closedJobsByPositionId: context.closedJobsByPositionId,
    publishedJobs: context.publishedJobs,
    paperworkByGrade: DEFAULT_PAPERWORK_BY_GRADE,
    p100SentIds: context.p100SentIds,
    pilotSentIds: context.pilotSentIds,
    approvedMapping,
    config: previewAllowlistConfig,
    pilotSendCount: registry.sendCount,
  });

  const systemSafetyChecks = buildSystemPilotSafetyChecks({
    config: basePilotConfig,
    pilotSendCount: registry.sendCount,
    dryRun: true,
    confirmationPhrase: P122_CONFIRMATION_PHRASE,
  });

  const candidateSafetyChecks = pilotEvaluation.safetyChecks.filter((check) => check.id !== "on_allowlist");
  const candidateSafetyPassed = candidateSafetyChecks.every((check) => check.passed);
  const systemSafetyPassed = systemSafetyChecks
    .filter((check) => !["dry_run_false", "live_mode_enabled", "operator_go", "pilot_enabled"].includes(check.id))
    .every((check) => check.passed);

  const exactEnvVarsNeeded = {
    AUTONOMOUS_PAPERWORK_LIVE_PILOT_ENABLED: "true",
    AUTONOMOUS_PAPERWORK_LIVE_MODE: "true",
    AUTONOMOUS_PAPERWORK_OPERATOR_GO: "true",
    AUTONOMOUS_PAPERWORK_PILOT_ALLOWLIST: candidateId,
    AUTONOMOUS_PAPERWORK_PILOT_MAX_SENDS: String(basePilotConfig.maxSends),
  };

  const finalAllowlistCommand = `export AUTONOMOUS_PAPERWORK_PILOT_ALLOWLIST="${candidateId}"`;
  const finalLiveCommandPreview = `npx tsx scripts/p122-controlled-live-paperwork-pilot.ts --execute --confirm "${P122_CONFIRMATION_PHRASE}" --candidate-id ${candidateId}`;

  let goNoGo: ManualFixVerificationReport["goNoGo"] = "NO-GO";
  let goNoGoReason = "Manual fix verification incomplete — resolve failed checks before pilot.";

  if (!allPassed) {
    goNoGoReason = `${failedCount} verification check(s) failed — complete P130 manual fixes and re-sync data.`;
  } else if (!autoApproved) {
    goNoGoReason = `Verification passed but P124 decision is ${p124Approval.approvalDecision}, not AUTO_APPROVED.`;
  } else if (pilotEvaluation.status !== "ready_to_send") {
    goNoGoReason = "P122 pilot readiness blocked — candidate not ready_to_send on preview allowlist.";
  } else if (!candidateSafetyPassed) {
    goNoGoReason = "P122 candidate safety checks failed on preview allowlist.";
  } else if (basePilotConfig.liveModeEnabled && basePilotConfig.pilotEnabled && basePilotConfig.operatorGo) {
    goNoGo = "GO";
    goNoGoReason = "All verifications pass, AUTO_APPROVED, and P122 preview allowlist ready — env gates enabled.";
  } else {
    goNoGo = "GO WITH CONDITIONS";
    goNoGoReason =
      "Manual fixes verified and AUTO_APPROVED — set pilot env vars and operator GO before executeOne live send.";
  }

  return {
    sourcePhase: P131_SOURCE_PHASE,
    generatedAt: new Date().toISOString(),
    mode: P131_VERIFICATION_MODE,
    targetCandidateId: P131_TARGET_CANDIDATE_ID,
    targetCandidateName: P131_TARGET_CANDIDATE_NAME,
    recommendedJobId: P131_RECOMMENDED_JOB_ID,
    verification: {
      checks,
      allPassed,
      passedCount,
      failedCount,
    },
    p124Approval: {
      approvalDecision: p124Approval.approvalDecision,
      approvalScore: p124Approval.approvalScore,
      autoApproved,
      humanReviewReasons: p124Approval.humanReviewReasons,
      blockingReasons: p124Approval.blockingReasons,
      safetyReasons: p124Approval.safetyReasons,
    },
    p123Orchestrator: {
      approvedForQueue: orchestrator.approvedForQueue,
      approvalRequired: orchestrator.approvalRequired,
      onPilotAllowlist: true,
      reason: orchestrator.reason,
    },
    p128PilotSelection: {
      selectedCandidateId: p128.selectedCandidate.candidateId,
      selectedCandidateName: p128.selectedCandidate.candidateName,
      matchesTarget: p128.selectedCandidate.candidateId === candidateId,
      approvalDecision: p128.selectedCandidate.approvalDecision,
      approvalScore: p128.selectedCandidate.approvalScore,
      eligibilityStatus: p128.selectedCandidate.eligibilityStatus,
      confirmations: p128.selectedCandidate.confirmations,
      goNoGo: p128.goNoGo,
      goNoGoReason: p128.goNoGoReason,
    },
    p122PilotReadiness: {
      status: pilotEvaluation.status,
      readyToSend: pilotEvaluation.status === "ready_to_send",
      mappingSource: pilotEvaluation.mappingSource,
      templateKey: pilotEvaluation.templateKey,
      safetyChecks: pilotEvaluation.safetyChecks,
      candidateSafetyPassed,
      systemSafetyPassed,
      blockingReasons: pilotEvaluation.blockingReasons,
    },
    autoApproved,
    approvalScore: p124Approval.approvalScore,
    finalAllowlistCommand,
    finalLiveCommandPreview,
    exactEnvVarsNeeded,
    goNoGo,
    goNoGoReason,
    executeBatchCalled: false,
    breezyWrites: false,
    liveModeEnabled: basePilotConfig.liveModeEnabled,
    paperworkSent: false,
    thresholdChanged: false,
  };
}
