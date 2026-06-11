import type { AiInsight } from "@/lib/ai-recruiting-command-center/types";
import { AI_ACTION_IMPACT, AI_ACTION_LABELS } from "@/lib/ai-action-engine/action-registry";
import type { AiActionKind, AiActionProposal } from "@/lib/ai-action-engine/types";

function proposal(
  insight: AiInsight,
  actionKind: AiActionKind,
  payload: AiActionProposal["payload"],
  priorityBoost = 0,
): AiActionProposal {
  return {
    id: `${insight.id}:${actionKind}`,
    insightId: insight.id,
    actionKind,
    label: AI_ACTION_LABELS[actionKind],
    description: insight.action,
    payload: { ...payload, insightId: insight.id },
    priorityScore: Math.min(100, insight.score + priorityBoost),
    expectedImpact: AI_ACTION_IMPACT[actionKind],
    severity: insight.severity,
    manualOnly: true,
  };
}

export function resolveInsightActions(insight: AiInsight): AiActionProposal[] {
  const proposals: AiActionProposal[] = [];
  const entityId = insight.entityId;

  if (insight.id.startsWith("coach:contact:") && entityId) {
    proposals.push(
      proposal(insight, "send-follow-up", { candidateId: entityId }, 5),
      proposal(insight, "assign-recruiter", { candidateId: entityId }),
    );
  }

  if (insight.id.startsWith("coach:job:") && entityId) {
    proposals.push(
      proposal(insight, "create-job-ad", { jobId: entityId }, 8),
      proposal(insight, "create-dm-escalation", {
        jobId: entityId,
        jobTitle: insight.title,
        escalationType: "low-applicant-flow",
      }),
    );
  }

  if (insight.id.startsWith("opp-risk:") && entityId) {
    proposals.push(
      proposal(insight, "generate-route-plan", { opportunityIds: [entityId] }, 10),
      proposal(insight, "create-dm-escalation", {
        opportunityId: entityId,
        escalationType: "coverage-concern",
        jobTitle: insight.title,
      }),
    );
  }

  if (insight.id.startsWith("territory:")) {
    proposals.push(
      proposal(insight, "create-dm-escalation", {
        territory: insight.territory,
        dmName: insight.territory,
        escalationType: "coverage-concern",
        jobTitle: insight.title,
      }, 6),
      proposal(insight, "create-job-ad", { jobTitle: insight.title }),
    );
  }

  if (insight.source === "recruiter-productivity" && entityId?.startsWith("c")) {
    proposals.push(proposal(insight, "send-follow-up", { candidateId: entityId }, 4));
  }

  if (insight.category === "action" && proposals.length === 0 && entityId) {
    if (insight.source === "coverage-optimization") {
      proposals.push(proposal(insight, "generate-route-plan", { opportunityIds: [entityId] }));
    } else {
      proposals.push(proposal(insight, "send-follow-up", { candidateId: entityId }));
    }
  }

  if (proposals.length === 0) {
    proposals.push(
      proposal(insight, "create-dm-escalation", {
        escalationType: "escalate-recruiting",
        jobTitle: insight.title,
        territory: insight.territory,
      }),
    );
  }

  return proposals;
}

export function resolveAllInsightActions(insights: AiInsight[]): Record<string, AiActionProposal[]> {
  const map: Record<string, AiActionProposal[]> = {};
  for (const insight of insights) {
    map[insight.id] = resolveInsightActions(insight);
  }
  return map;
}
