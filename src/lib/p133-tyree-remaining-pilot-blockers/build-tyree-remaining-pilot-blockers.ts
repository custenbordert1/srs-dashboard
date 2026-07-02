import type { BreezyJob } from "@/lib/breezy-api";
import { buildFirstAutoApprovedCandidateFixPlan } from "@/lib/p130-first-auto-approved-candidate-fix-plan/build-first-auto-approved-candidate-fix-plan";
import { buildManualFixVerificationFirstPilotRecheck } from "@/lib/p131-manual-fix-verification-first-pilot-recheck/build-manual-fix-verification";
import { loadPaperworkCandidates, type LoadedPaperworkCandidates } from "@/lib/autonomous-paperwork-orchestrator/load-candidates";
import { loadPilotConfig } from "@/lib/p122-controlled-live-paperwork-pilot/pilot-config";
import type {
  AlternativePublishedJob,
  FailedGate,
  JobRemediationDecision,
  RemainingFix,
  TyreeRemainingPilotBlockersReport,
} from "@/lib/p133-tyree-remaining-pilot-blockers/types";
import {
  P133_ANALYSIS_MODE,
  P133_CLOSED_POSITION_ID,
  P133_RECOMMENDED_JOB_ID,
  P133_SOURCE_PHASE,
  P133_TARGET_CANDIDATE_ID,
  P133_TARGET_CANDIDATE_NAME,
} from "@/lib/p133-tyree-remaining-pilot-blockers/types";

const MAPPING_CONFIDENCE_MIN = 80;

function normalizeLocation(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function scorePublishedJobMatch(input: {
  job: BreezyJob;
  candidateCity: string | null;
  candidateState: string | null;
  recommendedJobId: string;
}): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;
  const jobCity = normalizeLocation(input.job.city);
  const jobState = normalizeLocation(input.job.state);
  const candidateCity = normalizeLocation(input.candidateCity);
  const candidateState = normalizeLocation(input.candidateState);

  if (input.job.jobId === input.recommendedJobId) {
    score += 40;
    reasons.push("Current P109 recommended job");
  }
  if (candidateState && jobState && candidateState === jobState) {
    score += 25;
    reasons.push("Same state as candidate");
  }
  if (candidateCity && jobCity && candidateCity === jobCity) {
    score += 25;
    reasons.push("Same city as candidate");
  }
  if (/merchandis/i.test(input.job.name ?? "")) {
    score += 10;
    reasons.push("Merchandising title match");
  }
  if (input.job.status === "published") {
    score += 10;
    reasons.push("Published status");
  }

  return { score, reasons };
}

function buildAlternativePublishedJobs(input: {
  publishedJobs: BreezyJob[];
  candidateCity: string | null;
  candidateState: string | null;
  recommendedJobId: string;
}): AlternativePublishedJob[] {
  const ranked = input.publishedJobs
    .filter((job) => job.status === "published")
    .map((job) => {
      const { score, reasons } = scorePublishedJobMatch({
        job,
        candidateCity: input.candidateCity,
        candidateState: input.candidateState,
        recommendedJobId: input.recommendedJobId,
      });
      return {
        jobId: job.jobId,
        name: job.name ?? job.jobId,
        city: job.city ?? "",
        state: job.state ?? "",
        status: job.status ?? "unknown",
        matchScore: score,
        matchReasons: reasons,
        isCurrentRecommended: job.jobId === input.recommendedJobId,
        shouldReplaceRecommended: false,
      };
    })
    .sort((a, b) => b.matchScore - a.matchScore);

  const top = ranked[0];
  if (top && !top.isCurrentRecommended && top.matchScore > (ranked.find((j) => j.isCurrentRecommended)?.matchScore ?? 0)) {
    top.shouldReplaceRecommended = true;
  }

  return ranked.slice(0, 8);
}

function buildJobRemediation(input: {
  currentState: Awaited<ReturnType<typeof buildFirstAutoApprovedCandidateFixPlan>>["currentState"];
  alternatives: AlternativePublishedJob[];
  recommendedJobTitle: string | null;
}): JobRemediationDecision {
  const { currentState } = input;
  const recommendedPublished = currentState.breezyJob.recommendedJobPublished;
  const betterAlternative = input.alternatives.find((job) => job.shouldReplaceRecommended);

  if (betterAlternative) {
    return {
      recommendedJobId: betterAlternative.jobId,
      recommendedJobTitle: betterAlternative.name,
      recommendedJobPublished: true,
      currentPositionId: currentState.breezyJob.positionId,
      currentPositionClosed: currentState.breezyJob.closedJob,
      p109Approved: currentState.projectMapping.approvedMappingQualifies,
      p109Confidence: currentState.mappingConfidence,
      action: "remap_to_alternative",
      requiresPublish: false,
      requiresRemap: true,
      rationale: `Alternative published job ${betterAlternative.jobId} scores higher (${betterAlternative.matchScore}) than current P109 recommended ${P133_RECOMMENDED_JOB_ID}. Requires new P109 review before pilot.`,
    };
  }

  if (!currentState.breezyJob.nativePublishedJob && recommendedPublished) {
    return {
      recommendedJobId: P133_RECOMMENDED_JOB_ID,
      recommendedJobTitle: input.recommendedJobTitle,
      recommendedJobPublished: true,
      currentPositionId: currentState.breezyJob.positionId,
      currentPositionClosed: currentState.breezyJob.closedJob,
      p109Approved: currentState.projectMapping.approvedMappingQualifies,
      p109Confidence: currentState.mappingConfidence,
      action: "reassign_to_recommended",
      requiresPublish: false,
      requiresRemap: false,
      rationale:
        `Recommended job ${P133_RECOMMENDED_JOB_ID} is already published. Tyree remains on closed position ${P133_CLOSED_POSITION_ID}, so P122 blocks on approved_mapping_or_native_project. Reassign in Breezy to the published recommended posting — do not republish the closed ad.`,
    };
  }

  if (!recommendedPublished) {
    return {
      recommendedJobId: P133_RECOMMENDED_JOB_ID,
      recommendedJobTitle: input.recommendedJobTitle,
      recommendedJobPublished: false,
      currentPositionId: currentState.breezyJob.positionId,
      currentPositionClosed: currentState.breezyJob.closedJob,
      p109Approved: currentState.projectMapping.approvedMappingQualifies,
      p109Confidence: currentState.mappingConfidence,
      action: "keep_p109_overlay",
      requiresPublish: true,
      requiresRemap: false,
      rationale: "Recommended job is not published — publish or select another active published posting before pilot.",
    };
  }

  return {
    recommendedJobId: P133_RECOMMENDED_JOB_ID,
    recommendedJobTitle: input.recommendedJobTitle,
    recommendedJobPublished: recommendedPublished,
    currentPositionId: currentState.breezyJob.positionId,
    currentPositionClosed: currentState.breezyJob.closedJob,
    p109Approved: currentState.projectMapping.approvedMappingQualifies,
    p109Confidence: currentState.mappingConfidence,
    action: "keep_p109_overlay",
    requiresPublish: false,
    requiresRemap: false,
    rationale: "P109 approved mapping overlay is valid but P122 still prefers native published job assignment for AUTO_APPROVED pilot path.",
  };
}

function buildFailedGates(input: {
  verification: Awaited<ReturnType<typeof buildManualFixVerificationFirstPilotRecheck>>["verification"];
  p124: Awaited<ReturnType<typeof buildManualFixVerificationFirstPilotRecheck>>["p124Approval"];
  p122: Awaited<ReturnType<typeof buildManualFixVerificationFirstPilotRecheck>>["p122PilotReadiness"];
  hasResume: boolean;
}): FailedGate[] {
  const gateCategory = (id: string): FailedGate["category"] => {
    if (id.includes("resume") || id.includes("questionnaire")) return "resume";
    if (id.includes("recruiter")) return "recruiter";
    if (id.includes("mapping")) return "mapping";
    if (id.includes("job")) return "job";
    return "safety";
  };

  const verificationGates: FailedGate[] = input.verification.checks.map((check) => ({
    id: check.id,
    label: check.label,
    category: gateCategory(check.id),
    passed: check.passed,
    expected: check.expected,
    actual: check.actual,
    resolvedByP132: check.id === "questionnaire_resume_complete" && input.hasResume && !check.passed,
  }));

  const approvalGate: FailedGate = {
    id: "p124_auto_approved",
    label: "P124 AUTO_APPROVED decision",
    category: "approval",
    passed: input.p124.autoApproved,
    expected: "AUTO_APPROVED",
    actual: input.p124.approvalDecision,
    resolvedByP132: false,
  };

  const pilotGate: FailedGate = {
    id: "p122_ready_to_send",
    label: "P122 pilot ready_to_send",
    category: "pilot",
    passed: input.p122.readyToSend,
    expected: "ready_to_send",
    actual: input.p122.status,
    resolvedByP132: false,
  };

  return [...verificationGates, approvalGate, pilotGate];
}

function buildRemainingFixes(input: {
  currentState: Awaited<ReturnType<typeof buildFirstAutoApprovedCandidateFixPlan>>["currentState"];
  fixPlan: Awaited<ReturnType<typeof buildFirstAutoApprovedCandidateFixPlan>>;
  jobRemediation: JobRemediationDecision;
  p132HasResume: boolean;
}): RemainingFix[] {
  const fixes: RemainingFix[] = [];
  const { currentState } = input;

  if (input.p132HasResume && !currentState.questionnaireResume.paperworkReady) {
    fixes.push({
      id: "mark_paperwork_ready",
      title: "Mark candidate paperwork-ready",
      priority: 1,
      category: "manual_taylor",
      currentValue: `hasResume=true, paperworkReady=${currentState.questionnaireResume.paperworkReady}`,
      targetValue: "candidateGrade.paperworkReady=true",
      pointsGained: 10,
      manualSteps: [
        "Confirm Tyree resume asset is visible in recruiting workflow (P132 enrichment complete).",
        "Set paperwork-ready grade in recruiting sheet / grade policy for Tyree nicole Gilley.",
        "Re-sync local ingestion so workflow row reflects paperworkReady=true.",
      ],
      softwareSteps: [
        "Re-run ingestion sync (read-only Breezy pull) after grade update.",
        "Re-run P131 verification to confirm questionnaire_resume_complete passes.",
      ],
    });
  } else if (!currentState.questionnaireResume.complete) {
    const resumeFix = input.fixPlan.requiredFixes.find((fix) => fix.id === "complete_questionnaire_resume");
    if (resumeFix) {
      fixes.push({
        id: resumeFix.id,
        title: resumeFix.title,
        priority: 1,
        category: "manual_taylor",
        currentValue: resumeFix.currentValue,
        targetValue: resumeFix.targetValue,
        pointsGained: resumeFix.pointsGained,
        manualSteps: resumeFix.manualSteps,
        softwareSteps: resumeFix.softwareCanPrepare,
      });
    }
  }

  if (!currentState.recruiterAssignment.assigned) {
    fixes.push({
      id: "assign_recruiter",
      title: "Assign recruiter",
      priority: 2,
      category: "manual_taylor",
      currentValue: "Unassigned",
      targetValue: "Named recruiter (not Unassigned / TBD)",
      pointsGained: 5,
      manualSteps: [
        "Assign owning recruiter in Breezy / recruiting sheet for Tyree nicole Gilley.",
        "Confirm assignedRecruiter syncs to local workflow row.",
      ],
      softwareSteps: ["Re-run P131 after sync to confirm recruiter_assigned gate passes."],
    });
  }

  if (currentState.mappingConfidence < MAPPING_CONFIDENCE_MIN) {
    fixes.push({
      id: "raise_mapping_confidence_80",
      title: "Raise P109 mapping confidence to 80%+",
      priority: 3,
      category: "manual_taylor",
      currentValue: `${currentState.mappingConfidence}%`,
      targetValue: "≥80% confidenceScore on approved P109 record",
      pointsGained: Math.max(0, Math.min(10, 8) - Math.min(10, Math.round(currentState.mappingConfidence / 10))),
      manualSteps: [
        `Review P109 approved mapping: closed ${P133_CLOSED_POSITION_ID} → recommended ${P133_RECOMMENDED_JOB_ID}.`,
        "Document same client/city/state evidence supporting ≥80% confidence.",
        "Update P109 review record confidenceScore to 80+ with reviewer justification.",
      ],
      softwareSteps: [
        "Re-run P133 blocker plan locally to confirm mapping_confidence_80 gate passes.",
        "Preview post-fix P124 score without writing to Breezy.",
      ],
    });
  }

  if (input.jobRemediation.action === "reassign_to_recommended") {
    fixes.push({
      id: "reassign_to_published_recommended_job",
      title: "Reassign to published recommended Breezy job",
      priority: 4,
      category: "manual_taylor",
      currentValue: `Closed position ${currentState.breezyJob.positionId ?? P133_CLOSED_POSITION_ID}`,
      targetValue: `Active application on published ${P133_RECOMMENDED_JOB_ID}`,
      pointsGained: 15,
      manualSteps: [
        `In Breezy, reassign Tyree to published job: ${input.jobRemediation.recommendedJobTitle ?? P133_RECOMMENDED_JOB_ID}.`,
        "Confirm positionId syncs locally as the published job id.",
        "Verify eligibility moves from READY_AFTER_APPROVAL overlay to READY_TO_SEND native path.",
      ],
      softwareSteps: [
        "After sync, re-run P131 — P122 approved_mapping_or_native_project should pass.",
        "Re-run P128 pilot selection preview with Tyree on allowlist.",
      ],
    });
  } else if (input.jobRemediation.action === "remap_to_alternative") {
    fixes.push({
      id: "remap_p109_to_alternative_job",
      title: "Remap P109 to higher-scoring published job",
      priority: 4,
      category: "manual_taylor",
      currentValue: `P109 recommends ${P133_RECOMMENDED_JOB_ID}`,
      targetValue: `P109 approves ${input.jobRemediation.recommendedJobId}`,
      pointsGained: 0,
      manualSteps: [
        `Review alternative published job ${input.jobRemediation.recommendedJobId} vs current recommended mapping.`,
        "If justified, update P109 review to approve the alternative posting.",
        "Reassign Tyree in Breezy to the approved published job.",
      ],
      softwareSteps: ["Re-run P133 after P109 update and Breezy reassignment."],
    });
  }

  return fixes.sort((a, b) => a.priority - b.priority);
}

function flattenManualSteps(fixes: RemainingFix[]): TyreeRemainingPilotBlockersReport["manualSteps"] {
  const steps: TyreeRemainingPilotBlockersReport["manualSteps"] = [];
  let order = 1;
  for (const fix of fixes) {
    for (const step of fix.manualSteps) {
      steps.push({ order, fixId: fix.id, step });
      order += 1;
    }
  }
  return steps;
}

function buildSoftwareSteps(): TyreeRemainingPilotBlockersReport["softwareSteps"] {
  return [
    { order: 1, step: "Confirm P132 resume enrichment persisted (hasResume=true, resumeAssets present).", command: "npx tsx scripts/p132-enrich-tyree-resume.ts" },
    { order: 2, step: "After manual Breezy / sheet updates, re-sync ingestion (read-only).", command: "npx tsx scripts/p86-3-completion.ts" },
    { order: 3, step: "Re-run P131 manual fix verification recheck.", command: "npx tsx scripts/p131-manual-fix-verification-first-pilot-recheck.ts" },
    { order: 4, step: "Re-run P133 remaining blocker plan.", command: "npx tsx scripts/p133-tyree-remaining-pilot-blockers.ts" },
    { order: 5, step: "Only after AUTO_APPROVED + P122 ready_to_send: preview P122 live command (do not execute without operator GO)." },
  ];
}

export async function buildTyreeRemainingPilotBlockers(input?: {
  candidateId?: string;
  contextOverride?: LoadedPaperworkCandidates;
}): Promise<TyreeRemainingPilotBlockersReport> {
  const candidateId = input?.candidateId ?? P133_TARGET_CANDIDATE_ID;
  const pilotConfig = loadPilotConfig();
  const context = input?.contextOverride ?? (await loadPaperworkCandidates({ mtdOnly: false }));

  const fixPlan = await buildFirstAutoApprovedCandidateFixPlan({
    candidateId,
    contextOverride: context,
  });
  const verification = await buildManualFixVerificationFirstPilotRecheck({
    candidateId,
    contextOverride: context,
    skipP127Drill: true,
  });

  const row = context.rowsByCandidateId.get(candidateId) ?? null;
  const resumeAssetsCount = row?.hasResume ? 1 : 0;
  const p132HasResume = Boolean(fixPlan.currentState.questionnaireResume.hasResume);
  const recommendedJob = context.publishedJobs.find((job) => job.jobId === P133_RECOMMENDED_JOB_ID);

  const alternatives = buildAlternativePublishedJobs({
    publishedJobs: context.publishedJobs,
    candidateCity: row?.city ?? null,
    candidateState: row?.state ?? null,
    recommendedJobId: P133_RECOMMENDED_JOB_ID,
  });

  const jobRemediation = buildJobRemediation({
    currentState: fixPlan.currentState,
    alternatives,
    recommendedJobTitle: recommendedJob?.name ?? fixPlan.currentState.breezyJob.recommendedPositionTitle,
  });

  const remainingFixes = buildRemainingFixes({
    currentState: fixPlan.currentState,
    fixPlan,
    jobRemediation,
    p132HasResume,
  });

  const failedGates = buildFailedGates({
    verification: verification.verification,
    p124: verification.p124Approval,
    p122: verification.p122PilotReadiness,
    hasResume: p132HasResume,
  });

  const passedGateCount = failedGates.filter((gate) => gate.passed).length;
  const failedGateCount = failedGates.length - passedGateCount;

  const safestFixPlan =
    jobRemediation.action === "reassign_to_recommended"
      ? "Keep P109 mapping to 93ebc05539b8 (already published). Raise confidence to 80%+, assign recruiter, mark paperwork-ready, then reassign Tyree in Breezy to the published recommended job. Do not republish the closed ad or remap unless ops rejects the current posting."
      : jobRemediation.action === "remap_to_alternative"
        ? `Remap P109 to ${jobRemediation.recommendedJobId}, reassign Tyree, then complete recruiter and paperwork-ready fixes.`
        : "Complete paperwork-ready, recruiter, and mapping confidence fixes; resolve published job gate before pilot.";

  let goNoGo: TyreeRemainingPilotBlockersReport["goNoGo"] = "NO-GO";
  let goNoGoReason = `${failedGateCount} gate(s) still failing after P132 resume fix.`;

  if (fixPlan.simulation.postFixDecision === "AUTO_APPROVED" && fixPlan.simulation.postFixScore >= fixPlan.policy.autoApproveThreshold) {
    goNoGo = pilotConfig.liveModeEnabled && pilotConfig.pilotEnabled ? "GO WITH CONDITIONS" : "GO WITH CONDITIONS";
    goNoGoReason =
      "Remaining blockers are well-defined manual fixes — simulated post-fix reaches AUTO_APPROVED. Apply fixes, re-sync, re-validate; enable pilot env only after P131 passes.";
  } else if (verification.p124Approval.safetyReasons.length > 0) {
    goNoGo = "NO-GO";
    goNoGoReason = "Safety reasons block AUTO_APPROVED path.";
  }

  return {
    sourcePhase: P133_SOURCE_PHASE,
    generatedAt: new Date().toISOString(),
    mode: P133_ANALYSIS_MODE,
    targetCandidateId: P133_TARGET_CANDIDATE_ID,
    targetCandidateName: P133_TARGET_CANDIDATE_NAME,
    recommendedJobId: P133_RECOMMENDED_JOB_ID,
    p132ResumeFix: {
      applied: p132HasResume,
      hasResume: fixPlan.currentState.questionnaireResume.hasResume,
      paperworkReady: fixPlan.currentState.questionnaireResume.paperworkReady,
      resumeAssetsCount,
      detail: p132HasResume
        ? "P132 resolved resume detection — remaining gap is paperworkReady grade, not missing PDF."
        : "Resume not yet reflected in workflow row — re-run P132 enrichment sync first.",
    },
    currentScore: fixPlan.currentState.approvalScore,
    currentDecision: fixPlan.currentState.approvalDecision,
    scoreGapToAutoApprove: fixPlan.currentState.scoreGapToAutoApprove,
    failedGates,
    passedGateCount,
    failedGateCount,
    remainingFixes,
    manualSteps: flattenManualSteps(remainingFixes),
    softwareSteps: buildSoftwareSteps(),
    jobRemediation,
    alternativePublishedJobs: alternatives,
    recruiterAssignment: fixPlan.currentState.recruiterAssignment,
    mappingConfidence: {
      current: fixPlan.currentState.mappingConfidence,
      required: MAPPING_CONFIDENCE_MIN,
      p109Decision: fixPlan.currentState.projectMapping.p109Decision,
      approvedMappingQualifies: fixPlan.currentState.projectMapping.approvedMappingQualifies,
    },
    p124Approval: verification.p124Approval,
    p122PilotReadiness: {
      status: verification.p122PilotReadiness.status,
      readyToSend: verification.p122PilotReadiness.readyToSend,
      mappingSource: verification.p122PilotReadiness.mappingSource,
      blockingReasons: verification.p122PilotReadiness.blockingReasons,
      candidateSafetyPassed: verification.p122PilotReadiness.candidateSafetyPassed,
    },
    safestFixPlan,
    expectedPostFixScore: fixPlan.simulation.postFixScore,
    expectedPostFixDecision: fixPlan.simulation.postFixDecision,
    simulationSteps: fixPlan.simulation.steps.map((step) => ({
      fixId: step.fixId,
      title: step.title,
      simulatedScore: step.simulatedScore,
      simulatedDecision: step.simulatedDecision,
      scoreDelta: step.scoreDelta,
    })),
    goNoGo,
    goNoGoReason,
    executeBatchCalled: false,
    breezyWrites: false,
    liveModeEnabled: pilotConfig.liveModeEnabled,
    paperworkSent: false,
    thresholdChanged: false,
  };
}
