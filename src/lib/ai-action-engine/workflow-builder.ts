import type { AiCommandCenterSnapshot } from "@/lib/ai-recruiting-command-center/types";
import { DEFAULT_AI_WORKFLOW_RULES } from "@/lib/ai-action-engine/action-registry";
import { resolveInsightActions } from "@/lib/ai-action-engine/resolve-insight-actions";
import type { AiActionProposal, TriggeredWorkflow } from "@/lib/ai-action-engine/types";

export type WorkflowEvaluationContext = {
  coverageRiskScore: number;
  zeroApplicantJobs: number;
  followUpsDue: number;
  snapshot: AiCommandCenterSnapshot;
};

export function evaluateAiWorkflows(ctx: WorkflowEvaluationContext): TriggeredWorkflow[] {
  const triggered: TriggeredWorkflow[] = [];
  const now = new Date().toISOString();

  for (const rule of DEFAULT_AI_WORKFLOW_RULES) {
    if (!rule.enabled) continue;

    const matches =
      (rule.if.coverageRiskGt !== undefined && ctx.coverageRiskScore > rule.if.coverageRiskGt) ||
      (rule.if.zeroApplicantJobsGt !== undefined && ctx.zeroApplicantJobs > rule.if.zeroApplicantJobsGt) ||
      (rule.if.followUpsDueGt !== undefined && ctx.followUpsDue > rule.if.followUpsDueGt);

    if (!matches) continue;

    const anchorInsight = ctx.snapshot.insightsFeed[0];
    const proposedActions: AiActionProposal[] = anchorInsight
      ? rule.then.map((step, index) => {
          const base = resolveInsightActions(anchorInsight).find((row) => row.actionKind === step.actionKind);
          if (base) return { ...base, id: `${rule.id}:${step.actionKind}:${index}` };
          return {
            id: `${rule.id}:${step.actionKind}:${index}`,
            insightId: anchorInsight.id,
            actionKind: step.actionKind,
            label: step.label,
            description: step.label,
            payload: { insightId: anchorInsight.id },
            priorityScore: 85 - index,
            expectedImpact: step.label,
            severity: "high" as const,
            manualOnly: true as const,
          };
        })
      : [];

    triggered.push({
      ruleId: rule.id,
      ruleName: rule.name,
      triggeredAt: now,
      proposedActions,
    });
  }

  return triggered;
}
