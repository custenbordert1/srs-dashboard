import { DEFAULT_PAPERWORK_BY_GRADE } from "@/lib/candidate-onboarding-engine/paperwork-grade-policy";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import { validateCohortEmail } from "@/lib/test-cohort-validation/validate-cohort-contact";
import { buildApprovalPolicy } from "@/lib/autonomous-paperwork-approval-engine/build-approval-policy";
import { evaluateApprovalDecision } from "@/lib/autonomous-paperwork-approval-engine/evaluate-approval-decision";
import { scoreApprovalConfidence } from "@/lib/autonomous-paperwork-approval-engine/score-approval-confidence";
import { classifyPaperworkBlocker } from "@/lib/p106-autonomous-paperwork-engine/classify-paperwork-blocker";
import {
  buildApprovedMappingOverlayJobs,
} from "@/lib/p110-approved-mapping-integration/simulate-approved-mapping-eligibility";
import { resolveApprovedMapping } from "@/lib/p110-approved-mapping-integration/resolve-approved-mapping";
import type { ApprovedMappingResolution } from "@/lib/p110-approved-mapping-integration/types";
import {
  daysSince,
  evaluateCandidateEligibility,
} from "@/lib/autonomous-paperwork-orchestrator/evaluate-eligibility";
import { loadPaperworkCandidates, type LoadedPaperworkCandidates } from "@/lib/autonomous-paperwork-orchestrator/load-candidates";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { loadPilotConfig } from "@/lib/p122-controlled-live-paperwork-pilot/pilot-config";
import type {
  CandidateCurrentState,
  FirstAutoApprovedCandidateFixPlanReport,
  FixSimulationStep,
  RequiredFix,
} from "@/lib/p130-first-auto-approved-candidate-fix-plan/types";
import {
  P130_ANALYSIS_MODE,
  P130_SOURCE_PHASE,
  P130_TARGET_CANDIDATE_ID,
  P130_TARGET_CANDIDATE_NAME,
} from "@/lib/p130-first-auto-approved-candidate-fix-plan/types";

type SimulatedInputs = {
  row: ScoredCandidateWorkflowRow;
  approvedMapping: ApprovedMappingResolution | null;
  mappingConfidence: number;
  nativePublishedJob: boolean;
};

function cloneRow(row: ScoredCandidateWorkflowRow): ScoredCandidateWorkflowRow {
  return {
    ...row,
    candidateGrade: row.candidateGrade ? { ...row.candidateGrade } : row.candidateGrade,
  };
}

function evaluateSimulated(input: {
  context: LoadedPaperworkCandidates;
  candidateId: string;
  simulated: SimulatedInputs;
  policy: ReturnType<typeof buildApprovalPolicy>;
}) {
  const { row, approvedMapping, mappingConfidence, nativePublishedJob } = input.simulated;
  const p109Record = input.context.p109ByCandidate.get(input.candidateId) ?? null;
  const alreadySent =
    input.context.p100SentIds.has(input.candidateId) ||
    input.context.pilotSentIds.has(input.candidateId);
  const baseline = classifyPaperworkBlocker({
    row,
    onboarding: input.context.onboardingByCandidateId.get(input.candidateId) ?? null,
    jobsByPositionId: input.context.jobsByPositionId,
    closedJobsByPositionId: input.context.closedJobsByPositionId,
    publishedJobs: input.context.publishedJobs,
    paperworkByGrade: DEFAULT_PAPERWORK_BY_GRADE,
    p100SentIds: input.context.p100SentIds,
  });
  const duplicateRisk = baseline.category === "duplicate_risk";

  const eligibility = evaluateCandidateEligibility({
    candidateId: input.candidateId,
    row,
    context: input.context,
    paperworkByGrade: DEFAULT_PAPERWORK_BY_GRADE,
    approvedMapping,
  });

  const approval = evaluateApprovalDecision({
    candidateId: input.candidateId,
    candidateName: `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim() || input.candidateId,
    row,
    eligibilityStatus: eligibility.status,
    templateKey: eligibility.templateKey,
    mappingConfidence,
    approvedMapping,
    p109Record,
    nativePublishedJob,
    alreadySent,
    duplicateRisk,
    candidateAgeDays: daysSince(row.createdDate ?? null),
    policy: input.policy,
  });

  const scoring = scoreApprovalConfidence({
    row,
    templateKey: eligibility.templateKey,
    mappingConfidence,
    approvedMapping,
    p109Record,
    nativePublishedJob,
    alreadySent,
    duplicateRisk,
    candidateAgeDays: daysSince(row.createdDate ?? null),
    policy: input.policy,
  });

  return { approval, scoring, eligibility };
}

function buildCurrentState(input: {
  context: LoadedPaperworkCandidates;
  candidateId: string;
  policy: ReturnType<typeof buildApprovalPolicy>;
}): CandidateCurrentState {
  const row = input.context.rowsByCandidateId.get(input.candidateId);
  if (!row) {
    throw new Error(`P130 — candidate ${input.candidateId} not found in loaded context.`);
  }

  const approvedMapping =
    input.context.approvedMappingsByCandidate.get(input.candidateId) ??
    resolveApprovedMapping({
      record: input.context.p109ByCandidate.get(input.candidateId) ?? null,
      candidateId: input.candidateId,
      closedPositionId: row.positionId ?? null,
      publishedJobTitleById: input.context.publishedJobTitleById,
    });

  const baseline = classifyPaperworkBlocker({
    row,
    onboarding: input.context.onboardingByCandidateId.get(input.candidateId) ?? null,
    jobsByPositionId: input.context.jobsByPositionId,
    closedJobsByPositionId: input.context.closedJobsByPositionId,
    publishedJobs: input.context.publishedJobs,
    paperworkByGrade: DEFAULT_PAPERWORK_BY_GRADE,
    p100SentIds: input.context.p100SentIds,
  });

  const overlayJobs =
    approvedMapping && row.positionId
      ? buildApprovedMappingOverlayJobs({
          jobsByPositionId: input.context.jobsByPositionId,
          closedPositionId: row.positionId,
          approved: approvedMapping,
          publishedJobs: input.context.publishedJobs,
        })
      : null;

  const overlayBlocker =
    overlayJobs && approvedMapping
      ? classifyPaperworkBlocker({
          row,
          onboarding: input.context.onboardingByCandidateId.get(input.candidateId) ?? null,
          jobsByPositionId: overlayJobs,
          closedJobsByPositionId: input.context.closedJobsByPositionId,
          publishedJobs: input.context.publishedJobs,
          paperworkByGrade: DEFAULT_PAPERWORK_BY_GRADE,
          p100SentIds: input.context.p100SentIds,
        })
      : null;

  const nativePublishedJob = Boolean(row.positionId && input.context.jobsByPositionId.has(row.positionId));
  const closedJob = Boolean(row.positionId && input.context.closedJobsByPositionId.has(row.positionId));
  const recommendedPositionId = approvedMapping?.recommendedPositionId ?? null;
  const recommendedJobPublished = recommendedPositionId
    ? input.context.publishedJobs.some((job) => job.jobId === recommendedPositionId)
    : false;

  const mappingConfidence = approvedMapping?.confidenceScore ?? 0;
  const email = row.email?.trim() ?? "";
  const emailValid = Boolean(email) && validateCohortEmail(email).valid;
  const alreadySent =
    baseline.category === "already_sent" ||
    input.context.p100SentIds.has(input.candidateId) ||
    input.context.pilotSentIds.has(input.candidateId);
  const duplicateRisk = baseline.category === "duplicate_risk";
  const recruiterAssigned = !isUnassignedRecruiter(row.assignedRecruiter);
  const questionnaireComplete = Boolean(row.hasResume && row.candidateGrade?.paperworkReady !== false);
  const p109Record = input.context.p109ByCandidate.get(input.candidateId) ?? null;

  const eligibility = evaluateCandidateEligibility({
    candidateId: input.candidateId,
    row,
    context: input.context,
    paperworkByGrade: DEFAULT_PAPERWORK_BY_GRADE,
    approvedMapping,
  });

  const { approval, scoring } = evaluateSimulated({
    context: input.context,
    candidateId: input.candidateId,
    policy: input.policy,
    simulated: {
      row,
      approvedMapping,
      mappingConfidence,
      nativePublishedJob,
    },
  });

  const mappingSource = nativePublishedJob
    ? "native_published_job"
    : approvedMapping?.qualifies
      ? "approved_mapping"
      : "none";

  return {
    candidateId: input.candidateId,
    candidateName: approval.candidateName,
    email,
    emailValid,
    duplicateStatus: {
      isDuplicate: duplicateRisk,
      detail: duplicateRisk ? baseline.reason : "No duplicate risk detected.",
    },
    alreadySentStatus: {
      alreadySent,
      detail: alreadySent ? "Paperwork already sent or in flight." : "No prior send detected.",
    },
    breezyJob: {
      positionId: row.positionId ?? null,
      positionName: row.positionName ?? null,
      nativePublishedJob,
      closedJob,
      recommendedPositionId,
      recommendedPositionTitle: approvedMapping?.recommendedPositionTitle ?? null,
      recommendedJobPublished,
    },
    projectMapping: {
      p109Decision: p109Record?.decision ?? null,
      approvedMappingQualifies: Boolean(approvedMapping?.qualifies),
      mappingSource,
      mappingReasons: approvedMapping?.mappingReasons ?? [],
      overlayBlocker: overlayBlocker?.category ?? null,
      baselineBlocker: baseline.category,
    },
    mappingConfidence,
    recruiterAssignment: {
      assigned: recruiterAssigned,
      recruiter: recruiterAssigned ? row.assignedRecruiter ?? null : null,
    },
    questionnaireResume: {
      hasResume: Boolean(row.hasResume),
      paperworkReady: row.candidateGrade?.paperworkReady !== false,
      complete: questionnaireComplete,
    },
    template: {
      templateKey: eligibility.templateKey,
      available: Boolean(eligibility.templateKey),
    },
    eligibilityStatus: eligibility.status,
    approvalScore: approval.approvalScore,
    approvalDecision: approval.approvalDecision,
    scoreFactors: scoring.factors,
    approvalReasons: approval.approvalReasons,
    humanReviewReasons: approval.humanReviewReasons,
    blockingReasons: approval.blockingReasons,
    safetyReasons: approval.safetyReasons,
    scoreGapToAutoApprove: Math.max(0, input.policy.autoApproveThreshold - approval.approvalScore),
  };
}

function buildRequiredFixes(current: CandidateCurrentState): RequiredFix[] {
  const fixes: RequiredFix[] = [];

  if (!current.questionnaireResume.complete) {
    fixes.push({
      id: "complete_questionnaire_resume",
      title: "Complete questionnaire / resume",
      description:
        "Candidate lacks resume and paperwork-ready grade. P110 overlay blocker is missing_resume; completing intake unlocks score points and P122 mapping gate.",
      category: "manual_taylor",
      blockerType: "data_issue",
      currentValue: `hasResume=${current.questionnaireResume.hasResume}, paperworkReady=${current.questionnaireResume.paperworkReady}`,
      targetValue: "hasResume=true, candidateGrade.paperworkReady=true",
      pointsGained: 10,
      policyGate: false,
      manualSteps: [
        "Obtain resume or complete questionnaire in recruiting workflow.",
        "Mark candidate paperwork-ready in grade policy / onboarding intake.",
        "Re-sync recruiting sheet so hasResume and candidateGrade update locally.",
      ],
      softwareCanPrepare: [
        "Re-run ingestion sync to refresh local row after Taylor updates source data.",
        "Re-run P130 simulation to verify overlay blocker clears to unknown_manual_review.",
      ],
      cannotFixSafely: null,
    });
  }

  if (current.mappingConfidence < 80) {
    fixes.push({
      id: "raise_mapping_confidence_80",
      title: "Raise mapping confidence to 80%+",
      description:
        "P124 demotes AUTO_APPROVED to NEEDS_HUMAN_APPROVAL when mapping confidence is below 80%, even if score threshold is met.",
      category: "manual_taylor",
      blockerType: "policy_issue",
      currentValue: `${current.mappingConfidence}%`,
      targetValue: "80% or higher (P109 confidenceScore)",
      pointsGained: Math.max(
        0,
        Math.min(10, Math.round(80 / 10)) -
          Math.min(10, Math.round(current.mappingConfidence / 10)),
      ),
      policyGate: true,
      manualSteps: [
        "Review P109 approved mapping for Tyree (closed 7959fdf7c9f1 → recommended 93ebc05539b8).",
        "Confirm same client/city/state/territory evidence supports ≥80% confidence.",
        "Re-approve or update mapping review record with justified confidenceScore ≥80.",
      ],
      softwareCanPrepare: [
        "Validate overlay dry-run outcome via P110 simulate-approved-mapping-eligibility.",
        "Preview post-fix approval score locally without writing to Breezy.",
      ],
      cannotFixSafely: "Do not artificially inflate confidence without reviewer justification.",
    });
  }

  if (!current.recruiterAssignment.assigned) {
    fixes.push({
      id: "assign_recruiter",
      title: "Assign recruiter",
      description: "Recruiter assignment adds +5 approval score and satisfies operational send prerequisites.",
      category: "manual_taylor",
      blockerType: "data_issue",
      currentValue: "Unassigned recruiter",
      targetValue: "Named recruiter (not Unassigned / TBD)",
      pointsGained: 5,
      policyGate: false,
      manualSteps: [
        "Assign owning recruiter in Breezy / recruiting sheet for Tyree nicole Gilley.",
        "Confirm assignedRecruiter field syncs to local workflow row.",
      ],
      softwareCanPrepare: [
        "After sync, re-evaluate approval score in P130 preview.",
      ],
      cannotFixSafely: null,
    });
  }

  if (
    !current.breezyJob.nativePublishedJob &&
    current.breezyJob.recommendedJobPublished &&
    current.projectMapping.overlayBlocker
  ) {
    fixes.push({
      id: "verify_p109_overlay_eligibility",
      title: "Verify P109 overlay clears send blockers",
      description:
        "Approved mapping exists but overlay still reports a blocker until resume and mapping gates align.",
      category: "software_prepares_locally",
      blockerType: "mapping_issue",
      currentValue: `overlayBlocker=${current.projectMapping.overlayBlocker}, eligibility=${current.eligibilityStatus}`,
      targetValue: "overlayBlocker=unknown_manual_review or READY_AFTER_APPROVAL",
      pointsGained: 0,
      policyGate: false,
      manualSteps: [
        "Complete resume fix first — overlay blocker is missing_resume.",
      ],
      softwareCanPrepare: [
        "Run P110 dry-run after data fixes to confirm newly_eligible_via_approval.",
        "Re-run P128 pilot selection preview for mapping gate pass.",
      ],
      cannotFixSafely: null,
    });
  }

  if (
    !current.breezyJob.nativePublishedJob &&
    current.breezyJob.recommendedJobPublished &&
    (current.eligibilityStatus === "READY_AFTER_APPROVAL" || current.eligibilityStatus === "NO_PROJECT")
  ) {
    fixes.push({
      id: "reassign_to_published_recommended_job",
      title: "Reassign candidate to published recommended job",
      description:
        "Closed-ad P109 overlay path sets eligibility READY_AFTER_APPROVAL, which policy blocks from AUTO_APPROVED (requires human sign-off). Reassigning Tyree to the published recommended Breezy posting enables native published job eligibility (READY_TO_SEND).",
      category: "manual_taylor",
      blockerType: "mapping_issue",
      currentValue: `Closed position ${current.breezyJob.positionId ?? "unknown"} with READY_AFTER_APPROVAL overlay`,
      targetValue: `Active application on published job ${current.breezyJob.recommendedPositionId ?? "unknown"}`,
      pointsGained: 15,
      policyGate: true,
      manualSteps: [
        `In Breezy, move/reassign Tyree to published job: ${current.breezyJob.recommendedPositionTitle ?? current.breezyJob.recommendedPositionId ?? "recommended posting"}.`,
        "Confirm positionId syncs to local recruiting data as the published job id.",
        "Verify eligibility transitions from READY_AFTER_APPROVAL to READY_TO_SEND.",
      ],
      softwareCanPrepare: [
        "After sync, re-run P130 simulation — nativePublishedJob should be true.",
        "Re-run P128 to confirm P122 mapping gate passes without overlay.",
      ],
      cannotFixSafely: "Software must not auto-reassign candidates in Breezy.",
    });
  }

  if (current.eligibilityStatus === "NO_PROJECT" && !current.breezyJob.nativePublishedJob) {
    fixes.push({
      id: "confirm_approved_mapping_project_link",
      title: "Confirm approved mapping project linkage",
      description:
        "Eligibility shows NO_PROJECT on closed original posting; P109 approved mapping is the qualifying project path (no native republish required if overlay passes).",
      category: "manual_taylor",
      blockerType: "mapping_issue",
      currentValue: `NO_PROJECT on closed ${current.breezyJob.positionId ?? "unknown"}`,
      targetValue: "P109 approved mapping qualifies with published recommended job",
      pointsGained: 0,
      policyGate: false,
      manualSteps: [
        "Confirm P109 approval record matches closed position 7959fdf7c9f1.",
        `Verify recommended job ${current.breezyJob.recommendedPositionId ?? "unknown"} remains published.`,
      ],
      softwareCanPrepare: [
        "Local overlay job map already includes recommended position when approved mapping qualifies.",
      ],
      cannotFixSafely: "Do not republish closed Breezy ads without ops review.",
    });
  }

  return fixes;
}

function applyFixesToSimulation(
  baseRow: ScoredCandidateWorkflowRow,
  baseMapping: ApprovedMappingResolution | null,
  fixIds: string[],
  context: LoadedPaperworkCandidates,
): SimulatedInputs {
  const row = cloneRow(baseRow);
  let approvedMapping = baseMapping ? { ...baseMapping, mappingReasons: [...baseMapping.mappingReasons] } : null;
  let mappingConfidence = approvedMapping?.confidenceScore ?? 0;

  for (const fixId of fixIds) {
    switch (fixId) {
      case "complete_questionnaire_resume":
        row.hasResume = true;
        row.candidateGrade = { ...(row.candidateGrade ?? {}), paperworkReady: true };
        break;
      case "assign_recruiter":
        row.assignedRecruiter = "Taylor";
        break;
      case "raise_mapping_confidence_80":
        mappingConfidence = Math.max(80, mappingConfidence);
        if (approvedMapping) approvedMapping = { ...approvedMapping, confidenceScore: mappingConfidence };
        break;
      case "reassign_to_published_recommended_job":
        if (approvedMapping?.recommendedPositionId) {
          row.positionId = approvedMapping.recommendedPositionId;
          row.positionName =
            approvedMapping.recommendedPositionTitle ??
            context.publishedJobTitleById.get(approvedMapping.recommendedPositionId) ??
            row.positionName;
        }
        break;
      case "confirm_approved_mapping_project_link":
      case "verify_p109_overlay_eligibility":
        break;
      default:
        break;
    }
  }

  const nativePublishedJob = Boolean(
    row.positionId?.trim() &&
      (context.jobsByPositionId.has(row.positionId) ||
        context.publishedJobs.some((job) => job.jobId === row.positionId && job.status === "published")),
  );

  if (nativePublishedJob && row.positionId !== baseRow.positionId) {
    approvedMapping = null;
  }

  return { row, approvedMapping, mappingConfidence, nativePublishedJob };
}

function runIncrementalSimulation(input: {
  context: LoadedPaperworkCandidates;
  candidateId: string;
  policy: ReturnType<typeof buildApprovalPolicy>;
  baseRow: ScoredCandidateWorkflowRow;
  baseMapping: ApprovedMappingResolution | null;
  fixOrder: string[];
  requiredFixes: RequiredFix[];
  baselineScore: number;
}): FixSimulationStep[] {
  const steps: FixSimulationStep[] = [];
  const applied: string[] = [];
  let previousScore = input.baselineScore;

  for (const fixId of input.fixOrder) {
    const fix = input.requiredFixes.find((entry) => entry.id === fixId);
    if (!fix) continue;
    applied.push(fixId);
    const simulated = applyFixesToSimulation(input.baseRow, input.baseMapping, applied, input.context);
    const result = evaluateSimulated({
      context: input.context,
      candidateId: input.candidateId,
      policy: input.policy,
      simulated,
    });
    const notes: string[] = [];
    if (fix.policyGate && result.approval.approvalDecision !== "AUTO_APPROVED") {
      notes.push("Policy gate — score may be sufficient but mapping confidence demotion still applies until ≥80%.");
    }
    if (result.approval.humanReviewReasons.some((r) => /mapping confidence/i.test(r))) {
      notes.push("Mapping confidence below auto threshold.");
    }
    steps.push({
      fixId,
      title: fix.title,
      simulatedScore: result.approval.approvalScore,
      simulatedDecision: result.approval.approvalDecision,
      scoreDelta: result.approval.approvalScore - previousScore,
      cumulativeFixes: [...applied],
      notes,
    });
    previousScore = result.approval.approvalScore;
  }

  return steps;
}

export async function buildFirstAutoApprovedCandidateFixPlan(input?: {
  candidateId?: string;
  contextOverride?: LoadedPaperworkCandidates;
}): Promise<FirstAutoApprovedCandidateFixPlanReport> {
  const candidateId = input?.candidateId ?? P130_TARGET_CANDIDATE_ID;
  const policy = buildApprovalPolicy();
  const context = input?.contextOverride ?? (await loadPaperworkCandidates({ mtdOnly: false }));
  const pilotConfig = loadPilotConfig();

  const row = context.rowsByCandidateId.get(candidateId);
  if (!row) {
    throw new Error(`P130 — candidate ${candidateId} not found.`);
  }

  const approvedMapping =
    context.approvedMappingsByCandidate.get(candidateId) ??
    resolveApprovedMapping({
      record: context.p109ByCandidate.get(candidateId) ?? null,
      candidateId,
      closedPositionId: row.positionId ?? null,
      publishedJobTitleById: context.publishedJobTitleById,
    });

  const currentState = buildCurrentState({ context, candidateId, policy });
  const requiredFixes = buildRequiredFixes(currentState);

  const scoreFixOrder = [
    "complete_questionnaire_resume",
    "raise_mapping_confidence_80",
    "assign_recruiter",
    "reassign_to_published_recommended_job",
    "verify_p109_overlay_eligibility",
    "confirm_approved_mapping_project_link",
  ].filter((id) => requiredFixes.some((fix) => fix.id === id));

  const simulationSteps = runIncrementalSimulation({
    context,
    candidateId,
    policy,
    baseRow: row,
    baseMapping: approvedMapping,
    fixOrder: scoreFixOrder,
    requiredFixes,
    baselineScore: currentState.approvalScore,
  });

  const allFixIds = scoreFixOrder;
  const finalSimulated = applyFixesToSimulation(row, approvedMapping, allFixIds, context);
  const finalResult = evaluateSimulated({
    context,
    candidateId,
    policy,
    simulated: finalSimulated,
  });

  const manualChecklist = [
    "Confirm Tyree nicole Gilley email tyreenicolegilley932@gmail.com is correct (already valid).",
    "Confirm no duplicate record and paperwork not already sent (already clear).",
    ...requiredFixes
      .filter((fix) => fix.category === "manual_taylor")
      .flatMap((fix) => fix.manualSteps.map((step) => `[${fix.title}] ${step}`)),
    "Re-run P129 gap analysis to confirm AUTO_APPROVED count ≥1.",
    "Re-run P128 pilot selection — mapping gate should pass after resume + overlay fix.",
    "Do NOT enable live mode or send until AUTO_APPROVED and P122 safety checks pass.",
  ];

  const cannotFixSafely = [
    "Lowering autoApproveThreshold below 90 (explicitly forbidden for P130).",
    "Automated Breezy writes or executeBatch sends.",
    "Inflating P109 confidence without documented reviewer justification.",
    "Bypassing READY_AFTER_APPROVAL human sign-off without reassigning to a native published job.",
    ...requiredFixes
      .map((fix) => fix.cannotFixSafely)
      .filter((value): value is string => Boolean(value)),
  ];

  let goNoGo: FirstAutoApprovedCandidateFixPlanReport["goNoGo"] = "GO WITH CONDITIONS";
  let goNoGoReason =
    "Data fixes are well-defined and simulatable — apply manual steps then re-validate before any live send.";

  if (finalResult.approval.approvalDecision === "AUTO_APPROVED") {
    goNoGo = "GO WITH CONDITIONS";
    goNoGoReason =
      "Simulated post-fix state reaches AUTO_APPROVED — apply manual data fixes in source systems, re-sync, and re-validate before live pilot.";
  } else if (
    currentState.safetyReasons.length > 0 ||
    currentState.duplicateStatus.isDuplicate ||
    currentState.alreadySentStatus.alreadySent
  ) {
    goNoGo = "NO-GO";
    goNoGoReason = "Safety blockers present — cannot reach AUTO_APPROVED via data fix alone.";
  } else if (finalResult.approval.approvalScore < policy.autoApproveThreshold) {
    goNoGo = "NO-GO";
    goNoGoReason = `Simulated post-fix score ${finalResult.approval.approvalScore} still below threshold ${policy.autoApproveThreshold}.`;
  }

  return {
    sourcePhase: P130_SOURCE_PHASE,
    generatedAt: new Date().toISOString(),
    mode: P130_ANALYSIS_MODE,
    targetCandidateId: P130_TARGET_CANDIDATE_ID,
    targetCandidateName: P130_TARGET_CANDIDATE_NAME,
    policy,
    currentState,
    requiredFixes,
    simulation: {
      steps: simulationSteps,
      postFixScore: finalResult.approval.approvalScore,
      postFixDecision: finalResult.approval.approvalDecision,
      postFixFactors: finalResult.scoring.factors,
      allFixesApplied: allFixIds,
    },
    manualChecklist,
    cannotFixSafely,
    goNoGo,
    goNoGoReason,
    executeBatchCalled: false,
    breezyWrites: false,
    liveModeEnabled: pilotConfig.liveModeEnabled,
    paperworkSent: false,
    thresholdChanged: false,
  };
}
