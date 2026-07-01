import { DEFAULT_PAPERWORK_BY_GRADE } from "@/lib/candidate-onboarding-engine/paperwork-grade-policy";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import { validateCohortEmail } from "@/lib/test-cohort-validation/validate-cohort-contact";
import { buildApprovalDecisionsFromContext } from "@/lib/autonomous-paperwork-approval-engine/build-approval-report";
import { buildApprovalPolicy } from "@/lib/autonomous-paperwork-approval-engine/build-approval-policy";
import { evaluateApprovalDecision } from "@/lib/autonomous-paperwork-approval-engine/evaluate-approval-decision";
import { scoreApprovalConfidence } from "@/lib/autonomous-paperwork-approval-engine/score-approval-confidence";
import type { ApprovalPolicy, CandidateApprovalRecord } from "@/lib/autonomous-paperwork-approval-engine/types";
import {
  daysSince,
  evaluateCandidateEligibility,
} from "@/lib/autonomous-paperwork-orchestrator/evaluate-eligibility";
import { loadPaperworkCandidates, type LoadedPaperworkCandidates } from "@/lib/autonomous-paperwork-orchestrator/load-candidates";
import { loadPilotConfig } from "@/lib/p122-controlled-live-paperwork-pilot/pilot-config";
import type {
  AutoApprovalGapAnalysisReport,
  BlockerCategory,
  NearReadyCandidateGap,
} from "@/lib/p129-auto-approval-gap-analysis/types";
import { P129_ANALYSIS_MODE, P129_SOURCE_PHASE } from "@/lib/p129-auto-approval-gap-analysis/types";

const NEAR_READY_MIN_SCORE = 70;

function classifyBlocker(input: {
  approval: CandidateApprovalRecord;
  exactBlocker: string;
  nativePublishedJob: boolean;
  approvedMappingQualifies: boolean;
  mappingConfidence: number;
  policy: ApprovalPolicy;
}): BlockerCategory {
  const blocker = input.exactBlocker.toLowerCase();
  if (
    input.approval.approvalDecision === "REJECTED_FOR_SAFETY" ||
    input.approval.safetyReasons.length > 0 ||
    /already sent|duplicate|invalid email|manual rejection|rejected mapping/i.test(blocker)
  ) {
    return "safety_issue";
  }
  if (/missing template|no template/i.test(blocker)) return "template_issue";
  if (
    /mapping|published job|native|approved mapping|project|no_project/i.test(blocker) ||
    (!input.nativePublishedJob && !input.approvedMappingQualifies)
  ) {
    return "mapping_issue";
  }
  if (
    /threshold|mapping confidence below|human sign-off|human review|policy|score \d+ below auto/i.test(
      blocker,
    )
  ) {
    return "policy_issue";
  }
  return "data_issue";
}

function buildMissingRequirements(input: {
  row: import("@/lib/build-candidate-workflow-row").ScoredCandidateWorkflowRow | null;
  templateKey: string | null;
  nativePublishedJob: boolean;
  approvedMappingQualifies: boolean;
  mappingConfidence: number;
  factors: Record<string, number>;
  policy: ApprovalPolicy;
  currentScore: number;
}): string[] {
  const missing: string[] = [];
  const email = input.row?.email?.trim() ?? "";
  if (!email || !validateCohortEmail(email).valid) missing.push("Valid email on file");
  if (!input.templateKey) missing.push("Paperwork template assigned");
  if (!input.nativePublishedJob && !input.approvedMappingQualifies) {
    missing.push("Published native job or approved P109 mapping that qualifies");
  }
  if (!input.factors.questionnaire) missing.push("Questionnaire / resume complete");
  if (!input.factors.recruiter) missing.push("Recruiter assigned");
  if (!input.factors.dm) missing.push("DM assigned");
  if (input.mappingConfidence < 80) {
    missing.push(`Mapping confidence at ${input.mappingConfidence}% (auto threshold 80%)`);
  }
  const gap = Math.max(0, input.policy.autoApproveThreshold - input.currentScore);
  if (gap > 0) {
    missing.push(
      `${gap} more approval score points needed (current ${input.currentScore}, threshold ${input.policy.autoApproveThreshold})`,
    );
  }
  return missing;
}

function resolveExactBlocker(input: {
  approval: CandidateApprovalRecord;
  scoreGap: number;
  mappingConfidence: number;
  nativePublishedJob: boolean;
  approvedMappingQualifies: boolean;
  eligibilityStatus: string;
  policy: ApprovalPolicy;
}): string {
  if (input.approval.approvalDecision === "AUTO_APPROVED") {
    return "None — candidate is AUTO_APPROVED.";
  }

  if (input.approval.safetyReasons.length > 0) {
    return input.approval.safetyReasons[0] ?? "Critical safety failure.";
  }

  if (input.approval.humanReviewReasons.includes("Mapping confidence below auto threshold")) {
    return `Mapping confidence ${input.mappingConfidence}% is below auto-approval threshold (80%).`;
  }

  if (input.approval.humanReviewReasons.includes("Closed-ad recovery requires human sign-off")) {
    return "Closed-ad recovery (READY_AFTER_APPROVAL) requires human sign-off per policy.";
  }

  if (input.approval.blockingReasons.includes("Missing approved mapping or native active project")) {
    return "Missing approved mapping or native active project.";
  }

  if (input.scoreGap > 0 && input.approval.approvalScore < input.policy.autoApproveThreshold) {
    return `Approval score ${input.approval.approvalScore} is below AUTO_APPROVED threshold ${input.policy.autoApproveThreshold}.`;
  }

  if (input.approval.humanReviewReasons.length > 0) {
    return input.approval.humanReviewReasons[0] ?? "Human review required by policy.";
  }

  if (input.approval.blockingReasons.length > 0) {
    return input.approval.blockingReasons[0] ?? "Blocked by prerequisites.";
  }

  return `Eligibility status ${input.eligibilityStatus} prevents AUTO_APPROVED.`;
}

function buildRemediationSteps(input: {
  blockerCategory: BlockerCategory;
  exactBlocker: string;
  missingRequirements: string[];
  mappingConfidence: number;
  nativePublishedJob: boolean;
  approvedMappingQualifies: boolean;
}): string[] {
  const steps: string[] = [];

  if (input.blockerCategory === "safety_issue") {
    steps.push("Resolve safety failure before any approval policy change.");
    if (/duplicate/i.test(input.exactBlocker)) steps.push("Confirm candidate is not a duplicate record.");
    if (/already sent/i.test(input.exactBlocker)) steps.push("Verify paperwork was not already sent.");
    if (/invalid email/i.test(input.exactBlocker)) steps.push("Correct candidate email in source system.");
    return steps;
  }

  if (input.blockerCategory === "template_issue") {
    steps.push("Assign paperwork template via grade policy or onboarding configuration.");
    return steps;
  }

  if (input.blockerCategory === "mapping_issue") {
    if (!input.nativePublishedJob && !input.approvedMappingQualifies) {
      steps.push("Publish a native Breezy job for the candidate's position OR complete P109 mapping review approval.");
    }
    if (input.mappingConfidence < 80) {
      steps.push("Raise mapping confidence to 80%+ via approved mapping review or verified job match.");
    }
    steps.push("Re-run P110 approved-mapping dry-run to confirm overlay eligibility.");
    return steps;
  }

  if (input.blockerCategory === "policy_issue") {
    if (/score .* below/i.test(input.exactBlocker)) {
      steps.push("Improve candidate data completeness to gain 7+ approval score points, OR review whether autoApproveThreshold=90 is appropriate for pilot.");
    }
    if (/mapping confidence/i.test(input.exactBlocker)) {
      steps.push("Increase mapping confidence to 80%+ — policy demotes AUTO_APPROVED below that level.");
    }
    if (/human sign-off/i.test(input.exactBlocker)) {
      steps.push("Complete human sign-off for closed-ad recovery candidate before autonomous send.");
    }
    return steps;
  }

  for (const requirement of input.missingRequirements) {
    steps.push(`Resolve data gap: ${requirement}`);
  }
  if (steps.length === 0) steps.push("Complete missing onboarding and assignment fields.");
  return steps;
}

function analyzeNearReadyCandidate(input: {
  context: LoadedPaperworkCandidates;
  candidateId: string;
  policy: ApprovalPolicy;
}): NearReadyCandidateGap | null {
  const row = input.context.rowsByCandidateId.get(input.candidateId) ?? null;
  const approvedMapping = input.context.approvedMappingsByCandidate.get(input.candidateId) ?? null;
  const p109Record = input.context.p109ByCandidate.get(input.candidateId) ?? null;
  const eligibility = evaluateCandidateEligibility({
    candidateId: input.candidateId,
    row,
    context: input.context,
    paperworkByGrade: DEFAULT_PAPERWORK_BY_GRADE,
    approvedMapping,
  });

  const nativePublishedJob = Boolean(row?.positionId && input.context.jobsByPositionId.has(row.positionId));
  const alreadySent =
    eligibility.status === "ALREADY_SENT" ||
    input.context.p100SentIds.has(input.candidateId) ||
    input.context.pilotSentIds.has(input.candidateId);
  const duplicateRisk = eligibility.status === "DUPLICATE";

  const approval = evaluateApprovalDecision({
    candidateId: input.candidateId,
    candidateName: row ? `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim() || input.candidateId : input.candidateId,
    row,
    eligibilityStatus: eligibility.status,
    templateKey: eligibility.templateKey,
    mappingConfidence: eligibility.mappingConfidence,
    approvedMapping,
    p109Record,
    nativePublishedJob,
    alreadySent,
    duplicateRisk,
    candidateAgeDays: daysSince(row?.createdDate ?? null),
    policy: input.policy,
  });

  if (approval.approvalScore < NEAR_READY_MIN_SCORE) return null;

  const scoring = scoreApprovalConfidence({
    row,
    templateKey: eligibility.templateKey,
    mappingConfidence: eligibility.mappingConfidence,
    approvedMapping,
    p109Record,
    nativePublishedJob,
    alreadySent,
    duplicateRisk,
    candidateAgeDays: daysSince(row?.createdDate ?? null),
    policy: input.policy,
  });

  const scoreGap = Math.max(0, input.policy.autoApproveThreshold - approval.approvalScore);
  const missingRequirements = buildMissingRequirements({
    row,
    templateKey: eligibility.templateKey,
    nativePublishedJob,
    approvedMappingQualifies: Boolean(approvedMapping?.qualifies),
    mappingConfidence: eligibility.mappingConfidence,
    factors: scoring.factors,
    policy: input.policy,
    currentScore: approval.approvalScore,
  });

  const exactBlocker = resolveExactBlocker({
    approval,
    scoreGap,
    mappingConfidence: eligibility.mappingConfidence,
    nativePublishedJob,
    approvedMappingQualifies: Boolean(approvedMapping?.qualifies),
    eligibilityStatus: eligibility.status,
    policy: input.policy,
  });

  const blockerCategory = classifyBlocker({
    approval,
    exactBlocker,
    nativePublishedJob,
    approvedMappingQualifies: Boolean(approvedMapping?.qualifies),
    mappingConfidence: eligibility.mappingConfidence,
    policy: input.policy,
  });

  return {
    candidateId: input.candidateId,
    candidateName: approval.candidateName,
    email: approval.email,
    approvalScore: approval.approvalScore,
    currentDecision: approval.approvalDecision,
    scoreGapToAutoApprove: scoreGap,
    missingRequirements,
    failedSafetyChecks: approval.safetyReasons,
    humanReviewReasons: approval.humanReviewReasons,
    exactBlockerPreventingAutoApproved: exactBlocker,
    blockerCategory,
    mappingConfidence: eligibility.mappingConfidence,
    nativePublishedJob,
    approvedMappingQualifies: Boolean(approvedMapping?.qualifies),
    eligibilityStatus: eligibility.status,
    remediationSteps: buildRemediationSteps({
      blockerCategory,
      exactBlocker,
      missingRequirements,
      mappingConfidence: eligibility.mappingConfidence,
      nativePublishedJob,
      approvedMappingQualifies: Boolean(approvedMapping?.qualifies),
    }),
  };
}

function summarizeTopBlockers(
  candidates: NearReadyCandidateGap[],
): AutoApprovalGapAnalysisReport["topBlockers"] {
  const counts = new Map<string, { count: number; category: BlockerCategory }>();
  for (const candidate of candidates) {
    const key = candidate.exactBlockerPreventingAutoApproved;
    const existing = counts.get(key);
    if (existing) existing.count += 1;
    else counts.set(key, { count: 1, category: candidate.blockerCategory });
  }
  return [...counts.entries()]
    .map(([reason, value]) => ({ reason, count: value.count, category: value.category }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);
}

export async function buildAutoApprovalGapAnalysis(input?: {
  contextOverride?: LoadedPaperworkCandidates;
  nearReadyMinScore?: number;
}): Promise<AutoApprovalGapAnalysisReport> {
  const policy = buildApprovalPolicy();
  const minScore = input?.nearReadyMinScore ?? NEAR_READY_MIN_SCORE;
  const context = input?.contextOverride ?? (await loadPaperworkCandidates({ mtdOnly: false }));
  const pilotConfig = loadPilotConfig();

  const nearReadyCandidates = context.candidateIds
    .map((candidateId) => analyzeNearReadyCandidate({ context, candidateId, policy }))
    .filter((entry): entry is NearReadyCandidateGap => entry !== null && entry.approvalScore >= minScore)
    .sort((a, b) => b.approvalScore - a.approvalScore);

  const allApprovalDecisions = buildApprovalDecisionsFromContext(context);
  const autoApprovedCount = allApprovalDecisions.filter((d) => d.approvalDecision === "AUTO_APPROVED").length;

  const scoreOnlyBlockedCount = nearReadyCandidates.filter(
    (c) =>
      c.scoreGapToAutoApprove > 0 &&
      c.scoreGapToAutoApprove <= 10 &&
      c.blockerCategory !== "safety_issue" &&
      c.mappingConfidence >= 80,
  ).length;

  const demotedDespiteHighScoreCount = nearReadyCandidates.filter(
    (c) => c.approvalScore >= policy.autoApproveThreshold && c.currentDecision !== "AUTO_APPROVED",
  ).length;

  const wouldAutoApproveAtThreshold80 = nearReadyCandidates.filter(
    (c) => c.approvalScore >= 80 && c.currentDecision !== "AUTO_APPROVED" && c.failedSafetyChecks.length === 0,
  ).length;

  const missingEmailCount = nearReadyCandidates.filter((c) => c.failedSafetyChecks.some((r) => /email/i.test(r))).length;
  const missingTemplateCount = nearReadyCandidates.filter((c) => c.blockerCategory === "template_issue").length;
  const missingQuestionnaireCount = nearReadyCandidates.filter((c) =>
    c.missingRequirements.some((r) => /questionnaire|resume/i.test(r)),
  ).length;
  const unassignedRecruiterCount = nearReadyCandidates.filter((c) =>
    c.missingRequirements.some((r) => /Recruiter assigned/i.test(r)),
  ).length;

  const mappingBlockedCount = nearReadyCandidates.filter((c) => c.blockerCategory === "mapping_issue").length;
  const policyBlockedCount = nearReadyCandidates.filter((c) => c.blockerCategory === "policy_issue").length;

  const isPolicyTooStrict =
    autoApprovedCount === 0 &&
    scoreOnlyBlockedCount >= Math.max(1, Math.floor(nearReadyCandidates.length * 0.3)) &&
    mappingBlockedCount < nearReadyCandidates.length * 0.5;

  const safest = nearReadyCandidates.find((c) => c.blockerCategory !== "safety_issue") ?? nearReadyCandidates[0] ?? null;

  let goNoGo: AutoApprovalGapAnalysisReport["goNoGo"] = "GO WITH CONDITIONS";
  let goNoGoReason =
    "Gap analysis complete — candidate data and mapping gaps must be resolved before first AUTO_APPROVED.";

  if (autoApprovedCount > 0) {
    goNoGo = "GO";
    goNoGoReason = `${autoApprovedCount} candidate(s) already AUTO_APPROVED.`;
  } else if (nearReadyCandidates.length === 0) {
    goNoGo = "NO-GO";
    goNoGoReason = "No candidates score 70+ — approval pipeline has no near-ready cohort.";
  } else if (safest && safest.scoreGapToAutoApprove <= 7 && safest.mappingConfidence >= 80) {
    goNoGo = "GO WITH CONDITIONS";
    goNoGoReason = `Near-ready candidate ${safest.candidateName} is within ${safest.scoreGapToAutoApprove} points of AUTO_APPROVED.`;
  } else if (mappingBlockedCount > nearReadyCandidates.length * 0.6) {
    goNoGo = "NO-GO";
    goNoGoReason = "Majority of near-ready candidates blocked by mapping/project gaps — fix data before policy changes.";
  }

  return {
    sourcePhase: P129_SOURCE_PHASE,
    generatedAt: new Date().toISOString(),
    mode: P129_ANALYSIS_MODE,
    policy,
    summary: {
      totalCandidatesEvaluated: context.candidateIds.length,
      autoApprovedCount,
      nearReadyCount: nearReadyCandidates.length,
      scoreThreshold: policy.autoApproveThreshold,
    },
    nearReadyCandidates,
    topBlockers: summarizeTopBlockers(nearReadyCandidates),
    policyFindings: {
      isPolicyTooStrict,
      scoreOnlyBlockedCount,
      demotedDespiteHighScoreCount,
      wouldAutoApproveAtThreshold80,
      primaryPolicyFriction: [
        `autoApproveThreshold=${policy.autoApproveThreshold}`,
        "mapping confidence < 80% demotes AUTO_APPROVED to NEEDS_HUMAN_APPROVAL",
        "READY_AFTER_APPROVAL requires human sign-off",
        "requireApprovedMappingOrNativeProject=true",
      ],
      conclusion: isPolicyTooStrict
        ? "Policy threshold contributes to zero AUTO_APPROVED, but mapping/data gaps are also present — do not lower threshold without fixing mapping gates."
        : mappingBlockedCount >= policyBlockedCount
          ? "Zero AUTO_APPROVED is primarily a mapping/project data issue, not threshold alone."
          : "Zero AUTO_APPROVED is a mix of score threshold and post-score policy demotions.",
    },
    dataQualityFindings: {
      missingEmailCount,
      missingTemplateCount,
      missingQuestionnaireCount,
      unassignedRecruiterCount,
      primaryDataGaps: [
        missingEmailCount > 0 ? `${missingEmailCount} near-ready with email issues` : null,
        missingTemplateCount > 0 ? `${missingTemplateCount} near-ready missing template` : null,
        missingQuestionnaireCount > 0 ? `${missingQuestionnaireCount} near-ready missing questionnaire` : null,
        unassignedRecruiterCount > 0 ? `${unassignedRecruiterCount} near-ready without recruiter` : null,
        mappingBlockedCount > 0 ? `${mappingBlockedCount} near-ready blocked by mapping/project` : null,
      ].filter((value): value is string => Boolean(value)),
      conclusion:
        mappingBlockedCount > 0
          ? "Candidate project/mapping linkage is the dominant data quality gap for near-ready cohort."
          : "Near-ready candidates lack score completeness more than critical data corruption.",
    },
    safestPathToFirstAutoApproved: safest
      ? {
          candidateId: safest.candidateId,
          candidateName: safest.candidateName,
          currentScore: safest.approvalScore,
          steps: safest.remediationSteps,
          estimatedEffort:
            safest.scoreGapToAutoApprove <= 7 && safest.mappingConfidence >= 80
              ? "low"
              : safest.blockerCategory === "mapping_issue"
                ? "high"
                : "medium",
        }
      : {
          candidateId: null,
          candidateName: null,
          currentScore: null,
          steps: ["No near-ready candidates — improve baseline candidate data quality first."],
          estimatedEffort: "high",
        },
    goNoGo,
    goNoGoReason,
    executeBatchCalled: false,
    breezyWrites: false,
    liveModeEnabled: pilotConfig.liveModeEnabled,
    paperworkSent: false,
  };
}
