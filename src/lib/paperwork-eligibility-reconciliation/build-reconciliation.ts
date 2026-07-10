import type { BreezyJob } from "@/lib/breezy-api";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import { buildCandidateAdvancementDecision } from "@/lib/candidate-advancement-engine/build-advancement-decision";
import { buildHiringDecision } from "@/lib/autonomous-hiring-decision-engine/build-hiring-decision";
import { buildPaperworkSendEligibility } from "@/lib/autonomous-paperwork-send-engine/build-paperwork-send-eligibility";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import { loadCandidateOnboardingPolicy } from "@/lib/candidate-onboarding-engine/onboarding-policy-store";
import { DEFAULT_PAPERWORK_BY_GRADE } from "@/lib/candidate-onboarding-engine/paperwork-grade-policy";
import type { PaperworkByGrade } from "@/lib/candidate-onboarding-engine/types";
import {
  BLOCKER_CLASS_LABELS,
  BLOCKER_RECOMMENDED_FIXES,
  mapGateToBlockerClass,
  pickPrimaryBlocker,
} from "@/lib/paperwork-eligibility-reconciliation/blocker-taxonomy";
import type {
  BlockerClassId,
  BlockerClassSummary,
  PaperworkEligibilityCandidateTrace,
  PaperworkEligibilityReconciliationReport,
} from "@/lib/paperwork-eligibility-reconciliation/types";
import {
  P88_PREVIEW_MODE,
  P88_RECONCILIATION_PHASE,
} from "@/lib/paperwork-eligibility-reconciliation/types";

const SCREEN_STATUSES = new Set(["Applied", "Needs Review", "Qualified"]);

function candidateName(row: ScoredCandidateWorkflowRow): string {
  const parts = [row.firstName, row.lastName].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : row.email || row.candidateId;
}

function isScreenStage(row: ScoredCandidateWorkflowRow): boolean {
  return SCREEN_STATUSES.has(row.workflowStatus);
}

function hasPublishedJob(
  row: ScoredCandidateWorkflowRow,
  jobsByPositionId: Map<string, BreezyJob>,
): boolean {
  return Boolean(row.positionId?.trim() && jobsByPositionId.has(row.positionId));
}

function collectDataBlockers(row: ScoredCandidateWorkflowRow): BlockerClassId[] {
  const blockers: BlockerClassId[] = [];
  if (!row.hasResume && !row.resumeIntelligence.available) blockers.push("missing_resume");
  if (!row.questionnaireIntelligence.available) blockers.push("missing_questionnaire");
  if (!row.email?.trim()) blockers.push("missing_contact_data");
  if (row.dmNeedsAssignment || row.assignedDM === "Unassigned") {
    blockers.push("missing_dm_project_data");
  }
  if (row.hasQuestionnaire && !row.questionnaireIntelligence.available) {
    blockers.push("parser_field_mismatch");
  }
  if (row.hasResume && !row.resumeIntelligence.available && Boolean(row.resumeText?.trim())) {
    blockers.push("parser_field_mismatch");
  }
  return blockers;
}

function simulateOperationalFix(input: {
  row: ScoredCandidateWorkflowRow;
  onboarding: CandidateOnboardingRecord | null;
  jobsByPositionId: Map<string, BreezyJob>;
}): boolean {
  const hypotheticalJobs = new Map(input.jobsByPositionId);
  if (input.row.positionId?.trim() && !hypotheticalJobs.has(input.row.positionId)) {
    hypotheticalJobs.set(input.row.positionId, {
      jobId: input.row.positionId,
      name: input.row.positionName ?? "Preview job",
      city: input.row.city,
      state: input.row.state,
      zip: input.row.zipCode,
      status: "published",
    } as BreezyJob);
  }
  const hypothetical: ScoredCandidateWorkflowRow = {
    ...input.row,
    assignedRecruiter: isUnassignedRecruiter(input.row.assignedRecruiter)
      ? "Preview Recruiter"
      : input.row.assignedRecruiter,
    workflowStatus: "Paperwork Needed",
    actionType: "send-paperwork",
  };
  return buildPaperworkSendEligibility({
    row: hypothetical,
    onboarding: input.onboarding,
    jobsByPositionId: hypotheticalJobs,
  }).eligible;
}

function simulateP84AfterHypotheticalFixes(input: {
  row: ScoredCandidateWorkflowRow;
  onboarding: CandidateOnboardingRecord | null;
  jobsByPositionId: Map<string, BreezyJob>;
  applyP83Advancement: boolean;
  applyRecruiterAssignment: boolean;
}) {
  const hypothetical: ScoredCandidateWorkflowRow = {
    ...input.row,
    assignedRecruiter: input.applyRecruiterAssignment ? "Preview Recruiter" : input.row.assignedRecruiter,
    workflowStatus: input.applyP83Advancement ? "Paperwork Needed" : input.row.workflowStatus,
    actionType: input.applyP83Advancement ? "send-paperwork" : input.row.actionType,
  };
  return buildPaperworkSendEligibility({
    row: hypothetical,
    onboarding: input.onboarding,
    jobsByPositionId: input.jobsByPositionId,
  });
}

function buildRuleMismatchNote(input: {
  row: ScoredCandidateWorkflowRow;
  p87ReadySignal: boolean;
  p84Eligible: boolean;
  p83Action: string;
  primaryBlocker: BlockerClassId;
}): string | null {
  if (!input.p87ReadySignal || input.p84Eligible) return null;
  if (input.row.candidateGrade.paperworkReady && input.primaryBlocker === "candidate_not_in_correct_stage") {
    return "P87 paperworkReady measures questionnaire readiness (score ≥70); P84 requires workflow Paperwork Needed + send-paperwork action from P83.";
  }
  if (input.p87ReadySignal && input.p83Action === "send-paperwork" && input.primaryBlocker === "candidate_not_in_correct_stage") {
    return "P83 would send paperwork but workflow state was not persisted — workflow_state_stale.";
  }
  if (input.row.candidateGrade.paperworkReady && !input.row.questionnaireIntelligence.available) {
    return "paperworkReady true despite missing questionnaire intelligence — scoring/parser mismatch.";
  }
  return null;
}

function shouldRemainBlocked(
  primaryBlocker: BlockerClassId,
  wouldBeEligibleAfterOperationalFixes: boolean,
): boolean {
  if (wouldBeEligibleAfterOperationalFixes) return false;
  return [
    "real_disqualification",
    "terminal_or_inactive_state",
    "paperwork_already_sent",
    "duplicate_candidate",
    "job_closed_unpublished",
    "missing_resume",
    "missing_questionnaire",
  ].includes(primaryBlocker);
}

function buildTrace(input: {
  row: ScoredCandidateWorkflowRow;
  onboarding: CandidateOnboardingRecord | null;
  jobsByPositionId: Map<string, BreezyJob>;
  paperworkByGrade: PaperworkByGrade;
  generatedAt: string;
}): PaperworkEligibilityCandidateTrace {
  const { row } = input;
  const p87 = buildHiringDecision({
    row,
    jobsByPositionId: input.jobsByPositionId,
    onboarding: input.onboarding,
    generatedAt: input.generatedAt,
  });
  const p83 = buildCandidateAdvancementDecision(row, {
    jobsByPositionId: input.jobsByPositionId,
    paperworkByGrade: input.paperworkByGrade,
    requireApproval: false,
  });
  const p84 = buildPaperworkSendEligibility({
    row,
    onboarding: input.onboarding,
    jobsByPositionId: input.jobsByPositionId,
  });

  const gateBlockers = p84.gates.filter((g) => !g.passed).map(mapGateToBlockerClass);
  const dataBlockers = collectDataBlockers(row);
  const supplementalBlockers: BlockerClassId[] = [];

  if (
    p83.action === "send-paperwork" &&
    (row.workflowStatus !== "Paperwork Needed" || row.actionType !== "send-paperwork")
  ) {
    supplementalBlockers.push("workflow_state_stale");
  }

  const allBlockers = [...new Set([...gateBlockers, ...dataBlockers, ...supplementalBlockers])];

  const ruleMismatchNote = buildRuleMismatchNote({
    row,
    p87ReadySignal: row.candidateGrade.paperworkReady,
    p84Eligible: p84.eligible,
    p83Action: p83.action,
    primaryBlocker: pickPrimaryBlocker(gateBlockers.length > 0 ? gateBlockers : allBlockers),
  });
  if (ruleMismatchNote) {
    allBlockers.push("rule_mismatch_p87_p84");
  }

  const primaryBlockerId = pickPrimaryBlocker(
    gateBlockers.length > 0 ? gateBlockers : allBlockers,
  );
  const primaryFailedGate = p84.gates.find((g) => !g.passed) ?? null;

  const afterP83 = simulateP84AfterHypotheticalFixes({
    row,
    onboarding: input.onboarding,
    jobsByPositionId: input.jobsByPositionId,
    applyP83Advancement: true,
    applyRecruiterAssignment: false,
  });
  const afterRecruiter = simulateP84AfterHypotheticalFixes({
    row,
    onboarding: input.onboarding,
    jobsByPositionId: input.jobsByPositionId,
    applyP83Advancement: true,
    applyRecruiterAssignment: isUnassignedRecruiter(row.assignedRecruiter),
  });
  const afterOperationalFix = simulateOperationalFix({
    row,
    onboarding: input.onboarding,
    jobsByPositionId: input.jobsByPositionId,
  });

  return {
    candidateId: row.candidateId,
    candidateName: candidateName(row),
    email: row.email ?? "",
    positionId: row.positionId ?? "",
    positionName: row.positionName ?? "",
    p56: {
      grade: row.candidateGrade.grade,
      overallScore: row.candidateGrade.overallScore,
      paperworkReady: row.candidateGrade.paperworkReady,
      paperworkReadinessScore: row.candidateGrade.categoryScores.paperworkReadiness,
      confidence: row.candidateGrade.confidence,
      techReady: row.candidateGrade.techReady,
    },
    p86: {
      resumeAvailable: row.resumeIntelligence.available,
      questionnaireAvailable: row.questionnaireIntelligence.available,
      questionnaireAnswerCount: row.questionnaireIntelligence.answers.length,
      hasResumeFlag: row.hasResume,
      hasQuestionnaireFlag: row.hasQuestionnaire ?? false,
    },
    p87: {
      action: p87.action,
      recommendationLabel: p87.explanation.recommendationLabel,
      hasReadyForPaperworkSignal: p87.explanation.positiveFactors.some((p) =>
        p.toLowerCase().includes("ready for paperwork"),
      ),
    },
    p83: {
      action: p83.action,
      shouldAdvance: p83.shouldAdvance,
      shouldPersist: p83.shouldPersist,
      reason: p83.reason,
      requiresApproval: p83.requiresApproval,
    },
    workflow: {
      workflowStatus: row.workflowStatus,
      breezyStage: row.stage,
      actionType: row.actionType ?? "none",
      assignedRecruiter: row.assignedRecruiter,
      assignedDM: row.assignedDM,
      dmNeedsAssignment: row.dmNeedsAssignment,
      paperworkStatus: row.paperworkStatus,
      signatureRequestId: row.signatureRequestId,
      isScreenStage: isScreenStage(row),
    },
    job: {
      publishedJobMatch: hasPublishedJob(row, input.jobsByPositionId),
    },
    p84: {
      eligible: p84.eligible,
      blockingGates: p84.gates
        .filter((g) => !g.passed)
        .map((g) => ({ id: g.id, label: g.label, detail: g.detail })),
      primaryGateId: primaryFailedGate?.id ?? null,
      primaryBlockerDetail: primaryFailedGate?.detail ?? primaryFailedGate?.label ?? null,
    },
    primaryBlockerId,
    primaryBlockerLabel: BLOCKER_CLASS_LABELS[primaryBlockerId],
    allBlockerIds: [...new Set(allBlockers)],
    ruleMismatchNote,
    wouldBeEligibleAfterP83Advancement: afterP83.eligible,
    wouldBeEligibleAfterRecruiterAssignment: afterRecruiter.eligible,
    wouldBeEligibleAfterOperationalFixes: afterOperationalFix,
    shouldRemainBlocked: shouldRemainBlocked(primaryBlockerId, afterOperationalFix),
    recommendedFix: BLOCKER_RECOMMENDED_FIXES[primaryBlockerId],
  };
}

function buildBlockerBreakdown(traces: PaperworkEligibilityCandidateTrace[]): BlockerClassSummary[] {
  const counts = new Map<BlockerClassId, number>();
  for (const trace of traces) {
    counts.set(trace.primaryBlockerId, (counts.get(trace.primaryBlockerId) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([id, count]) => ({
      id,
      label: BLOCKER_CLASS_LABELS[id],
      count,
      recommendedFix: BLOCKER_RECOMMENDED_FIXES[id],
    }))
    .sort((a, b) => b.count - a.count);
}

export function isReadyForPaperworkGradeSignal(row: ScoredCandidateWorkflowRow): boolean {
  return row.candidateGrade.paperworkReady === true;
}

export function buildPaperworkEligibilityReconciliation(input: {
  rows: ScoredCandidateWorkflowRow[];
  jobsByPositionId: Map<string, BreezyJob>;
  onboardingByCandidateId?: Map<string, CandidateOnboardingRecord>;
  mtdRangeLabel?: string;
  generatedAt?: string;
  paperworkByGrade?: PaperworkByGrade;
}): PaperworkEligibilityReconciliationReport {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const onboardingByCandidateId = input.onboardingByCandidateId ?? new Map();
  const paperworkByGrade = input.paperworkByGrade ?? DEFAULT_PAPERWORK_BY_GRADE;

  const readyRows = input.rows.filter(isReadyForPaperworkGradeSignal);
  const traces = readyRows.map((row) =>
    buildTrace({
      row,
      onboarding: onboardingByCandidateId.get(row.candidateId) ?? null,
      jobsByPositionId: input.jobsByPositionId,
      paperworkByGrade,
      generatedAt,
    }),
  );

  const totalP84Eligible = traces.filter((t) => t.p84.eligible).length;
  const eligibleAfterP83 = traces.filter((t) => t.wouldBeEligibleAfterP83Advancement).length;
  const eligibleAfterRecruiter = traces.filter((t) => t.wouldBeEligibleAfterRecruiterAssignment).length;
  const eligibleAfterOperationalFixes = traces.filter((t) => t.wouldBeEligibleAfterOperationalFixes).length;
  const shouldRemainBlocked = traces.filter((t) => t.shouldRemainBlocked).length;
  const blockerBreakdown = buildBlockerBreakdown(traces);

  const topBlocker = blockerBreakdown[0];
  const rootCause =
    topBlocker?.id === "candidate_not_in_correct_stage" || topBlocker?.id === "workflow_state_stale"
      ? "P87 ready-for-paperwork is a grade/readiness signal; P84 requires persisted P83 workflow advancement (Paperwork Needed + send-paperwork)."
      : topBlocker?.id === "job_closed_unpublished"
        ? "Most ready-grade candidates are tied to unpublished/closed Breezy positions."
        : topBlocker?.id === "paperwork_already_sent"
          ? "Many ready-grade candidates already have paperwork in flight."
          : "P84 gates are stricter than P87 paperworkReady — workflow and operational prerequisites block sends.";

  return {
    sourcePhase: P88_RECONCILIATION_PHASE,
    previewMode: P88_PREVIEW_MODE,
    generatedAt,
    mtdRangeLabel: input.mtdRangeLabel ?? "MTD",
    summary: {
      totalReadyGradeCandidates: traces.length,
      totalP84Eligible,
      totalP84Ineligible: traces.length - totalP84Eligible,
      eligibleAfterP83Advancement: eligibleAfterP83,
      eligibleAfterRecruiterAssignment: eligibleAfterRecruiter,
      eligibleAfterOperationalFixes,
      shouldRemainBlocked,
      rootCause,
    },
    blockerBreakdown,
    ruleAlignment: {
      p87ReadySignalDefinition:
        "Questionnaire Ready (P56 paperworkReady) = questionnaire paperworkReadiness category score ≥ 70.",
      p84EligibilityDefinition:
        "P84 Send Eligible requires recruiter assigned, workflowStatus=Paperwork Needed, actionType=send-paperwork, published job, valid email, no duplicate, not signed/rejected/inactive, and template ready.",
      primaryMismatch:
        "Questionnaire Ready ≠ Workflow Ready ≠ P84 Send Eligible. Intelligence scores differ from persisted automation state.",
      explanation:
        "The 75 vs 0 gap is expected when P83 advancement has not persisted and/or jobs are unpublished. Use P89 unlock preview for operational recovery plans.",
      readinessLabels: {
        questionnaireReady: "Questionnaire Ready",
        workflowReady: "Workflow Ready",
        p84SendEligible: "P84 Send Eligible",
        paperworkAlreadySent: "Paperwork Already Sent",
      },
    },
    traces,
    remainingBlockersBeforeLiveSend: [
      "P84 liveSend must remain false until executive approval",
      "P83 advancement must persist Paperwork Needed before P84 evaluates eligible",
      "Published job match required for every send",
      "Recruiter assignment required (P62)",
      `${shouldRemainBlocked} ready-grade candidates should remain blocked after fixes`,
      `${traces.length - eligibleAfterOperationalFixes} would still fail P84 after operational fixes (job publish + P62 + P83)`,
    ],
  };
}

export async function buildPaperworkEligibilityReconciliationFromStores(input?: {
  mtdOnly?: boolean;
}): Promise<PaperworkEligibilityReconciliationReport> {
  const { readIngestionStore, listIngestedCandidates, filterMtdCandidates, currentMtdDateRange } =
    await import("@/lib/candidate-ingestion");
  const { getCandidateWorkflowBundle } = await import("@/lib/candidate-workflow-store");
  const { fetchBreezyJobs } = await import("@/lib/breezy-api");
  const { buildScoredWorkflowRow } = await import("@/lib/build-candidate-workflow-row");
  const { listAllCandidateOnboardingRecords } = await import(
    "@/lib/candidate-onboarding-engine/onboarding-record-store"
  );

  const [store, bundle, jobsResult, onboardingRecords, policy] = await Promise.all([
    readIngestionStore(),
    getCandidateWorkflowBundle(),
    fetchBreezyJobs("published"),
    listAllCandidateOnboardingRecords(),
    loadCandidateOnboardingPolicy(),
  ]);

  const jobsByPositionId = new Map(
    (jobsResult.ok ? jobsResult.jobs : []).map((job) => [job.jobId, job]),
  );
  const range = currentMtdDateRange();
  const candidates =
    input?.mtdOnly === false
      ? listIngestedCandidates(store)
      : filterMtdCandidates(listIngestedCandidates(store), range);
  const rows = candidates.map((candidate) =>
    buildScoredWorkflowRow(candidate, bundle.workflows[candidate.candidateId], {
      job: jobsByPositionId.get(candidate.positionId),
    }),
  );

  return buildPaperworkEligibilityReconciliation({
    rows,
    jobsByPositionId,
    onboardingByCandidateId: new Map(
      onboardingRecords.map((record) => [record.candidateId, record]),
    ),
    mtdRangeLabel: `${range.start}..${range.end}`,
    paperworkByGrade: policy.paperworkByGrade,
  });
}
