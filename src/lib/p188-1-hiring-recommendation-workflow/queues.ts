import { redactCandidateId } from "@/lib/p187-1-canary-cohort-readiness/eligibility";
import { buildCandidateContextFromWorkflow } from "@/lib/p188-1-hiring-recommendation-workflow/context";
import { validateRecommendHire } from "@/lib/p188-1-hiring-recommendation-workflow/validator";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import type {
  P1881CandidateContext,
  P1881QueueId,
  P1881QueueItem,
} from "@/lib/p188-1-hiring-recommendation-workflow/types";
import type { ContextEnrichment } from "@/lib/p188-1-hiring-recommendation-workflow/context";
import type { P1881BypassFinding } from "@/lib/p188-1-hiring-recommendation-workflow/types";

function item(
  queueId: P1881QueueId,
  ctx: P1881CandidateContext,
  blockers: string[],
  readiness: P1881QueueItem["recommendationReadiness"],
  recommendedOperatorAction: string,
): P1881QueueItem {
  return {
    queueId,
    candidateId: ctx.candidateId,
    redactedCandidateId: redactCandidateId(ctx.candidateId),
    recruiter: ctx.recruiterId,
    dm: ctx.assignedDM,
    job: ctx.jobLabel ?? ctx.jobId,
    currentState: ctx.workflowStatus,
    blockers,
    recommendationReadiness: readiness,
    recommendedOperatorAction,
  };
}

/**
 * Build recommendation / recovery queues (read-model).
 */
export function buildRecommendationQueues(input: {
  workflows: CandidateWorkflowRecord[];
  enrichments?: Record<string, ContextEnrichment>;
  bypassFindings?: P1881BypassFinding[];
  actorRole?: string;
}): Record<P1881QueueId, P1881QueueItem[]> {
  const queues: Record<P1881QueueId, P1881QueueItem[]> = {
    ready_for_recruiter_review: [],
    ready_to_recommend: [],
    recommendation_blocked: [],
    recruiter_unresolved: [],
    job_unresolved: [],
    hold_conflict: [],
    already_recommended: [],
    already_approved: [],
    paperwork_already_active: [],
    historical_lifecycle_bypass: [],
  };

  for (const wf of input.workflows) {
    const enrichment = input.enrichments?.[wf.candidateId] ?? {};
    const ctx = buildCandidateContextFromWorkflow(wf, wf.candidateId, enrichment);
    const validation = validateRecommendHire({
      actor: "queue-scanner",
      role: (input.actorRole as "recruiter") || "recruiter",
      reason: "Queue eligibility scan — not an execution",
      context: ctx,
    });

    if (ctx.hasPriorRecommendation) {
      queues.already_recommended.push(
        item(
          "already_recommended",
          ctx,
          ["already recommended"],
          "already_done",
          "Await operator approval (P187 path) — do not re-recommend",
        ),
      );
      continue;
    }
    if (ctx.hasPriorOperatorApproval) {
      queues.already_approved.push(
        item(
          "already_approved",
          ctx,
          ["already approved"],
          "already_done",
          "Do not recommend — already operator approved",
        ),
      );
      continue;
    }
    if (ctx.paperworkActive) {
      queues.paperwork_already_active.push(
        item(
          "paperwork_already_active",
          ctx,
          ["paperwork active"],
          "blocked",
          "Review historical paperwork path — do not Recommend Hire",
        ),
      );
      continue;
    }
    if (ctx.holdFlags.length) {
      queues.hold_conflict.push(
        item(
          "hold_conflict",
          ctx,
          ctx.holdFlags,
          "blocked",
          "Resolve hold before recommendation",
        ),
      );
      continue;
    }
    if (!ctx.recruiterResolved) {
      queues.recruiter_unresolved.push(
        item(
          "recruiter_unresolved",
          ctx,
          ["recruiter unresolved"],
          "blocked",
          "Run recruiter assignment recovery / operator confirm",
        ),
      );
    }
    if (!ctx.jobResolved) {
      queues.job_unresolved.push(
        item(
          "job_unresolved",
          ctx,
          ["job unresolved"],
          "blocked",
          "Run job assignment recovery / operator confirm",
        ),
      );
    }

    if (
      ctx.workflowStatus === "Applied" &&
      !ctx.reviewCompleted &&
      ctx.recruiterResolved
    ) {
      queues.ready_for_recruiter_review.push(
        item(
          "ready_for_recruiter_review",
          ctx,
          validation.blockers,
          "blocked",
          "Complete recruiter review",
        ),
      );
    }

    if (validation.eligible) {
      queues.ready_to_recommend.push(
        item(
          "ready_to_recommend",
          ctx,
          [],
          "ready",
          "Recommend Hire (authorized)",
        ),
      );
    } else if (
      ["Applied", "Needs Review", "Qualified"].includes(ctx.workflowStatus ?? "") &&
      !ctx.paperworkActive
    ) {
      queues.recommendation_blocked.push(
        item(
          "recommendation_blocked",
          ctx,
          validation.blockers,
          "blocked",
          "Clear blockers then Recommend Hire",
        ),
      );
    }
  }

  for (const f of input.bypassFindings ?? []) {
    queues.historical_lifecycle_bypass.push({
      queueId: "historical_lifecycle_bypass",
      candidateId: f.candidateId,
      redactedCandidateId: redactCandidateId(f.candidateId),
      recruiter: null,
      dm: null,
      job: null,
      currentState: f.reconciledTo,
      blockers: [f.detail],
      recommendationReadiness: "blocked",
      recommendedOperatorAction:
        "Treat paperwork as historical fact; do not auto-create HR/OA; review separately",
    });
  }

  return queues;
}
