import type { AuthSession } from "@/lib/auth/types";
import { listCandidateOnboardingRecords } from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import { getCandidateWorkflowBundle } from "@/lib/candidate-workflow-store";
import { listIngestedCandidates, readIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import { loadPaperworkAutomationAuditLog } from "@/lib/p145-controlled-paperwork-automation/paperwork-automation-audit-store";
import { buildPrioritizedQueueFromCohort } from "@/lib/p156-candidate-prioritization/build-prioritized-queue";
import {
  buildScoringContextForRow,
  loadPrioritizationCohort,
} from "@/lib/p156-candidate-prioritization/load-prioritization-cohort";
import {
  appendP158AssignmentAuditEvent,
  loadP158AssignmentAuditLog,
  registerP158Rollback,
} from "@/lib/p158-autonomous-recruiter-assignment/assignment-audit-store";
import {
  getP158MaxAssignmentsPerRun,
  isP158AutomaticAssignmentsEnabled,
} from "@/lib/p158-autonomous-recruiter-assignment/assignment-config";
import {
  buildP158AssignmentQueue,
  findAssignmentDecision,
} from "@/lib/p158-autonomous-recruiter-assignment/assignment-engine";
import { buildAssignmentDashboard } from "@/lib/p158-autonomous-recruiter-assignment/build-assignment-dashboard";
import { pickNextAssignable } from "@/lib/p158-autonomous-recruiter-assignment/recommendation-builder";
import type { P158RunResult } from "@/lib/p158-autonomous-recruiter-assignment/types";
import {
  isP158TransitionProductionReady,
  isP158WorkflowTransitionEnabled,
  runPostAssignmentTransitionCycle,
} from "@/lib/p158-post-assignment-workflow-transition";
import { applyRecruiterAssignments } from "@/lib/recruiter-assignment-engine/apply-recruiter-assignments";
import { buildRecruiterAssignmentDecisions } from "@/lib/recruiter-assignment-engine/build-assignment-decision";
import { randomUUID } from "node:crypto";
import { shouldSkipExistingRecruiter } from "@/lib/p158-autonomous-recruiter-assignment/assignment-rules";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";

async function buildTransitionContext(
  cohort: Awaited<ReturnType<typeof loadPrioritizationCohort>>,
  referenceMs: number,
) {
  const priorityQueue = buildPrioritizedQueueFromCohort(cohort);
  const priorityById = new Map(priorityQueue.candidates.map((c) => [c.candidateId, c]));
  const scoringMetaByCandidate = new Map<
    string,
    {
      openDemand: number;
      coverageStatus: string;
      daysUntilProjectStart: number | null;
      projectName: string | null;
      jobStatus: string | null;
      jobPublished: boolean;
    }
  >();

  for (const row of cohort.candidates) {
    const meta = buildScoringContextForRow({
      row,
      coverageNeeds: cohort.coverageNeeds,
      opportunities: cohort.opportunities,
      jobsByPositionId: cohort.jobsByPositionId,
      referenceMs,
    });
    const job = cohort.jobsByPositionId.get(row.positionId);
    scoringMetaByCandidate.set(row.candidateId, {
      openDemand: meta.openDemand,
      coverageStatus: meta.coverageStatus,
      daysUntilProjectStart: meta.daysUntilProjectStart,
      projectName: meta.projectName,
      jobStatus: job?.status ?? null,
      jobPublished: job?.status === "published",
    });
  }

  const paperworkAudit = await loadPaperworkAutomationAuditLog();
  return { priorityById, scoringMetaByCandidate, paperworkAudit };
}

function simulateAssignmentOnWorkflow(
  workflows: Record<string, CandidateWorkflowRecord>,
  item: { candidateId: string; recommendedRecruiter: string | null; dm: string | null },
): void {
  const wf = workflows[item.candidateId];
  if (!wf || !item.recommendedRecruiter) return;
  workflows[item.candidateId] = {
    ...wf,
    assignedRecruiter: item.recommendedRecruiter,
    assignedDM: item.dm?.trim() || wf.assignedDM || "Unassigned",
    recruiterAssignmentSource: "auto",
  };
}

export async function runP158AssignmentCycle(input: {
  session: AuthSession;
  confirmAssignment?: boolean;
  confirmTransition?: boolean;
  allowOverwrite?: boolean;
  transitionAfterAssignment?: boolean;
}): Promise<P158RunResult> {
  const productionEnabled = isP158AutomaticAssignmentsEnabled();
  const assignmentDryRun = !productionEnabled || input.confirmAssignment !== true;
  const transitionProduction = isP158TransitionProductionReady({
    confirmAssignment: input.confirmAssignment === true,
    confirmTransition: input.confirmTransition === true,
  });
  const transitionDryRun = !transitionProduction;
  const maxAssignments = getP158MaxAssignmentsPerRun();

  const [cohortBase, bundle, store, auditEvents, onboardingRecords] = await Promise.all([
    loadPrioritizationCohort(),
    getCandidateWorkflowBundle(),
    readIngestionStore(),
    loadP158AssignmentAuditLog(),
    listCandidateOnboardingRecords(500),
  ]);

  const candidatesById = new Map(
    listIngestedCandidates(store).map((candidate) => [candidate.candidateId, candidate]),
  );
  const cohort = { ...cohortBase, candidatesById };
  const workflows = { ...bundle.workflows };
  const jobs = [...cohort.jobsByPositionId.values()];
  const onboardingByCandidate = new Map(onboardingRecords.map((r) => [r.candidateId, r]));
  const referenceMs = Date.parse(cohort.fetchedAt);
  const transitionCtx = await buildTransitionContext(cohort, referenceMs);

  let queue = buildP158AssignmentQueue({
    cohort,
    workflows: bundle.workflows,
    rosters: bundle.rosters,
    jobs,
    onboardingByCandidate,
    auditEvents,
    referenceMs,
  });

  const newAuditEvents: import("@/lib/p158-autonomous-recruiter-assignment/types").P158AssignmentAuditEvent[] = [];
  const assignedCandidateIds = new Set<string>();
  const transitionedCandidateIds: string[] = [];
  let assignmentsCompleted = 0;
  let assignmentsSkipped = 0;
  let assignmentsBlocked = 0;
  let assignmentsFailed = 0;

  if (assignmentDryRun) {
    const queuedItems = queue.filter((q) => q.status === "queued").slice(0, maxAssignments);
    for (const item of queuedItems) {
      const event = await appendP158AssignmentAuditEvent({
        candidateId: item.candidateId,
        candidateName: item.candidateName,
        action: "simulated",
        recruiter: item.recommendedRecruiter,
        confidence: item.confidence,
        reason: `Simulation — would assign ${item.recommendedRecruiter}`,
        executionMode: "simulation",
        beforeRecruiter: item.assignedRecruiter,
        afterRecruiter: item.recommendedRecruiter,
        rollbackId: null,
      });
      newAuditEvents.push(event);
      assignmentsSkipped += 1;
      if (input.transitionAfterAssignment) {
        simulateAssignmentOnWorkflow(workflows, item);
        transitionedCandidateIds.push(item.candidateId);
      }
    }

    let transition;
    if (input.transitionAfterAssignment && transitionedCandidateIds.length > 0) {
      transition = await runPostAssignmentTransitionCycle({
        session: input.session,
        candidateIds: transitionedCandidateIds,
        workflows,
        candidatesById,
        priorityById: transitionCtx.priorityById,
        onboardingByCandidate,
        auditEvents: transitionCtx.paperworkAudit,
        jobsByPositionId: cohort.jobsByPositionId,
        scoringMetaByCandidate: transitionCtx.scoringMetaByCandidate,
        referenceMs,
        dryRun: true,
      });
    }

    const dashboard = await buildAssignmentDashboard();
    const transitionHint = isP158WorkflowTransitionEnabled()
      ? ""
      : " P158_WORKFLOW_TRANSITION_ENABLED is false.";
    return {
      ok: true,
      dryRun: true,
      message: productionEnabled
        ? `Simulation complete — set confirmAssignment=true to persist assignments.${transitionHint}`
        : `Simulation mode — P158_AUTOMATIC_ASSIGNMENTS_ENABLED is false.${transitionHint}`,
      assignmentsCompleted: 0,
      assignmentsSkipped,
      assignmentsBlocked,
      assignmentsFailed,
      auditEvents: newAuditEvents,
      dashboard,
      transition,
    };
  }

  while (assignmentsCompleted < maxAssignments) {
    queue = buildP158AssignmentQueue({
      cohort,
      workflows,
      rosters: bundle.rosters,
      jobs,
      onboardingByCandidate,
      auditEvents: [...auditEvents, ...newAuditEvents],
      referenceMs,
    });

    const next = pickNextAssignable(queue, assignedCandidateIds);
    if (!next?.recommendedRecruiter) break;

    const existing = workflows[next.candidateId];
    if (!input.allowOverwrite && shouldSkipExistingRecruiter(existing)) {
      assignmentsBlocked += 1;
      await appendP158AssignmentAuditEvent({
        candidateId: next.candidateId,
        candidateName: next.candidateName,
        action: "blocked",
        recruiter: next.recommendedRecruiter,
        confidence: next.confidence,
        reason: "Existing recruiter protected — overwrite not approved.",
        executionMode: "production",
        beforeRecruiter: existing?.assignedRecruiter ?? null,
        afterRecruiter: null,
        rollbackId: null,
      });
      assignedCandidateIds.add(next.candidateId);
      continue;
    }

    const decisions = buildRecruiterAssignmentDecisions({
      candidates: [...candidatesById.values()],
      workflows,
      rosters: bundle.rosters,
      jobsByPositionId: cohort.jobsByPositionId,
    });
    const decision = findAssignmentDecision(decisions, next.candidateId);
    if (!decision?.shouldAssign) {
      assignmentsBlocked += 1;
      assignedCandidateIds.add(next.candidateId);
      continue;
    }

    const beforeRecruiter = existing?.assignedRecruiter ?? null;
    const rollbackId = `p158-rb-${randomUUID()}`;

    try {
      const applied = await applyRecruiterAssignments({
        decisions: [decision],
        candidatesById,
        workflows,
        byUserId: input.session.userId,
      });

      if (applied.length === 0) {
        assignmentsSkipped += 1;
        assignedCandidateIds.add(next.candidateId);
        continue;
      }

      assignmentsCompleted += 1;
      assignedCandidateIds.add(next.candidateId);
      if (input.transitionAfterAssignment) {
        transitionedCandidateIds.push(next.candidateId);
      }

      const event = await appendP158AssignmentAuditEvent({
        candidateId: next.candidateId,
        candidateName: next.candidateName,
        action: "assigned",
        recruiter: decision.recruiter,
        confidence: decision.confidence,
        reason: decision.reason,
        executionMode: "production",
        beforeRecruiter,
        afterRecruiter: decision.recruiter,
        rollbackId,
      });
      newAuditEvents.push(event);

      await registerP158Rollback({
        rollbackId,
        auditEventId: event.id,
        candidateId: next.candidateId,
        beforeRecruiter,
        beforeDm: existing?.assignedDM ?? null,
        afterRecruiter: decision.recruiter,
        createdAt: event.at,
      });
    } catch (error) {
      assignmentsFailed += 1;
      await appendP158AssignmentAuditEvent({
        candidateId: next.candidateId,
        candidateName: next.candidateName,
        action: "failed",
        recruiter: decision.recruiter,
        confidence: decision.confidence,
        reason: error instanceof Error ? error.message : "Assignment failed",
        executionMode: "production",
        beforeRecruiter,
        afterRecruiter: null,
        rollbackId: null,
      });
      break;
    }
  }

  let transition;
  if (input.transitionAfterAssignment && transitionedCandidateIds.length > 0) {
    transition = await runPostAssignmentTransitionCycle({
      session: input.session,
      candidateIds: transitionedCandidateIds,
      workflows,
      candidatesById,
      priorityById: transitionCtx.priorityById,
      onboardingByCandidate,
      auditEvents: transitionCtx.paperworkAudit,
      jobsByPositionId: cohort.jobsByPositionId,
      scoringMetaByCandidate: transitionCtx.scoringMetaByCandidate,
      referenceMs,
      dryRun: transitionDryRun,
      stopOnFirstError: true,
    });
    if (!transition.ok) {
      assignmentsFailed += 1;
    }
  }

  const dashboard = await buildAssignmentDashboard();
  const parts = [`${assignmentsCompleted} assignment(s) applied`];
  if (transition) {
    parts.push(
      transition.dryRun
        ? `${transition.transitionsCompleted} transition(s) simulated`
        : `${transition.transitionsCompleted} transition(s) applied`,
    );
    parts.push(`${transition.projectedSendPaperwork} projected Send Paperwork`);
  }

  return {
    ok: assignmentsFailed === 0 && (transition?.ok ?? true),
    dryRun: false,
    message: `Production run complete — ${parts.join(", ")} (workflow store only, no Breezy or paperwork writes).`,
    assignmentsCompleted,
    assignmentsSkipped,
    assignmentsBlocked,
    assignmentsFailed,
    auditEvents: newAuditEvents,
    dashboard,
    transition,
  };
}
