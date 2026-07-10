import { DEFAULT_PAPERWORK_BY_GRADE } from "@/lib/candidate-onboarding-engine/paperwork-grade-policy";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import { validateCohortEmail } from "@/lib/test-cohort-validation/validate-cohort-contact";
import { buildApprovalPolicy } from "@/lib/autonomous-paperwork-approval-engine/build-approval-policy";
import { evaluateApprovalDecision } from "@/lib/autonomous-paperwork-approval-engine/evaluate-approval-decision";
import { scoreApprovalConfidence } from "@/lib/autonomous-paperwork-approval-engine/score-approval-confidence";
import type { ApprovalPolicy } from "@/lib/autonomous-paperwork-approval-engine/types";
import {
  daysSince,
  evaluateCandidateEligibility,
} from "@/lib/autonomous-paperwork-orchestrator/evaluate-eligibility";
import { loadPaperworkCandidates, type LoadedPaperworkCandidates } from "@/lib/autonomous-paperwork-orchestrator/load-candidates";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { classifyPaperworkBlocker } from "@/lib/p106-autonomous-paperwork-engine/classify-paperwork-blocker";
import { loadPilotConfig } from "@/lib/p122-controlled-live-paperwork-pilot/pilot-config";
import { resolveApprovedMapping } from "@/lib/p110-approved-mapping-integration/resolve-approved-mapping";
import type { ApprovedMappingResolution } from "@/lib/p110-approved-mapping-integration/types";
import type {
  CandidateRemediationPlan,
  PaperworkRemediationEngineReport,
  RemediationBlocker,
  RemediationBlockerId,
  RemediationTier,
} from "@/lib/p134-paperwork-remediation-engine/types";
import { P134_ANALYSIS_MODE, P134_SOURCE_PHASE } from "@/lib/p134-paperwork-remediation-engine/types";

const MAPPING_CONFIDENCE_MIN = 80;

type CandidateAnalysisContext = {
  candidateId: string;
  row: ScoredCandidateWorkflowRow | null;
  approvedMapping: ApprovedMappingResolution | null;
  eligibility: ReturnType<typeof evaluateCandidateEligibility>;
  approval: ReturnType<typeof evaluateApprovalDecision>;
  scoring: ReturnType<typeof scoreApprovalConfidence>;
  p106: ReturnType<typeof classifyPaperworkBlocker>;
  nativePublishedJob: boolean;
  closedJob: boolean;
  recommendedJobPublished: boolean;
  policy: ApprovalPolicy;
};

function cloneRow(row: ScoredCandidateWorkflowRow): ScoredCandidateWorkflowRow {
  return {
    ...row,
    candidateGrade: row.candidateGrade ? { ...row.candidateGrade } : row.candidateGrade,
  };
}

function evaluateCandidate(input: {
  context: LoadedPaperworkCandidates;
  candidateId: string;
  policy: ApprovalPolicy;
  rowOverride?: ScoredCandidateWorkflowRow;
  mappingConfidenceOverride?: number;
  approvedMappingOverride?: ApprovedMappingResolution | null;
}): CandidateAnalysisContext {
  const row = input.rowOverride ?? input.context.rowsByCandidateId.get(input.candidateId) ?? null;
  const approvedMapping =
    input.approvedMappingOverride ??
    input.context.approvedMappingsByCandidate.get(input.candidateId) ??
    resolveApprovedMapping({
      record: input.context.p109ByCandidate.get(input.candidateId) ?? null,
      candidateId: input.candidateId,
      closedPositionId: row?.positionId ?? null,
      publishedJobTitleById: input.context.publishedJobTitleById,
    });

  const mappingConfidence = input.mappingConfidenceOverride ?? approvedMapping?.confidenceScore ?? 0;
  const eligibility = evaluateCandidateEligibility({
    candidateId: input.candidateId,
    row,
    context: input.context,
    paperworkByGrade: DEFAULT_PAPERWORK_BY_GRADE,
    approvedMapping,
  });

  const nativePublishedJob = Boolean(
    row?.positionId?.trim() &&
      (input.context.jobsByPositionId.has(row.positionId) ||
        input.context.publishedJobs.some(
          (job) => job.jobId === row.positionId && job.status === "published",
        )),
  );
  const closedJob = Boolean(row?.positionId && input.context.closedJobsByPositionId.has(row.positionId));
  const recommendedPositionId = approvedMapping?.recommendedPositionId ?? null;
  const recommendedJobPublished = recommendedPositionId
    ? input.context.publishedJobs.some((job) => job.jobId === recommendedPositionId && job.status === "published")
    : false;

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
    mappingConfidence,
    approvedMapping,
    p109Record: input.context.p109ByCandidate.get(input.candidateId) ?? null,
    nativePublishedJob,
    alreadySent,
    duplicateRisk,
    candidateAgeDays: daysSince(row?.createdDate ?? null),
    policy: input.policy,
  });

  const scoring = scoreApprovalConfidence({
    row,
    templateKey: eligibility.templateKey,
    mappingConfidence,
    approvedMapping,
    p109Record: input.context.p109ByCandidate.get(input.candidateId) ?? null,
    nativePublishedJob,
    alreadySent,
    duplicateRisk,
    candidateAgeDays: daysSince(row?.createdDate ?? null),
    policy: input.policy,
  });

  const p106 = classifyPaperworkBlocker({
    row,
    onboarding: input.context.onboardingByCandidateId.get(input.candidateId) ?? null,
    jobsByPositionId: input.context.jobsByPositionId,
    closedJobsByPositionId: input.context.closedJobsByPositionId,
    publishedJobs: input.context.publishedJobs,
    paperworkByGrade: DEFAULT_PAPERWORK_BY_GRADE,
    p100SentIds: input.context.p100SentIds,
  });

  return {
    candidateId: input.candidateId,
    row,
    approvedMapping,
    eligibility,
    approval,
    scoring,
    p106,
    nativePublishedJob,
    closedJob,
    recommendedJobPublished,
    policy: input.policy,
  };
}

function simulateAfterBlockerFix(input: {
  context: LoadedPaperworkCandidates;
  analysis: CandidateAnalysisContext;
  blockerId: RemediationBlockerId;
}): ReturnType<typeof evaluateApprovalDecision> {
  const row = input.analysis.row ? cloneRow(input.analysis.row) : null;
  let mappingConfidence = input.analysis.approvedMapping?.confidenceScore ?? 0;
  let approvedMapping = input.analysis.approvedMapping;

  if (!row) return input.analysis.approval;

  switch (input.blockerId) {
    case "recruiter_assignment_missing":
      row.assignedRecruiter = "Assigned Recruiter";
      break;
    case "paperwork_ready_missing":
      row.candidateGrade = { ...(row.candidateGrade ?? {}), paperworkReady: true };
      break;
    case "resume_missing":
    case "questionnaire_incomplete":
      row.hasResume = true;
      row.candidateGrade = { ...(row.candidateGrade ?? {}), paperworkReady: true };
      break;
    case "mapping_confidence_below_threshold":
      mappingConfidence = Math.max(MAPPING_CONFIDENCE_MIN, mappingConfidence);
      if (approvedMapping) approvedMapping = { ...approvedMapping, confidenceScore: mappingConfidence };
      break;
    case "unpublished_closed_job":
    case "missing_published_replacement":
    case "project_mapping_issue":
      if (approvedMapping?.recommendedPositionId) {
        row.positionId = approvedMapping.recommendedPositionId;
        row.positionName =
          approvedMapping.recommendedPositionTitle ??
          input.context.publishedJobTitleById.get(approvedMapping.recommendedPositionId) ??
          row.positionName;
        approvedMapping = null;
      }
      break;
    default:
      break;
  }

  return evaluateCandidate({
    context: input.context,
    candidateId: input.analysis.candidateId,
    policy: input.analysis.policy,
    rowOverride: row,
    mappingConfidenceOverride: mappingConfidence,
    approvedMappingOverride: approvedMapping,
  }).approval;
}

function buildBlocker(
  id: RemediationBlockerId,
  input: {
    analysis: CandidateAnalysisContext;
    context: LoadedPaperworkCandidates;
    label: string;
    severity: RemediationBlocker["severity"];
    owner: RemediationBlocker["owner"];
    systemCapable: boolean;
    manualActionRequired: boolean;
    estimatedMinutesToResolve: number;
    expectedScoreImprovement: number;
    detail: string;
    remediationSteps: string[];
  },
): RemediationBlocker {
  const afterFix = simulateAfterBlockerFix({
    context: input.context,
    analysis: input.analysis,
    blockerId: id,
  });

  return {
    id,
    label: input.label,
    severity: input.severity,
    owner: input.owner,
    systemCapable: input.systemCapable,
    manualActionRequired: input.manualActionRequired,
    estimatedMinutesToResolve: input.estimatedMinutesToResolve,
    expectedScoreImprovement: input.expectedScoreImprovement,
    expectedDecisionAfterFix: afterFix.approvalDecision,
    detail: input.detail,
    remediationSteps: input.remediationSteps,
  };
}

function detectRemediationBlockers(input: {
  context: LoadedPaperworkCandidates;
  analysis: CandidateAnalysisContext;
}): RemediationBlocker[] {
  const { analysis, context } = input;
  const { row, scoring, approval, p106 } = analysis;
  const blockers: RemediationBlocker[] = [];
  const factors = scoring.factors;

  if (p106.category === "already_sent" || approval.safetyReasons.some((r) => /already sent/i.test(r))) {
    blockers.push(
      buildBlocker("already_sent", {
        analysis,
        context,
        label: "Paperwork already sent",
        severity: "critical",
        owner: "operations",
        systemCapable: false,
        manualActionRequired: false,
        estimatedMinutesToResolve: 0,
        expectedScoreImprovement: 0,
        detail: p106.reason,
        remediationSteps: ["Verify signature status — no resend without ops review."],
      }),
    );
  }

  if (p106.category === "duplicate_risk" || approval.safetyReasons.some((r) => /duplicate/i.test(r))) {
    blockers.push(
      buildBlocker("duplicate_risk", {
        analysis,
        context,
        label: "Duplicate risk",
        severity: "critical",
        owner: "operations",
        systemCapable: false,
        manualActionRequired: true,
        estimatedMinutesToResolve: 30,
        expectedScoreImprovement: 0,
        detail: p106.reason,
        remediationSteps: ["Confirm candidate is not a duplicate record in Breezy / recruiting sheet."],
      }),
    );
  }

  const email = row?.email?.trim() ?? "";
  if (!email || !validateCohortEmail(email).valid || p106.category === "invalid_email") {
    blockers.push(
      buildBlocker("invalid_email", {
        analysis,
        context,
        label: "Invalid or missing email",
        severity: "critical",
        owner: "recruiter",
        systemCapable: false,
        manualActionRequired: true,
        estimatedMinutesToResolve: 10,
        expectedScoreImprovement: factors.validEmail ? 0 : 10,
        detail: email ? `Invalid email: ${email}` : "Missing candidate email",
        remediationSteps: ["Correct candidate email in Breezy and re-sync ingestion."],
      }),
    );
  }

  if (!factors.template || analysis.eligibility.templateKey == null) {
    blockers.push(
      buildBlocker("template_missing", {
        analysis,
        context,
        label: "Paperwork template missing",
        severity: "high",
        owner: "operations",
        systemCapable: true,
        manualActionRequired: true,
        estimatedMinutesToResolve: 15,
        expectedScoreImprovement: 10,
        detail: "No paperwork template assigned for candidate grade.",
        remediationSteps: ["Assign onboarding_packet or grade-appropriate template in grade policy."],
      }),
    );
  }

  if (!row?.hasResume) {
    blockers.push(
      buildBlocker("resume_missing", {
        analysis,
        context,
        label: "Resume missing",
        severity: "high",
        owner: "candidate",
        systemCapable: true,
        manualActionRequired: true,
        estimatedMinutesToResolve: 20,
        expectedScoreImprovement: 10,
        detail: "Candidate has no resume on file.",
        remediationSteps: [
          "Obtain resume or fetch Breezy /documents and /resume endpoints (P132 path).",
          "Re-run ingestion enrichment sync locally.",
        ],
      }),
    );
  } else if (row.candidateGrade?.paperworkReady === false) {
    blockers.push(
      buildBlocker("paperwork_ready_missing", {
        analysis,
        context,
        label: "Paperwork-ready flag missing",
        severity: "medium",
        owner: "recruiter",
        systemCapable: false,
        manualActionRequired: true,
        estimatedMinutesToResolve: 10,
        expectedScoreImprovement: 10,
        detail: "Resume present but candidateGrade.paperworkReady is false.",
        remediationSteps: [
          "Mark candidate paperwork-ready in recruiting workflow.",
          "Re-sync local workflow row after grade update.",
        ],
      }),
    );
  } else if (!factors.questionnaire) {
    blockers.push(
      buildBlocker("questionnaire_incomplete", {
        analysis,
        context,
        label: "Questionnaire incomplete",
        severity: "medium",
        owner: "candidate",
        systemCapable: true,
        manualActionRequired: true,
        estimatedMinutesToResolve: 20,
        expectedScoreImprovement: 10,
        detail: "Questionnaire / resume completeness factor not met.",
        remediationSteps: ["Complete questionnaire intake and re-sync enrichment."],
      }),
    );
  }

  if (row && isUnassignedRecruiter(row.assignedRecruiter)) {
    blockers.push(
      buildBlocker("recruiter_assignment_missing", {
        analysis,
        context,
        label: "Recruiter not assigned",
        severity: "medium",
        owner: "recruiter",
        systemCapable: false,
        manualActionRequired: true,
        estimatedMinutesToResolve: 5,
        expectedScoreImprovement: 5,
        detail: `Recruiter: ${row.assignedRecruiter ?? "Unassigned"}`,
        remediationSteps: ["Assign owning recruiter in Breezy / recruiting sheet."],
      }),
    );
  }

  const mappingConfidence = analysis.approvedMapping?.confidenceScore ?? analysis.eligibility.mappingConfidence;
  if (mappingConfidence < MAPPING_CONFIDENCE_MIN) {
    blockers.push(
      buildBlocker("mapping_confidence_below_threshold", {
        analysis,
        context,
        label: "Mapping confidence below 80%",
        severity: "high",
        owner: "mapping_reviewer",
        systemCapable: false,
        manualActionRequired: true,
        estimatedMinutesToResolve: 20,
        expectedScoreImprovement: Math.max(
          0,
          Math.min(10, Math.round(MAPPING_CONFIDENCE_MIN / 10)) - Math.min(10, Math.round(mappingConfidence / 10)),
        ),
        detail: `Current mapping confidence: ${mappingConfidence}%`,
        remediationSteps: [
          "Review P109 approved mapping evidence.",
          "Update confidenceScore to ≥80% with documented reviewer justification.",
        ],
      }),
    );
  }

  if (analysis.closedJob && !analysis.nativePublishedJob) {
    blockers.push(
      buildBlocker("unpublished_closed_job", {
        analysis,
        context,
        label: "Candidate on closed job posting",
        severity: "high",
        owner: "recruiter",
        systemCapable: false,
        manualActionRequired: true,
        estimatedMinutesToResolve: 15,
        expectedScoreImprovement: factors.publishedJob ? 0 : 15,
        detail: `Closed position ${row?.positionId ?? "unknown"}`,
        remediationSteps: [
          "Reassign candidate to an active published Breezy job.",
          "Do not republish closed ads without ops review.",
        ],
      }),
    );
  }

  if (
    !analysis.nativePublishedJob &&
    !analysis.approvedMapping?.qualifies &&
    (p106.category === "unpublished_job" ||
      p106.category === "closed_job" ||
      p106.category === "project_not_mappable" ||
      p106.category === "project_mapping_review" ||
      p106.category === "closed_ad_mapped_project")
  ) {
    blockers.push(
      buildBlocker("project_mapping_issue", {
        analysis,
        context,
        label: "Project mapping issue",
        severity: "high",
        owner: "mapping_reviewer",
        systemCapable: false,
        manualActionRequired: true,
        estimatedMinutesToResolve: 45,
        expectedScoreImprovement: factors.approvedMapping || factors.publishedJob ? 0 : 15,
        detail: p106.reason,
        remediationSteps: [
          "Complete P109 project mapping review.",
          "Approve mapping to a published replacement job or publish native posting.",
        ],
      }),
    );
  }

  if (
    !analysis.nativePublishedJob &&
    analysis.approvedMapping?.qualifies &&
    analysis.recommendedJobPublished &&
    !factors.publishedJob
  ) {
    blockers.push(
      buildBlocker("missing_published_replacement", {
        analysis,
        context,
        label: "Missing native assignment to published replacement",
        severity: "high",
        owner: "recruiter",
        systemCapable: false,
        manualActionRequired: true,
        estimatedMinutesToResolve: 15,
        expectedScoreImprovement: 15,
        detail: `P109 recommends ${analysis.approvedMapping.recommendedPositionId} (published) but candidate remains on closed posting.`,
        remediationSteps: [
          `Reassign in Breezy to published job ${analysis.approvedMapping.recommendedPositionTitle ?? analysis.approvedMapping.recommendedPositionId}.`,
          "Re-sync ingestion so positionId matches published job.",
        ],
      }),
    );
  }

  if (analysis.eligibility.status === "READY_AFTER_APPROVAL") {
    blockers.push(
      buildBlocker("ready_after_approval_signoff", {
        analysis,
        context,
        label: "Closed-ad recovery requires human sign-off",
        severity: "medium",
        owner: "operations",
        systemCapable: false,
        manualActionRequired: true,
        estimatedMinutesToResolve: 10,
        expectedScoreImprovement: 0,
        detail: "Policy demotes READY_AFTER_APPROVAL overlay from AUTO_APPROVED.",
        remediationSteps: [
          "Reassign to native published job for autonomous path, OR complete human sign-off.",
        ],
      }),
    );
  }

  const scoreGap = Math.max(0, analysis.policy.autoApproveThreshold - approval.approvalScore);
  if (
    scoreGap > 0 &&
    approval.approvalDecision !== "REJECTED_FOR_SAFETY" &&
    blockers.filter((b) => b.severity !== "critical").length === 0
  ) {
    blockers.push(
      buildBlocker("approval_policy_threshold", {
        analysis,
        context,
        label: "Approval score below AUTO_APPROVED threshold",
        severity: "medium",
        owner: "operations",
        systemCapable: true,
        manualActionRequired: false,
        estimatedMinutesToResolve: 0,
        expectedScoreImprovement: scoreGap,
        detail: `Score ${approval.approvalScore} below threshold ${analysis.policy.autoApproveThreshold}.`,
        remediationSteps: ["Complete remaining data completeness fixes to gain score points."],
      }),
    );
  }

  if (
    approval.humanReviewReasons.length > 0 &&
    !blockers.some((b) =>
      ["mapping_confidence_below_threshold", "ready_after_approval_signoff", "project_mapping_issue"].includes(b.id),
    )
  ) {
    blockers.push(
      buildBlocker("additional_blocker", {
        analysis,
        context,
        label: "Additional policy or review blocker",
        severity: "low",
        owner: "operations",
        systemCapable: false,
        manualActionRequired: true,
        estimatedMinutesToResolve: 15,
        expectedScoreImprovement: 0,
        detail: approval.humanReviewReasons.join("; "),
        remediationSteps: approval.humanReviewReasons.map((reason) => `Resolve: ${reason}`),
      }),
    );
  }

  const seen = new Set<RemediationBlockerId>();
  return blockers.filter((blocker) => {
    if (seen.has(blocker.id)) return false;
    seen.add(blocker.id);
    return true;
  });
}

function simulateAllFixes(input: {
  context: LoadedPaperworkCandidates;
  analysis: CandidateAnalysisContext;
  blockers: RemediationBlocker[];
}): ReturnType<typeof evaluateApprovalDecision> {
  let row = input.analysis.row ? cloneRow(input.analysis.row) : null;
  let mappingConfidence = input.analysis.approvedMapping?.confidenceScore ?? 0;
  let approvedMapping = input.analysis.approvedMapping;

  if (!row) return input.analysis.approval;

  for (const blocker of input.blockers) {
    if (blocker.id === "already_sent" || blocker.id === "duplicate_risk" || blocker.id === "invalid_email") {
      continue;
    }
    if (blocker.id === "recruiter_assignment_missing") row.assignedRecruiter = "Assigned Recruiter";
    if (
      blocker.id === "paperwork_ready_missing" ||
      blocker.id === "resume_missing" ||
      blocker.id === "questionnaire_incomplete"
    ) {
      row.hasResume = true;
      row.candidateGrade = { ...(row.candidateGrade ?? {}), paperworkReady: true };
    }
    if (blocker.id === "mapping_confidence_below_threshold") {
      mappingConfidence = Math.max(MAPPING_CONFIDENCE_MIN, mappingConfidence);
      if (approvedMapping) approvedMapping = { ...approvedMapping, confidenceScore: mappingConfidence };
    }
    if (
      blocker.id === "unpublished_closed_job" ||
      blocker.id === "missing_published_replacement" ||
      blocker.id === "project_mapping_issue"
    ) {
      if (approvedMapping?.recommendedPositionId) {
        row.positionId = approvedMapping.recommendedPositionId;
        approvedMapping = null;
      }
    }
  }

  return evaluateCandidate({
    context: input.context,
    candidateId: input.analysis.candidateId,
    policy: input.analysis.policy,
    rowOverride: row,
    mappingConfidenceOverride: mappingConfidence,
    approvedMappingOverride: approvedMapping,
  }).approval;
}

function classifyTier(input: {
  blockers: RemediationBlocker[];
  simulatedDecision: string;
  scoreGap: number;
}): { tier: RemediationTier; reason: string } {
  const manualCount = input.blockers.filter((b) => b.manualActionRequired && b.severity !== "critical").length;
  const structural = input.blockers.some((b) =>
    ["project_mapping_issue", "unpublished_closed_job", "missing_published_replacement"].includes(b.id),
  );
  const critical = input.blockers.some((b) => b.severity === "critical");

  if (critical) {
    return { tier: 3, reason: "Critical safety blocker — not recoverable via routine manual fixes." };
  }
  if (structural && manualCount >= 2) {
    return { tier: 3, reason: "Requires structural project or mapping work." };
  }
  if (manualCount <= 1 && input.scoreGap <= 15) {
    return { tier: 1, reason: "One manual action from AUTO_APPROVED." };
  }
  if (manualCount <= 3) {
    return { tier: 2, reason: "Two to three manual actions from AUTO_APPROVED." };
  }
  return { tier: 3, reason: "Multiple structural or policy blockers remain." };
}

function buildCandidatePlan(input: {
  context: LoadedPaperworkCandidates;
  analysis: CandidateAnalysisContext;
}): CandidateRemediationPlan | null {
  if (input.analysis.approval.approvalDecision === "AUTO_APPROVED") return null;

  const blockers = detectRemediationBlockers(input);
  const simulated = simulateAllFixes({
    context: input.context,
    analysis: input.analysis,
    blockers,
  });
  const scoreGap = Math.max(0, input.analysis.policy.autoApproveThreshold - input.analysis.approval.approvalScore);
  const { tier, reason } = classifyTier({
    blockers,
    simulatedDecision: simulated.approvalDecision,
    scoreGap,
  });
  const manualActionCount = blockers.filter((b) => b.manualActionRequired).length;

  return {
    candidateId: input.analysis.candidateId,
    candidateName: input.analysis.approval.candidateName,
    email: input.analysis.approval.email,
    currentScore: input.analysis.approval.approvalScore,
    currentDecision: input.analysis.approval.approvalDecision,
    scoreGapToAutoApprove: scoreGap,
    tier,
    tierReason: reason,
    blockers,
    manualActionCount,
    remediationPlan: blockers.flatMap((blocker) =>
      blocker.remediationSteps.map((step) => `[${blocker.label}] ${step}`),
    ),
    simulatedPostFixScore: simulated.approvalScore,
    simulatedPostFixDecision: simulated.approvalDecision,
    eligibilityStatus: input.analysis.eligibility.status,
    p106BlockerCategory: input.analysis.p106.category,
  };
}

function summarizeBlockersByCategory(plans: CandidateRemediationPlan[]): PaperworkRemediationEngineReport["blockersByCategory"] {
  const counts = new Map<RemediationBlockerId, { label: string; count: number }>();
  for (const plan of plans) {
    for (const blocker of plan.blockers) {
      const existing = counts.get(blocker.id);
      if (existing) existing.count += 1;
      else counts.set(blocker.id, { label: blocker.label, count: 1 });
    }
  }
  return [...counts.entries()]
    .map(([id, value]) => ({ id, label: value.label, count: value.count }))
    .sort((a, b) => b.count - a.count);
}

function summarizeApprovalsUnlockedByFix(plans: CandidateRemediationPlan[]): PaperworkRemediationEngineReport["approvalsUnlockedByFix"] {
  const counts = new Map<RemediationBlockerId, { label: string; count: number }>();
  for (const plan of plans) {
    if (plan.simulatedPostFixDecision !== "AUTO_APPROVED") continue;
    for (const blocker of plan.blockers) {
      if (blocker.expectedDecisionAfterFix === "AUTO_APPROVED") {
        const existing = counts.get(blocker.id);
        if (existing) existing.count += 1;
        else counts.set(blocker.id, { label: blocker.label, count: 1 });
      }
    }
  }
  return [...counts.entries()]
    .map(([fixId, value]) => ({ fixId, label: value.label, candidatesUnlocked: value.count }))
    .sort((a, b) => b.candidatesUnlocked - a.candidatesUnlocked);
}

export async function buildPaperworkRemediationReport(input?: {
  contextOverride?: LoadedPaperworkCandidates;
}): Promise<PaperworkRemediationEngineReport> {
  const policy = buildApprovalPolicy();
  const pilotConfig = loadPilotConfig();
  const context = input?.contextOverride ?? (await loadPaperworkCandidates({ mtdOnly: false }));

  const candidatePlans = context.candidateIds
    .map((candidateId) => {
      const analysis = evaluateCandidate({ context, candidateId, policy });
      return buildCandidatePlan({ context, analysis });
    })
    .filter((plan): plan is CandidateRemediationPlan => plan !== null)
    .sort((a, b) => b.currentScore - a.currentScore);

  const autoApprovedCount = context.candidateIds.length - candidatePlans.length;
  const tier1Count = candidatePlans.filter((p) => p.tier === 1).length;
  const tier2Count = candidatePlans.filter((p) => p.tier === 2).length;
  const tier3Count = candidatePlans.filter((p) => p.tier === 3).length;
  const estimatedApprovalsUnlocked = candidatePlans.filter(
    (p) => p.simulatedPostFixDecision === "AUTO_APPROVED",
  ).length;

  const blockersByCategory = summarizeBlockersByCategory(candidatePlans);
  const approvalsUnlockedByFix = summarizeApprovalsUnlockedByFix(candidatePlans);

  const closestToAutoApproved = [...candidatePlans]
    .sort((a, b) => a.scoreGapToAutoApprove - b.scoreGapToAutoApprove || b.currentScore - a.currentScore)
    .slice(0, 10)
    .map((plan) => ({
      candidateId: plan.candidateId,
      candidateName: plan.candidateName,
      approvalScore: plan.currentScore,
      scoreGap: plan.scoreGapToAutoApprove,
      tier: plan.tier,
      topBlocker: plan.blockers[0]?.label ?? "Unknown",
    }));

  const topRecurringRootCauses = blockersByCategory.slice(0, 10).map((entry) => ({
    cause: entry.label,
    count: entry.count,
    tier: (candidatePlans.find((p) => p.blockers.some((b) => b.id === entry.id))?.tier ?? 2) as RemediationTier,
  }));

  let goNoGo: PaperworkRemediationEngineReport["goNoGo"] = "GO WITH CONDITIONS";
  let goNoGoReason =
    "Remediation engine identifies actionable blockers — resolve Tier 1 candidates first without production writes.";

  if (estimatedApprovalsUnlocked > 0) {
    goNoGo = "GO WITH CONDITIONS";
    goNoGoReason = `${estimatedApprovalsUnlocked} blocked candidate(s) simulates to AUTO_APPROVED after documented fixes.`;
  } else if (tier1Count === 0 && tier2Count === 0) {
    goNoGo = "NO-GO";
    goNoGoReason = "No Tier 1 or Tier 2 candidates — structural mapping work dominates blocked cohort.";
  }

  const executivePanel = {
    totalBlockedCandidates: candidatePlans.length,
    blockersByCategory: blockersByCategory.map((entry) => ({
      id: entry.id,
      label: entry.label,
      count: entry.count,
    })),
    tier1Count,
    tier2Count,
    tier3Count,
    closestToAutoApproved,
    approvalsUnlockedByFix,
    topRecurringRootCauses,
  };

  return {
    sourcePhase: P134_SOURCE_PHASE,
    generatedAt: new Date().toISOString(),
    mode: P134_ANALYSIS_MODE,
    summary: {
      totalCandidatesEvaluated: context.candidateIds.length,
      blockedCandidateCount: candidatePlans.length,
      autoApprovedCount,
      tier1Count,
      tier2Count,
      tier3Count,
      estimatedApprovalsUnlocked,
      autoApproveThreshold: policy.autoApproveThreshold,
    },
    blockersByCategory,
    tierCounts: { tier1: tier1Count, tier2: tier2Count, tier3: tier3Count },
    closestToAutoApproved,
    approvalsUnlockedByFix,
    topRecurringRootCauses,
    candidatePlans,
    executivePanel,
    goNoGo,
    goNoGoReason,
    executeBatchCalled: false,
    breezyWrites: false,
    liveModeEnabled: pilotConfig.liveModeEnabled,
    paperworkSent: false,
  };
}
