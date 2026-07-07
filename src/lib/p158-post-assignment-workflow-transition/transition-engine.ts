import type { BreezyCandidate } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import type { AuthSession } from "@/lib/auth/types";
import { upsertCandidateWorkflow } from "@/lib/candidate-workflow-store";
import { decideCandidateAction } from "@/lib/p157-recruiter-decision-engine/decision-engine";
import type { P156PrioritizedCandidate } from "@/lib/p156-candidate-prioritization/types";
import {
  appendP1583TransitionAuditEvent,
  registerP1583TransitionRollback,
} from "@/lib/p158-post-assignment-workflow-transition/transition-audit-store";
import { evaluateTransitionEligibility } from "@/lib/p158-post-assignment-workflow-transition/transition-rules";
import type { P1583TransitionAuditEvent } from "@/lib/p158-post-assignment-workflow-transition/transition-audit-store";
import type {
  P1583TransitionCandidateRow,
  P1583TransitionRunResult,
} from "@/lib/p158-post-assignment-workflow-transition/types";
import type { PaperworkAutomationAuditEvent } from "@/lib/p145-controlled-paperwork-automation/types";
import { randomUUID } from "node:crypto";

function applyTransitionToWorkflowRecord(
  workflow: CandidateWorkflowRecord,
): CandidateWorkflowRecord {
  const now = new Date().toISOString();
  return {
    ...workflow,
    workflowStatus: "Paperwork Needed",
    actionType: "send-paperwork",
    requiredAction: "Send paperwork",
    actionGeneratedAt: now,
    nextActionNeeded: "Send paperwork",
    updatedAt: now,
  };
}

function buildTransitionRow(input: {
  candidateId: string;
  candidateName: string;
  eligibility: ReturnType<typeof evaluateTransitionEligibility>;
  beforeStatus: string;
  beforeActionType: string | null;
  afterStatus: string | null;
  afterActionType: string | null;
  postTransitionP157Action: string | null;
  postTransitionConfidence: number | null;
  transitioned: boolean;
  dryRun: boolean;
}): P1583TransitionCandidateRow {
  return {
    candidateId: input.candidateId,
    candidateName: input.candidateName,
    eligible: input.eligibility.eligible,
    blocked: input.eligibility.blocked,
    alreadyTransitioned: input.eligibility.alreadyTransitioned,
    blockers: input.eligibility.blockers,
    skipReason: input.eligibility.skipReason,
    beforeWorkflowStatus: input.beforeStatus,
    beforeActionType: input.beforeActionType,
    afterWorkflowStatus: input.afterStatus,
    afterActionType: input.afterActionType,
    postTransitionP157Action: input.postTransitionP157Action,
    postTransitionConfidence: input.postTransitionConfidence,
    transitioned: input.transitioned,
    dryRun: input.dryRun,
  };
}

export async function runPostAssignmentTransitionCycle(input: {
  session: AuthSession;
  candidateIds: string[];
  workflows: Record<string, CandidateWorkflowRecord>;
  candidatesById: Map<string, BreezyCandidate>;
  priorityById: Map<string, P156PrioritizedCandidate>;
  onboardingByCandidate: Map<string, CandidateOnboardingRecord>;
  auditEvents: PaperworkAutomationAuditEvent[];
  jobsByPositionId: Map<string, import("@/lib/breezy-api").BreezyJob>;
  scoringMetaByCandidate: Map<
    string,
    {
      openDemand: number;
      coverageStatus: string;
      daysUntilProjectStart: number | null;
      projectName: string | null;
      jobStatus: string | null;
      jobPublished: boolean;
    }
  >;
  referenceMs: number;
  dryRun: boolean;
  stopOnFirstError?: boolean;
}): Promise<P1583TransitionRunResult> {
  const rows: P1583TransitionCandidateRow[] = [];
  const newAuditEvents: P1583TransitionAuditEvent[] = [];
  let transitionsCompleted = 0;
  let transitionsBlocked = 0;
  let transitionsSkipped = 0;
  let transitionsFailed = 0;
  let projectedSendPaperwork = 0;

  for (const candidateId of input.candidateIds) {
    const workflow = input.workflows[candidateId];
    const candidate = input.candidatesById.get(candidateId);
    const priority = input.priorityById.get(candidateId);
    if (!workflow || !candidate || !priority) {
      transitionsSkipped += 1;
      continue;
    }

    const row = buildScoredWorkflowRow(candidate, workflow, {
      job: input.jobsByPositionId.get(candidate.positionId ?? ""),
    });

    const eligibility = evaluateTransitionEligibility({
      row,
      candidate,
      workflow,
      onboarding: input.onboardingByCandidate.get(candidateId) ?? null,
      auditEvents: input.auditEvents,
    });

    const beforeStatus = workflow.workflowStatus;
    const beforeActionType = workflow.actionType ?? row.actionType ?? null;

    if (eligibility.alreadyTransitioned) {
      transitionsSkipped += 1;
      const p157 = decidePostTransition(input, candidateId, workflow, candidate, priority);
      if (p157?.action === "Send Paperwork") projectedSendPaperwork += 1;
      rows.push(
        buildTransitionRow({
          candidateId,
          candidateName: priority.candidateName,
          eligibility,
          beforeStatus,
          beforeActionType,
          afterStatus: beforeStatus,
          afterActionType: beforeActionType,
          postTransitionP157Action: p157?.action ?? null,
          postTransitionConfidence: p157?.confidence ?? null,
          transitioned: false,
          dryRun: input.dryRun,
        }),
      );
      if (!input.dryRun) {
        const event = await appendP1583TransitionAuditEvent({
          candidateId,
          candidateName: priority.candidateName,
          action: "skipped",
          executionMode: "production",
          beforeWorkflowStatus: beforeStatus,
          afterWorkflowStatus: beforeStatus,
          beforeActionType,
          afterActionType: beforeActionType,
          reason: eligibility.skipReason ?? "Already transitioned",
          rollbackId: null,
        });
        newAuditEvents.push(event);
      }
      continue;
    }

    if (!eligibility.eligible) {
      transitionsBlocked += 1;
      rows.push(
        buildTransitionRow({
          candidateId,
          candidateName: priority.candidateName,
          eligibility,
          beforeStatus,
          beforeActionType,
          afterStatus: null,
          afterActionType: null,
          postTransitionP157Action: null,
          postTransitionConfidence: null,
          transitioned: false,
          dryRun: input.dryRun,
        }),
      );
      if (!input.dryRun) {
        const event = await appendP1583TransitionAuditEvent({
          candidateId,
          candidateName: priority.candidateName,
          action: "blocked",
          executionMode: "production",
          beforeWorkflowStatus: beforeStatus,
          afterWorkflowStatus: null,
          beforeActionType,
          afterActionType: null,
          reason: eligibility.blockers.join("; ") || "Blocked",
          rollbackId: null,
        });
        newAuditEvents.push(event);
      }
      continue;
    }

    const rollbackId = `p1583-rb-${randomUUID()}`;

    try {
      if (input.dryRun) {
        const simulated = applyTransitionToWorkflowRecord(workflow);
        input.workflows[candidateId] = simulated;
        transitionsCompleted += 1;
        const p157 = decidePostTransition(input, candidateId, simulated, candidate, priority);
        if (p157?.action === "Send Paperwork") projectedSendPaperwork += 1;
        rows.push(
          buildTransitionRow({
            candidateId,
            candidateName: priority.candidateName,
            eligibility,
            beforeStatus,
            beforeActionType,
            afterStatus: "Paperwork Needed",
            afterActionType: "send-paperwork",
            postTransitionP157Action: p157?.action ?? null,
            postTransitionConfidence: p157?.confidence ?? null,
            transitioned: true,
            dryRun: true,
          }),
        );
        continue;
      }

      const updated = await upsertCandidateWorkflow({
        candidateId,
        workflowStatus: "Paperwork Needed",
        actionType: "send-paperwork",
        requiredAction: "Send paperwork",
        actionGeneratedAt: new Date().toISOString(),
        audit: {
          action: "p158_workflow_transition",
          byUserId: input.session.userId,
          metadata: { rollbackId, phase: "P158.3" },
        },
      });

      input.workflows[candidateId] = updated;
      transitionsCompleted += 1;

      const p157 = decidePostTransition(input, candidateId, updated, candidate, priority);
      if (p157?.action === "Send Paperwork") projectedSendPaperwork += 1;

      const event = await appendP1583TransitionAuditEvent({
        candidateId,
        candidateName: priority.candidateName,
        action: "transitioned",
        executionMode: "production",
        beforeWorkflowStatus: beforeStatus,
        afterWorkflowStatus: "Paperwork Needed",
        beforeActionType,
        afterActionType: "send-paperwork",
        reason: "Post-assignment transition to Paperwork Needed",
        rollbackId,
      });
      newAuditEvents.push(event);

      await registerP1583TransitionRollback({
        rollbackId,
        auditEventId: event.id,
        candidateId,
        beforeWorkflowStatus: beforeStatus,
        beforeActionType,
        beforeRequiredAction: workflow.requiredAction ?? null,
        afterWorkflowStatus: "Paperwork Needed",
        afterActionType: "send-paperwork",
        createdAt: event.at,
      });

      rows.push(
        buildTransitionRow({
          candidateId,
          candidateName: priority.candidateName,
          eligibility,
          beforeStatus,
          beforeActionType,
          afterStatus: "Paperwork Needed",
          afterActionType: "send-paperwork",
          postTransitionP157Action: p157?.action ?? null,
          postTransitionConfidence: p157?.confidence ?? null,
          transitioned: true,
          dryRun: false,
        }),
      );
    } catch (error) {
      transitionsFailed += 1;
      if (!input.dryRun) {
        await appendP1583TransitionAuditEvent({
          candidateId,
          candidateName: priority.candidateName,
          action: "failed",
          executionMode: "production",
          beforeWorkflowStatus: beforeStatus,
          afterWorkflowStatus: null,
          beforeActionType,
          afterActionType: null,
          reason: error instanceof Error ? error.message : "Transition failed",
          rollbackId: null,
        });
      }
      if (input.stopOnFirstError !== false) break;
    }
  }

  return {
    ok: transitionsFailed === 0,
    dryRun: input.dryRun,
    message: input.dryRun
      ? `P158.3 dry-run — ${transitionsCompleted} candidate(s) would transition to Paperwork Needed (${projectedSendPaperwork} projected Send Paperwork).`
      : `P158.3 production — ${transitionsCompleted} transition(s) applied (workflow only, no paperwork sends).`,
    transitionsCompleted,
    transitionsBlocked,
    transitionsSkipped,
    transitionsFailed,
    projectedSendPaperwork,
    candidates: rows,
    auditEvents: newAuditEvents,
  };
}

function decidePostTransition(
  input: {
    workflows: Record<string, CandidateWorkflowRecord>;
    candidatesById: Map<string, BreezyCandidate>;
    priorityById: Map<string, P156PrioritizedCandidate>;
    onboardingByCandidate: Map<string, CandidateOnboardingRecord>;
    auditEvents: PaperworkAutomationAuditEvent[];
    jobsByPositionId: Map<string, import("@/lib/breezy-api").BreezyJob>;
    scoringMetaByCandidate: Map<
      string,
      {
        openDemand: number;
        coverageStatus: string;
        daysUntilProjectStart: number | null;
        projectName: string | null;
        jobStatus: string | null;
        jobPublished: boolean;
      }
    >;
    referenceMs: number;
  },
  candidateId: string,
  workflow: CandidateWorkflowRecord,
  candidate: BreezyCandidate,
  priority: P156PrioritizedCandidate,
) {
  const row = buildScoredWorkflowRow(candidate, workflow, {
    job: input.jobsByPositionId.get(candidate.positionId ?? ""),
  });
  const meta = input.scoringMetaByCandidate.get(candidateId) ?? {
    openDemand: priority.openDemand,
    coverageStatus: "Healthy",
    daysUntilProjectStart: null,
    projectName: priority.project,
    jobStatus: null,
    jobPublished: false,
  };

  return decideCandidateAction({
    row,
    candidate,
    onboarding: input.onboardingByCandidate.get(candidateId) ?? null,
    auditEvents: input.auditEvents,
    priority,
    scoringMeta: meta,
    recruiterWorkload: 1,
    referenceMs: input.referenceMs,
  });
}
