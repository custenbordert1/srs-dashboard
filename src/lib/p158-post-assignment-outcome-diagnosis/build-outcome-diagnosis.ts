import type { BreezyCandidate } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { getCandidateWorkflowBundle } from "@/lib/candidate-workflow-store";
import { listCandidateOnboardingRecords } from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import { listIngestedCandidates, readIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import { classifyPaperworkStage } from "@/lib/executive-paperwork-dashboard/classify-paperwork-stage";
import { loadPaperworkAutomationAuditLog } from "@/lib/p145-controlled-paperwork-automation/paperwork-automation-audit-store";
import { buildPrioritizedQueueFromCohort } from "@/lib/p156-candidate-prioritization/build-prioritized-queue";
import {
  buildScoringContextForRow,
  loadPrioritizationCohort,
} from "@/lib/p156-candidate-prioritization/load-prioritization-cohort";
import { loadP158AssignmentAuditLog } from "@/lib/p158-autonomous-recruiter-assignment/assignment-audit-store";
import { getP158MaxAssignmentsPerRun } from "@/lib/p158-autonomous-recruiter-assignment/assignment-config";
import { buildP158AssignmentQueue } from "@/lib/p158-autonomous-recruiter-assignment/assignment-engine";
import { sortAssignmentQueue } from "@/lib/p158-autonomous-recruiter-assignment/recommendation-builder";
import type { P158AssignmentQueueItem } from "@/lib/p158-autonomous-recruiter-assignment/types";
import {
  buildP157DecisionContext,
  decideCandidateAction,
} from "@/lib/p157-recruiter-decision-engine/decision-engine";
import { evaluateP157ActionRule } from "@/lib/p157-recruiter-decision-engine/action-rules";
import { classifyBlocker, isAutomatableBlocker } from "@/lib/p158-post-assignment-outcome-diagnosis/classify-blocker";
import { diagnosePrimaryBlocker } from "@/lib/p158-post-assignment-outcome-diagnosis/diagnose-blocker";
import { buildDiagnosisSummary } from "@/lib/p158-post-assignment-outcome-diagnosis/diagnosis-summary";
import { recommendFixForBlocker } from "@/lib/p158-post-assignment-outcome-diagnosis/recommend-fix";
import type { P1582CandidateDiagnosis, P1582OutcomeDiagnosis } from "@/lib/p158-post-assignment-outcome-diagnosis/types";
import { P158_2_SOURCE_PHASE } from "@/lib/p158-post-assignment-outcome-diagnosis/types";

function resolveSimulatedDm(
  item: P158AssignmentQueueItem,
  workflow: CandidateWorkflowRecord,
  priorityDm: string | null | undefined,
): string {
  if (item.dm?.trim()) return item.dm.trim();
  if (priorityDm?.trim() && !isUnassignedRecruiter(priorityDm)) return priorityDm.trim();
  const wfDm = workflow.assignedDM?.trim();
  if (wfDm && !isUnassignedRecruiter(wfDm)) return wfDm;
  return item.dm?.trim() || priorityDm?.trim() || workflow.assignedDM || "Unassigned";
}

function diagnoseCandidate(input: {
  item: P158AssignmentQueueItem;
  workflow: CandidateWorkflowRecord;
  candidate: BreezyCandidate;
  onboarding: import("@/lib/candidate-onboarding-engine/types").CandidateOnboardingRecord | null;
  auditEvents: import("@/lib/p145-controlled-paperwork-automation/types").PaperworkAutomationAuditEvent[];
  priority: import("@/lib/p156-candidate-prioritization/types").P156PrioritizedCandidate;
  scoringMeta: {
    openDemand: number;
    coverageStatus: string;
    daysUntilProjectStart: number | null;
    projectName: string | null;
    jobStatus: string | null;
    jobPublished: boolean;
  };
  jobsByPositionId: Map<string, import("@/lib/breezy-api").BreezyJob>;
  recruiterLoads: Map<string, number>;
  referenceMs: number;
}): P1582CandidateDiagnosis | null {
  if (!input.item.recommendedRecruiter) return null;

  const simulatedWorkflow: CandidateWorkflowRecord = {
    ...input.workflow,
    assignedRecruiter: input.item.recommendedRecruiter,
    assignedDM: resolveSimulatedDm(input.item, input.workflow, input.priority.dm),
    recruiterAssignmentSource: "auto",
    recruiterAssignmentConfidence: input.item.confidence,
  };

  const row = buildScoredWorkflowRow(input.candidate, simulatedWorkflow, {
    job: input.jobsByPositionId.get(input.candidate.positionId ?? ""),
  });

  const decision = decideCandidateAction({
    row,
    candidate: input.candidate,
    onboarding: input.onboarding,
    auditEvents: input.auditEvents,
    priority: {
      ...input.priority,
      recruiter: input.item.recommendedRecruiter,
      dm: simulatedWorkflow.assignedDM,
    },
    scoringMeta: input.scoringMeta,
    recruiterWorkload: input.recruiterLoads.get(input.item.recommendedRecruiter) ?? 1,
    referenceMs: input.referenceMs,
  });

  const ctx = buildP157DecisionContext({
    row,
    candidate: input.candidate,
    onboarding: input.onboarding,
    auditEvents: input.auditEvents,
    scoringMeta: input.scoringMeta,
    recruiterWorkload: input.recruiterLoads.get(input.item.recommendedRecruiter) ?? 1,
    referenceMs: input.referenceMs,
  });

  const paperworkStage = classifyPaperworkStage({ row, onboarding: input.onboarding });
  const rule = evaluateP157ActionRule({ row, ctx, paperworkStage });

  const diagnosis = diagnosePrimaryBlocker({
    row,
    candidate: input.candidate,
    ctx,
    paperworkStage,
    onboarding: input.onboarding,
    auditEvents: input.auditEvents,
    jobsByPositionId: input.jobsByPositionId,
    referenceMs: input.referenceMs,
    decisionConfidence: decision.confidence,
  });

  const blockerClass = classifyBlocker(diagnosis.code);
  const automatable = isAutomatableBlocker(diagnosis.code, blockerClass);

  const postAssignmentAction =
    decision.action === "Candidate Duplicate" ||
    decision.action === "Position Closed" ||
    decision.action === "Reject Candidate"
      ? ("Blocked" as const)
      : decision.action;

  return {
    candidateId: input.item.candidateId,
    candidateName: input.item.candidateName,
    recruiter: input.item.recommendedRecruiter,
    dm: simulatedWorkflow.assignedDM,
    postAssignmentAction,
    confidence: decision.confidence,
    workflowStatus: row.workflowStatus,
    paperworkStage,
    primaryBlocker: diagnosis.code,
    blockerReason: diagnosis.reason,
    blockerClass,
    automatable,
    recommendedFix: recommendFixForBlocker(diagnosis.code),
    allBlockers: diagnosis.allBlockers,
    signals: rule.signals,
  };
}

export async function buildPostAssignmentOutcomeDiagnosis(input?: {
  maxAssignments?: number | null;
  simulatedAssignments?: P158AssignmentQueueItem[];
}): Promise<P1582OutcomeDiagnosis> {
  const [
    cohortBase,
    bundle,
    store,
    p158AuditEvents,
    paperworkAuditEvents,
    onboardingRecords,
  ] = await Promise.all([
    loadPrioritizationCohort(),
    getCandidateWorkflowBundle(),
    readIngestionStore(),
    loadP158AssignmentAuditLog(),
    loadPaperworkAutomationAuditLog(),
    listCandidateOnboardingRecords(500),
  ]);

  const candidatesById = new Map(
    listIngestedCandidates(store).map((candidate) => [candidate.candidateId, candidate]),
  );
  const cohort = { ...cohortBase, candidatesById };
  const jobs = [...cohort.jobsByPositionId.values()];
  const onboardingByCandidate = new Map(onboardingRecords.map((r) => [r.candidateId, r]));
  const referenceMs = Date.parse(cohort.fetchedAt);

  const queue = sortAssignmentQueue(
    buildP158AssignmentQueue({
      cohort,
      workflows: bundle.workflows,
      rosters: bundle.rosters,
      jobs,
      onboardingByCandidate,
      auditEvents: p158AuditEvents,
      referenceMs,
    }),
  );

  const maxCap = input?.maxAssignments ?? getP158MaxAssignmentsPerRun();
  const simulatedAssignments =
    input?.simulatedAssignments ??
    queue.filter((q) => q.status === "queued").slice(0, maxCap);

  const priorityQueue = buildPrioritizedQueueFromCohort(cohort);
  const priorityById = new Map(priorityQueue.candidates.map((c) => [c.candidateId, c]));

  const recruiterLoads = new Map<string, number>();
  for (const wf of Object.values(bundle.workflows)) {
    const key = wf.assignedRecruiter?.trim();
    if (!key || isUnassignedRecruiter(key)) continue;
    recruiterLoads.set(key, (recruiterLoads.get(key) ?? 0) + 1);
  }
  for (const item of simulatedAssignments) {
    if (!item.recommendedRecruiter) continue;
    recruiterLoads.set(
      item.recommendedRecruiter,
      (recruiterLoads.get(item.recommendedRecruiter) ?? 0) + 1,
    );
  }

  const candidates: P1582CandidateDiagnosis[] = [];

  for (const item of simulatedAssignments) {
    const candidate = candidatesById.get(item.candidateId);
    const workflow = bundle.workflows[item.candidateId];
    const priority = priorityById.get(item.candidateId);
    if (!candidate || !workflow || !priority) continue;

    const cohortRow = cohort.candidates.find((c) => c.candidateId === item.candidateId);
    if (!cohortRow) continue;

    const meta = buildScoringContextForRow({
      row: cohortRow,
      coverageNeeds: cohort.coverageNeeds,
      opportunities: cohort.opportunities,
      jobsByPositionId: cohort.jobsByPositionId,
      referenceMs,
    });
    const job = cohort.jobsByPositionId.get(cohortRow.positionId);
    const scoringMeta = {
      openDemand: meta.openDemand,
      coverageStatus: meta.coverageStatus,
      daysUntilProjectStart: meta.daysUntilProjectStart,
      projectName: meta.projectName,
      jobStatus: job?.status ?? null,
      jobPublished: job?.status === "published",
    };

    const row = diagnoseCandidate({
      item,
      workflow,
      candidate,
      onboarding: onboardingByCandidate.get(item.candidateId) ?? null,
      auditEvents: paperworkAuditEvents,
      priority,
      scoringMeta,
      jobsByPositionId: cohort.jobsByPositionId,
      recruiterLoads,
      referenceMs,
    });
    if (row) candidates.push(row);
  }

  const summary = buildDiagnosisSummary(candidates);

  return {
    generatedAt: cohort.fetchedAt,
    readOnly: true,
    sourcePhase: P158_2_SOURCE_PHASE,
    simulationOnly: true,
    summary,
    candidates,
    warnings: cohort.warnings,
  };
}
