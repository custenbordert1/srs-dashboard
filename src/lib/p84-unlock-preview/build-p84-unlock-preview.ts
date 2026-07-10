import type { BreezyJob } from "@/lib/breezy-api";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import { suggestDmForCandidate } from "@/lib/candidate-dm-suggest";
import { buildCandidateAdvancementDecision } from "@/lib/candidate-advancement-engine/build-advancement-decision";
import { buildPaperworkSendEligibility } from "@/lib/autonomous-paperwork-send-engine/build-paperwork-send-eligibility";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import type { PaperworkByGrade } from "@/lib/candidate-onboarding-engine/types";
import { DEFAULT_PAPERWORK_BY_GRADE } from "@/lib/candidate-onboarding-engine/paperwork-grade-policy";
import { isReadyForPaperworkGradeSignal } from "@/lib/paperwork-eligibility-reconciliation/build-reconciliation";
import {
  classifyPaperworkReadiness,
  isQuestionnaireReady,
  READINESS_LABELS,
  simulateP84Eligibility,
} from "@/lib/p84-unlock-preview/readiness-labels";
import type {
  P84UnlockCandidateGroup,
  P84UnlockPreviewReport,
  P84UnlockRecoveryPlan,
} from "@/lib/p84-unlock-preview/types";
import { P89_PREVIEW_MODE, P89_SOURCE_PHASE } from "@/lib/p84-unlock-preview/types";
import { buildRecruiterAssignmentDecision } from "@/lib/recruiter-assignment-engine/build-assignment-decision";
import type { CandidateWorkflowRecord, RecruiterRosters } from "@/lib/candidate-workflow-types";

function candidateName(row: ScoredCandidateWorkflowRow): string {
  const parts = [row.firstName, row.lastName].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : row.email || row.candidateId;
}

function hasPublishedJob(
  row: ScoredCandidateWorkflowRow,
  jobsByPositionId: Map<string, BreezyJob>,
): boolean {
  return Boolean(row.positionId?.trim() && jobsByPositionId.has(row.positionId));
}

function isMonitorOnly(row: ScoredCandidateWorkflowRow): boolean {
  const readiness = classifyPaperworkReadiness({
    row,
    jobsByPositionId: new Map(),
    onboarding: null,
  });
  return readiness.paperworkAlreadySent;
}

function buildOwnershipIndex(
  workflows: Record<string, CandidateWorkflowRecord>,
  rows: ScoredCandidateWorkflowRow[],
): Map<string, { total: number; byState: Map<string, number> }> {
  const index = new Map<string, { total: number; byState: Map<string, number> }>();
  for (const row of rows) {
    const workflow = workflows[row.candidateId];
    const recruiter = workflow?.assignedRecruiter?.trim() ?? row.assignedRecruiter;
    if (isUnassignedRecruiter(recruiter)) continue;
    const bucket = index.get(recruiter) ?? { total: 0, byState: new Map() };
    bucket.total += 1;
    const state = row.state?.trim();
    if (state) bucket.byState.set(state, (bucket.byState.get(state) ?? 0) + 1);
    index.set(recruiter, bucket);
  }
  return index;
}

function resolveGroup(input: {
  currentlyEligible: boolean;
  monitorOnly: boolean;
  allFixes: boolean;
}): P84UnlockCandidateGroup {
  if (input.currentlyEligible) return "current_eligible";
  if (input.monitorOnly) return "monitor_only";
  if (input.allFixes) return "unlockable";
  return "not_fixable";
}

function buildRecoveryPlan(input: {
  row: ScoredCandidateWorkflowRow;
  workflow?: CandidateWorkflowRecord;
  onboarding: CandidateOnboardingRecord | null;
  jobsByPositionId: Map<string, BreezyJob>;
  rosters: RecruiterRosters;
  ownership: Map<string, { total: number; byState: Map<string, number> }>;
  paperworkByGrade: PaperworkByGrade;
  job?: BreezyJob;
}): P84UnlockRecoveryPlan {
  const { row } = input;
  const jobPublished = hasPublishedJob(row, input.jobsByPositionId);
  const recruiterMissing = isUnassignedRecruiter(row.assignedRecruiter);
  const p83 = buildCandidateAdvancementDecision(row, {
    jobsByPositionId: input.jobsByPositionId,
    paperworkByGrade: input.paperworkByGrade,
    requireApproval: false,
  });
  const assignment = buildRecruiterAssignmentDecision({
    candidate: row,
    workflow: input.workflow,
    jobState: input.job?.state,
    rosters: input.rosters,
    ownership: input.ownership,
  });
  const suggestedDm = row.suggestedDM || suggestDmForCandidate({
    candidateState: row.state,
    jobState: input.job?.state,
    assignedDM: row.assignedDM,
  });

  const currentlyEligible = buildPaperworkSendEligibility({
    row,
    onboarding: input.onboarding,
    jobsByPositionId: input.jobsByPositionId,
  }).eligible;
  const monitorOnly = isMonitorOnly(row);

  const jobPublishOnly = simulateP84Eligibility({
    row,
    onboarding: input.onboarding,
    jobsByPositionId: input.jobsByPositionId,
    applyJobPublish: true,
    applyRecruiterAssignment: false,
    applyP83Advancement: false,
  });
  const recruiterOnly = simulateP84Eligibility({
    row,
    onboarding: input.onboarding,
    jobsByPositionId: input.jobsByPositionId,
    applyJobPublish: false,
    applyRecruiterAssignment: true,
    applyP83Advancement: false,
  });
  const p83Only = simulateP84Eligibility({
    row,
    onboarding: input.onboarding,
    jobsByPositionId: input.jobsByPositionId,
    applyJobPublish: false,
    applyRecruiterAssignment: false,
    applyP83Advancement: true,
  });
  const allFixes = simulateP84Eligibility({
    row,
    onboarding: input.onboarding,
    jobsByPositionId: input.jobsByPositionId,
    applyJobPublish: true,
    applyRecruiterAssignment: true,
    applyP83Advancement: true,
  });

  const requiredFixes: string[] = [];
  if (!jobPublished) requiredFixes.push("Publish or reactivate Breezy position");
  if (recruiterMissing) requiredFixes.push("Assign recruiter (P62)");
  if (row.workflowStatus !== "Paperwork Needed" || row.actionType !== "send-paperwork") {
    requiredFixes.push("Advance to Paperwork Needed via P83");
  }
  if (row.dmNeedsAssignment || row.assignedDM === "Unassigned") {
    requiredFixes.push(`Assign DM territory (${suggestedDm})`);
  }

  const p83ShouldAdvance =
    p83.action === "send-paperwork" ||
    (row.workflowStatus !== "Paperwork Needed" && !monitorOnly && isQuestionnaireReady(row));

  const group = resolveGroup({ currentlyEligible, monitorOnly, allFixes });

  return {
    candidateId: row.candidateId,
    candidateName: candidateName(row),
    breezyCandidateId: row.candidateId,
    positionId: row.positionId ?? "",
    positionName: row.positionName ?? "",
    dmTerritory: row.state ?? input.job?.state ?? "",
    suggestedDm,
    recommendedRecruiter: recruiterMissing
      ? assignment.recruiter || "Recruiting Team"
      : row.assignedRecruiter,
    recruiterAssignmentReason: recruiterMissing ? assignment.reason : "Recruiter already assigned",
    currentWorkflowStage: row.workflowStatus,
    breezyStage: row.stage,
    requiredFixes,
    jobMustBePublished: !jobPublished,
    recruiterAssignmentMissing: recruiterMissing,
    p83ShouldAdvance,
    expectedP84ResultAfterFixes: allFixes ? "eligible" : "ineligible",
    unlockScenarios: {
      jobPublishOnly,
      recruiterAssignmentOnly: recruiterOnly,
      p83AdvancementOnly: p83Only,
      allOperationalFixes: allFixes,
    },
    group,
    grade: row.candidateGrade.grade,
    questionnaireReady: isQuestionnaireReady(row),
  };
}

const OPERATIONAL_ORDER = [
  "1. Publish or reactivate Breezy jobs for affected position IDs",
  "2. Assign recruiter and DM territory (P62)",
  "3. Persist P83 advancement to Paperwork Needed + send-paperwork",
  "4. Rerun P84 preview eligibility (no live send)",
];

export function buildP84UnlockPreview(input: {
  rows: ScoredCandidateWorkflowRow[];
  jobsByPositionId: Map<string, BreezyJob>;
  workflows: Record<string, CandidateWorkflowRecord>;
  rosters: RecruiterRosters;
  onboardingByCandidateId?: Map<string, CandidateOnboardingRecord>;
  mtdRangeLabel?: string;
  generatedAt?: string;
  paperworkByGrade?: PaperworkByGrade;
}): P84UnlockPreviewReport {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const onboardingByCandidateId = input.onboardingByCandidateId ?? new Map();
  const paperworkByGrade = input.paperworkByGrade ?? DEFAULT_PAPERWORK_BY_GRADE;
  const readyRows = input.rows.filter(isReadyForPaperworkGradeSignal);
  const ownership = buildOwnershipIndex(input.workflows, readyRows);

  const recoveryPlans = readyRows.map((row) =>
    buildRecoveryPlan({
      row,
      workflow: input.workflows[row.candidateId],
      onboarding: onboardingByCandidateId.get(row.candidateId) ?? null,
      jobsByPositionId: input.jobsByPositionId,
      rosters: input.rosters,
      ownership,
      paperworkByGrade,
      job: input.jobsByPositionId.get(row.positionId),
    }),
  );

  const currentEligible = recoveryPlans.filter((p) => p.group === "current_eligible");
  const unlockable = recoveryPlans.filter((p) => p.group === "unlockable");
  const monitorOnly = recoveryPlans.filter((p) => p.group === "monitor_only");
  const notFixable = recoveryPlans.filter((p) => p.group === "not_fixable");

  return {
    sourcePhase: P89_SOURCE_PHASE,
    previewMode: P89_PREVIEW_MODE,
    generatedAt,
    mtdRangeLabel: input.mtdRangeLabel ?? "MTD",
    summary: {
      currentP84Eligible: currentEligible.length,
      unlockableAfterAllOperationalFixes: unlockable.length,
      unlockableAfterJobPublishOnly: recoveryPlans.filter((p) => p.unlockScenarios.jobPublishOnly).length,
      unlockableAfterRecruiterAssignmentOnly: recoveryPlans.filter(
        (p) => p.unlockScenarios.recruiterAssignmentOnly,
      ).length,
      unlockableAfterP83AdvancementOnly: recoveryPlans.filter(
        (p) => p.unlockScenarios.p83AdvancementOnly,
      ).length,
      monitorOnly: monitorOnly.length,
      notFixable: notFixable.length,
      totalReadyGradeCandidates: recoveryPlans.length,
      operationalOrder: OPERATIONAL_ORDER,
    },
    readinessLabels: READINESS_LABELS,
    recoveryPlans,
    currentEligible,
    unlockable,
    monitorOnly,
    notFixable,
    remainingBlockersBeforeLiveSend: [
      "P84 liveSend must remain disabled until executive sign-off",
      `${monitorOnly.length} ready-grade candidates already in paperwork monitoring`,
      `${notFixable.length} ready-grade candidates remain blocked after operational simulation`,
      "No Breezy publish/write actions are performed by P89 — preview plans only",
      "Recruiter assignment and P83 advancement must be persisted locally before P84 preview rerun",
    ],
  };
}

export async function buildP84UnlockPreviewFromStores(input?: {
  mtdOnly?: boolean;
}): Promise<P84UnlockPreviewReport> {
  const { readIngestionStore, listIngestedCandidates, filterMtdCandidates, currentMtdDateRange } =
    await import("@/lib/candidate-ingestion");
  const { getCandidateWorkflowBundle } = await import("@/lib/candidate-workflow-store");
  const { fetchBreezyJobs } = await import("@/lib/breezy-api");
  const { buildScoredWorkflowRow } = await import("@/lib/build-candidate-workflow-row");
  const { listAllCandidateOnboardingRecords } = await import(
    "@/lib/candidate-onboarding-engine/onboarding-record-store"
  );
  const { loadCandidateOnboardingPolicy } = await import(
    "@/lib/candidate-onboarding-engine/onboarding-policy-store"
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

  return buildP84UnlockPreview({
    rows,
    jobsByPositionId,
    workflows: bundle.workflows,
    rosters: bundle.rosters,
    onboardingByCandidateId: new Map(
      onboardingRecords.map((record) => [record.candidateId, record]),
    ),
    mtdRangeLabel: `${range.start}..${range.end}`,
    paperworkByGrade: policy.paperworkByGrade,
  });
}
