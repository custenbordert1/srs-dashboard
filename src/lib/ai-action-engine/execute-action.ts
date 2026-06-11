import type { AuthSession } from "@/lib/auth/types";
import { toggleCandidateRecruitingAction, upsertCandidateWorkflow } from "@/lib/candidate-workflow-store";
import { buildRoutePlan } from "@/lib/coverage-optimization";
import { createJobDraft } from "@/lib/job-management/job-draft-store";
import { buildMelLoadDispatch } from "@/lib/workforce-ops-center";
import { fetchBreezyCandidates } from "@/lib/breezy-api";
import { parseMelOpportunities } from "@/lib/mel-matching/mel-opportunity-parser";
import { fetchMelProjectsSheet } from "@/lib/mel-projects-sheet";
import { createRecruiterEscalation } from "@/lib/operational-escalation/operational-escalation-store";
import type { OperationalEscalationType } from "@/lib/operational-escalation/operational-escalation-types";
import { assertManualConfirmationRequired } from "@/lib/ai-action-engine/automation-guard";
import { recordAiActionTaken, recordAiRecommendation } from "@/lib/ai-action-engine/ai-action-store";
import type {
  AiActionExecutionResult,
  AiActionKind,
  AiActionPayload,
} from "@/lib/ai-action-engine/types";

const VALID_ESCALATION_TYPES = new Set<string>([
  "request-repost",
  "request-new-ad",
  "request-recruiter-assignment",
  "expand-radius",
  "request-pay-review",
  "escalate-recruiting",
  "coverage-concern",
  "low-applicant-flow",
  "aging-job-review",
]);

async function executeKind(
  actionKind: AiActionKind,
  payload: AiActionPayload,
  session: AuthSession,
): Promise<{ ok: boolean; message: string; outcomeId?: string }> {
  switch (actionKind) {
    case "send-follow-up": {
      const candidateId = payload.candidateId?.trim();
      if (!candidateId) return { ok: false, message: "candidateId required" };
      await toggleCandidateRecruitingAction({
        candidateId,
        type: "needs-follow-up",
        enabled: true,
        byUserId: session.userId,
      });
      return { ok: true, message: "Follow-up flagged for candidate", outcomeId: candidateId };
    }
    case "assign-recruiter": {
      const candidateId = payload.candidateId?.trim();
      const assignedRecruiter = payload.assignedRecruiter?.trim() || session.name;
      if (!candidateId) return { ok: false, message: "candidateId required" };
      const workflow = await upsertCandidateWorkflow({
        candidateId,
        assignedRecruiter,
        audit: { action: "assign_recruiter", byUserId: session.userId },
      });
      return { ok: true, message: `Assigned to ${assignedRecruiter}`, outcomeId: workflow.candidateId };
    }
    case "push-candidate-mel": {
      const candidateId = payload.candidateId?.trim();
      if (!candidateId) return { ok: false, message: "candidateId required" };
      const candidatesResult = await fetchBreezyCandidates({ scanMode: "fast" });
      if (!candidatesResult.ok) return { ok: false, message: candidatesResult.error };
      const candidate = candidatesResult.candidates.find((row) => row.candidateId === candidateId);
      if (!candidate) return { ok: false, message: "Candidate not found" };
      const melResult = await fetchMelProjectsSheet();
      const opportunities = melResult.ok ? parseMelOpportunities(melResult.rows) : [];
      const opportunity = opportunities.find((row) => row.opportunityId === payload.opportunityId);
      buildMelLoadDispatch(candidate, {
        candidateId,
        opportunityId: payload.opportunityId ?? opportunity?.opportunityId ?? null,
        territory: candidate.state,
      });
      const workflow = await upsertCandidateWorkflow({
        candidateId,
        workflowStatus: "Ready for MEL",
        note: "Queued for MEL load via AI action engine",
        audit: { action: "mel_pipeline_push", byUserId: session.userId },
      });
      return { ok: true, message: "Candidate queued for MEL", outcomeId: workflow.candidateId };
    }
    case "create-dm-escalation": {
      const escalationType = VALID_ESCALATION_TYPES.has(payload.escalationType ?? "")
        ? (payload.escalationType as OperationalEscalationType)
        : "escalate-recruiting";
      const item = await createRecruiterEscalation(
        {
          escalationType,
          dmName: payload.dmName?.trim() || session.name,
          dmUserId: session.userId,
          territory: payload.territory?.trim() || payload.state?.trim() || "Territory",
          territoryStates: payload.state ? [payload.state] : [],
          state: payload.state?.trim() || "—",
          city: payload.city?.trim() || "—",
          relatedJobId: payload.jobId?.trim() || payload.opportunityId?.trim() || "ai-action",
          jobTitle: payload.jobTitle?.trim() || "AI action escalation",
          recommendedAction: payload.insightId ? `Insight ${payload.insightId}` : undefined,
          alertReason: "Created from AI action engine",
          sourceEscalationLogId: payload.insightId,
        },
        session,
      );
      return { ok: true, message: "DM escalation created", outcomeId: item.id };
    }
    case "create-job-ad": {
      const draft = await createJobDraft({
        title: payload.jobTitle?.trim() || "Recruiting boost — AI action",
        description: "Draft created from AI action engine to increase applicant flow.",
        city: payload.city?.trim() || "Remote",
        usState: payload.state?.trim() || "TX",
        payRate: "",
        department: "Field",
        source: "ai-action-engine",
        clonedFromBreezyJobId: payload.jobId?.trim() || undefined,
      });
      return { ok: true, message: "Job ad draft created", outcomeId: draft.id };
    }
    case "generate-route-plan": {
      const opportunityIds = payload.opportunityIds?.length
        ? payload.opportunityIds
        : payload.opportunityId
          ? [payload.opportunityId]
          : [];
      if (opportunityIds.length === 0) return { ok: false, message: "opportunityIds required" };
      const melResult = await fetchMelProjectsSheet();
      if (!melResult.ok) return { ok: false, message: melResult.error };
      const opportunities = parseMelOpportunities(melResult.rows);
      const plan = buildRoutePlan(opportunityIds, opportunities);
      if (!plan) return { ok: false, message: "No route plan generated" };
      return {
        ok: true,
        message: `Route plan: ${plan.totalMiles} mi, $${plan.estimatedTotalCostUsd}`,
        outcomeId: plan.routeId,
      };
    }
    default:
      return { ok: false, message: "Unknown action kind" };
  }
}

export async function executeAiAction(input: {
  insightId: string;
  recommendation: string;
  actionKind: AiActionKind;
  payload: AiActionPayload;
  confirmed: boolean;
  session: AuthSession;
}): Promise<AiActionExecutionResult> {
  assertManualConfirmationRequired(input.confirmed);
  await recordAiRecommendation({
    insightId: input.insightId,
    recommendation: input.recommendation,
  });

  try {
    const result = await executeKind(input.actionKind, input.payload, input.session);
    await recordAiActionTaken({
      insightId: input.insightId,
      recommendation: input.recommendation,
      actionKind: input.actionKind,
      userId: input.session.userId,
      userName: input.session.name,
      outcome: result.ok ? "success" : "failure",
      outcomeDetail: result.message,
      entityId: result.outcomeId,
    });
    return {
      ok: result.ok,
      actionKind: input.actionKind,
      insightId: input.insightId,
      message: result.message,
      outcomeId: result.outcomeId,
      error: result.ok ? undefined : result.message,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Action failed";
    await recordAiActionTaken({
      insightId: input.insightId,
      recommendation: input.recommendation,
      actionKind: input.actionKind,
      userId: input.session.userId,
      userName: input.session.name,
      outcome: "failure",
      outcomeDetail: message,
    });
    return {
      ok: false,
      actionKind: input.actionKind,
      insightId: input.insightId,
      message,
      error: message,
    };
  }
}

export async function executeAiActionBulk(input: {
  actions: Array<{
    insightId: string;
    recommendation: string;
    actionKind: AiActionKind;
    payload: AiActionPayload;
  }>;
  confirmed: boolean;
  session: AuthSession;
}): Promise<AiActionExecutionResult[]> {
  assertManualConfirmationRequired(input.confirmed);
  const results: AiActionExecutionResult[] = [];
  for (const action of input.actions) {
    results.push(
      await executeAiAction({
        ...action,
        confirmed: true,
        session: input.session,
      }),
    );
  }
  return results;
}
