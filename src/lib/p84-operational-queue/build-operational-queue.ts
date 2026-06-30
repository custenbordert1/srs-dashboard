import type { BreezyJob } from "@/lib/breezy-api";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { buildP84UnlockPreview } from "@/lib/p84-unlock-preview/build-p84-unlock-preview";
import type { P84UnlockPreviewReport, P84UnlockRecoveryPlan } from "@/lib/p84-unlock-preview/types";
import type {
  OperationalActionStep,
  OperationalActionStepId,
  OperationalQueueEntry,
  OperationalQueueStatus,
  OperationalRiskLevel,
  P84OperationalQueueReport,
  PaperworkUnlockQueueMetrics,
} from "@/lib/p84-operational-queue/types";
import {
  OPERATIONAL_QUEUE_STATUS_LABELS,
  P90_PREVIEW_MODE,
  P90_SOURCE_PHASE,
} from "@/lib/p84-operational-queue/types";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import type { PaperworkByGrade } from "@/lib/candidate-onboarding-engine/types";
import type { CandidateWorkflowRecord, RecruiterRosters } from "@/lib/candidate-workflow-types";
import { buildPaperworkSendEligibility } from "@/lib/autonomous-paperwork-send-engine/build-paperwork-send-eligibility";

const STEP_META: Record<
  OperationalActionStepId,
  { label: string; risk: OperationalRiskLevel; manualApproval: boolean }
> = {
  publish_job: {
    label: "Publish/reactivate Breezy job",
    risk: "high",
    manualApproval: true,
  },
  assign_recruiter: {
    label: "Assign recruiter",
    risk: "medium",
    manualApproval: true,
  },
  assign_dm: {
    label: "Assign DM",
    risk: "medium",
    manualApproval: true,
  },
  p83_advancement: {
    label: "Advance P83 to Paperwork Needed",
    risk: "medium",
    manualApproval: true,
  },
  recheck_p84: {
    label: "Recheck P84 eligibility",
    risk: "low",
    manualApproval: false,
  },
};

function resolveQueueStatus(input: {
  plan: P84UnlockRecoveryPlan;
  jobPublished: boolean;
  recruiterAssigned: boolean;
  dmAssigned: boolean;
  workflowReady: boolean;
  p84Eligible: boolean;
}): OperationalQueueStatus {
  if (input.plan.group === "monitor_only") return "monitor_only";
  if (input.plan.group === "not_fixable") return "blocked";
  if (input.p84Eligible || input.workflowReady) return "ready_for_p84_preview";
  if (!input.jobPublished) return "needs_job_publish";
  if (!input.recruiterAssigned) return "needs_recruiter_assignment";
  if (!input.dmAssigned) return "needs_dm_assignment";
  if (!input.workflowReady) return "needs_p83_advancement";
  return "ready_for_p84_preview";
}

function buildActionSteps(input: {
  plan: P84UnlockRecoveryPlan;
  jobPublished: boolean;
  recruiterAssigned: boolean;
  dmAssigned: boolean;
  workflowReady: boolean;
  p84Eligible: boolean;
}): OperationalActionStep[] {
  const { plan } = input;
  const owner = plan.recommendedRecruiter;
  const steps: Array<{ id: OperationalActionStepId; completed: boolean; blocker: string; action: string; result: string }> =
    [
      {
        id: "publish_job",
        completed: input.jobPublished,
        blocker: input.jobPublished ? "Job published" : "Position closed or unpublished",
        action: `Publish or reactivate Breezy job ${plan.positionId}`,
        result: "Published job match available for P84",
      },
      {
        id: "assign_recruiter",
        completed: input.recruiterAssigned,
        blocker: input.recruiterAssigned ? "Recruiter assigned" : "Recruiter assignment missing",
        action: `Assign recruiter ${owner} (P62)`,
        result: "Recruiter assigned for paperwork path",
      },
      {
        id: "assign_dm",
        completed: input.dmAssigned,
        blocker: input.dmAssigned ? "DM assigned" : "DM territory unassigned",
        action: `Assign DM ${plan.suggestedDm}`,
        result: "DM territory aligned for operations",
      },
      {
        id: "p83_advancement",
        completed: input.workflowReady,
        blocker: input.workflowReady ? "At Paperwork Needed" : `Current stage: ${plan.currentWorkflowStage}`,
        action: "Persist P83 advancement to Paperwork Needed + send-paperwork",
        result: "Workflow ready for P84 preview",
      },
      {
        id: "recheck_p84",
        completed: input.p84Eligible,
        blocker: input.p84Eligible ? "P84 eligible" : "P84 gates not yet passing",
        action: "Run P84 eligibility preview (no live send)",
        result: plan.expectedP84ResultAfterFixes === "eligible" ? "P84 Send Eligible" : "Still blocked — review gates",
      },
    ];

  const firstPendingIndex = steps.findIndex((s) => !s.completed);

  return steps.map((step, index) => {
    const meta = STEP_META[step.id];
    return {
      stepId: step.id,
      stepNumber: index + 1,
      stepLabel: meta.label,
      candidateId: plan.candidateId,
      candidateName: plan.candidateName,
      positionId: plan.positionId,
      positionName: plan.positionName,
      dmTerritory: plan.dmTerritory,
      recommendedOwner: step.id === "assign_dm" ? plan.suggestedDm : owner,
      currentBlocker: step.blocker,
      requiredAction: step.action,
      expectedResult: step.result,
      riskLevel: meta.risk,
      manualApprovalRequired: meta.manualApproval,
      completed: step.completed,
      pending: !step.completed && (firstPendingIndex === -1 ? step.id === "recheck_p84" : index === firstPendingIndex),
    };
  });
}

function buildEntry(input: {
  plan: P84UnlockRecoveryPlan;
  row?: ScoredCandidateWorkflowRow;
  jobsByPositionId: Map<string, BreezyJob>;
  onboarding: CandidateOnboardingRecord | null;
}): OperationalQueueEntry {
  const { plan } = input;
  const jobPublished = Boolean(plan.positionId && input.jobsByPositionId.has(plan.positionId));
  const recruiterAssigned = !plan.recruiterAssignmentMissing;
  const dmAssigned = !plan.requiredFixes.some((fix) => fix.toLowerCase().includes("assign dm"));
  const workflowReady =
    plan.currentWorkflowStage === "Paperwork Needed" && !plan.p83ShouldAdvance;
  const p84Eligible = input.row
    ? buildPaperworkSendEligibility({
        row: input.row,
        onboarding: input.onboarding,
        jobsByPositionId: input.jobsByPositionId,
      }).eligible
    : false;

  let queueStatus: OperationalQueueStatus;
  if (plan.group === "monitor_only") {
    queueStatus = "monitor_only";
  } else if (plan.group === "not_fixable") {
    queueStatus = "blocked";
  } else if (plan.group === "current_eligible") {
    queueStatus = "ready_for_p84_preview";
  } else {
    queueStatus = resolveQueueStatus({
      plan,
      jobPublished,
      recruiterAssigned,
      dmAssigned,
      workflowReady,
      p84Eligible,
    });
  }

  const steps = buildActionSteps({
    plan,
    jobPublished,
    recruiterAssigned,
    dmAssigned,
    workflowReady: workflowReady || plan.group === "current_eligible",
    p84Eligible: p84Eligible || plan.group === "current_eligible",
  });

  const nextAction = steps.find((s) => s.pending) ?? steps.find((s) => !s.completed) ?? null;

  return {
    candidateId: plan.candidateId,
    candidateName: plan.candidateName,
    breezyCandidateId: plan.breezyCandidateId,
    positionId: plan.positionId,
    positionName: plan.positionName,
    dmTerritory: plan.dmTerritory,
    suggestedDm: plan.suggestedDm,
    recommendedRecruiter: plan.recommendedRecruiter,
    currentBlocker: nextAction?.currentBlocker ?? plan.requiredFixes[0] ?? "None",
    queueStatus,
    queueStatusLabel: OPERATIONAL_QUEUE_STATUS_LABELS[queueStatus],
    grade: plan.grade,
    steps,
    nextAction,
    canEnterSendQueue: false,
  };
}

function buildMetrics(
  entries: OperationalQueueEntry[],
  unlockReport: P84UnlockPreviewReport,
): PaperworkUnlockQueueMetrics {
  const counts = (status: OperationalQueueStatus) =>
    entries.filter((e) => e.queueStatus === status).length;
  return {
    totalUnlockable: unlockReport.unlockable.length,
    needsJobPublish: counts("needs_job_publish"),
    needsRecruiterAssignment: counts("needs_recruiter_assignment"),
    needsDmAssignment: counts("needs_dm_assignment"),
    needsP83Advancement: counts("needs_p83_advancement"),
    readyForP84Preview: counts("ready_for_p84_preview"),
    monitorOnly: counts("monitor_only"),
    blocked: counts("blocked"),
    readyToFix: unlockReport.unlockable.length,
    currentP84Eligible: unlockReport.summary.currentP84Eligible,
  };
}

export function buildP84OperationalQueueFromUnlockReport(input: {
  unlockReport: P84UnlockPreviewReport;
  rowsByCandidateId?: Map<string, ScoredCandidateWorkflowRow>;
  jobsByPositionId: Map<string, BreezyJob>;
  onboardingByCandidateId?: Map<string, CandidateOnboardingRecord>;
}): P84OperationalQueueReport {
  const onboardingByCandidateId = input.onboardingByCandidateId ?? new Map();
  const entries = input.unlockReport.recoveryPlans.map((plan) =>
    buildEntry({
      plan,
      row: input.rowsByCandidateId?.get(plan.candidateId),
      jobsByPositionId: input.jobsByPositionId,
      onboarding: onboardingByCandidateId.get(plan.candidateId) ?? null,
    }),
  );

  for (const entry of entries) {
    if (entry.queueStatus === "monitor_only" || entry.queueStatus === "blocked") {
      entry.canEnterSendQueue = false;
    }
  }

  const metrics = buildMetrics(entries, input.unlockReport);

  return {
    sourcePhase: P90_SOURCE_PHASE,
    previewMode: P90_PREVIEW_MODE,
    generatedAt: input.unlockReport.generatedAt,
    mtdRangeLabel: input.unlockReport.mtdRangeLabel,
    sectionTitle: "Paperwork Unlock Queue",
    metrics,
    entries,
    unlockable: entries.filter((e) => e.queueStatus !== "monitor_only" && e.queueStatus !== "blocked"),
    monitorOnly: entries.filter((e) => e.queueStatus === "monitor_only"),
    blocked: entries.filter((e) => e.queueStatus === "blocked"),
    readyForP84Preview: entries.filter((e) => e.queueStatus === "ready_for_p84_preview"),
    operationalOrder: input.unlockReport.summary.operationalOrder,
    remainingBlockersBeforeLiveSend: [
      "P84 liveSend disabled — preview queue only",
      "No Breezy publish/write automation in P90",
      "No production workflow writes from this queue",
      `${metrics.monitorOnly} candidates are monitor-only and cannot enter send queue`,
      `${metrics.blocked} candidates remain blocked after operational simulation`,
      "Manual approval required for all execution steps except P84 preview recheck",
    ],
  };
}

export function buildP84OperationalQueue(input: {
  rows: ScoredCandidateWorkflowRow[];
  jobsByPositionId: Map<string, BreezyJob>;
  workflows: Record<string, CandidateWorkflowRecord>;
  rosters: RecruiterRosters;
  onboardingByCandidateId?: Map<string, CandidateOnboardingRecord>;
  mtdRangeLabel?: string;
  paperworkByGrade?: PaperworkByGrade;
}): P84OperationalQueueReport {
  const unlockReport = buildP84UnlockPreview(input);
  const rowsByCandidateId = new Map(input.rows.map((row) => [row.candidateId, row]));
  return buildP84OperationalQueueFromUnlockReport({
    unlockReport,
    rowsByCandidateId,
    jobsByPositionId: input.jobsByPositionId,
    onboardingByCandidateId: input.onboardingByCandidateId,
  });
}

export async function buildP84OperationalQueueFromStores(input?: {
  mtdOnly?: boolean;
}): Promise<P84OperationalQueueReport> {
  const { buildP84UnlockPreviewFromStores } = await import("@/lib/p84-unlock-preview");
  const { readIngestionStore, listIngestedCandidates, filterMtdCandidates, currentMtdDateRange } =
    await import("@/lib/candidate-ingestion");
  const { getCandidateWorkflowBundle } = await import("@/lib/candidate-workflow-store");
  const { fetchBreezyJobs } = await import("@/lib/breezy-api");
  const { buildScoredWorkflowRow } = await import("@/lib/build-candidate-workflow-row");
  const { listAllCandidateOnboardingRecords } = await import(
    "@/lib/candidate-onboarding-engine/onboarding-record-store"
  );

  const [unlockReport, store, bundle, jobsResult, onboardingRecords] = await Promise.all([
    buildP84UnlockPreviewFromStores(input),
    readIngestionStore(),
    getCandidateWorkflowBundle(),
    fetchBreezyJobs("published"),
    listAllCandidateOnboardingRecords(),
  ]);

  const jobsByPositionId = new Map(
    (jobsResult.ok ? jobsResult.jobs : []).map((job) => [job.jobId, job]),
  );
  const range = currentMtdDateRange();
  const candidates =
    input?.mtdOnly === false
      ? listIngestedCandidates(store)
      : filterMtdCandidates(listIngestedCandidates(store), range);
  const rowsByCandidateId = new Map(
    candidates.map((candidate) => [
      candidate.candidateId,
      buildScoredWorkflowRow(candidate, bundle.workflows[candidate.candidateId], {
        job: jobsByPositionId.get(candidate.positionId),
      }),
    ]),
  );

  return buildP84OperationalQueueFromUnlockReport({
    unlockReport,
    rowsByCandidateId,
    jobsByPositionId,
    onboardingByCandidateId: new Map(
      onboardingRecords.map((record) => [record.candidateId, record]),
    ),
  });
}
