import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { buildRecruiterTasks } from "@/lib/hiring-funnel-automation/build-recruiter-tasks";
import { evaluateCandidateFunnelAutomation } from "@/lib/hiring-funnel-automation/evaluate-candidate-automation";
import {
  buildWorkloadBalanceRecommendations,
  summarizePipelineRisks,
} from "@/lib/hiring-funnel-automation/build-workload-balance";
import type { ExecutiveAutomationRollups } from "@/lib/hiring-funnel-automation/types";

export function buildExecutiveAutomationRollups(
  candidates: ScoredCandidateWorkflowRow[],
  referenceMs = Date.now(),
): ExecutiveAutomationRollups {
  const risks = summarizePipelineRisks(candidates, referenceMs);
  const workload = buildWorkloadBalanceRecommendations(candidates, referenceMs);
  const tasks = buildRecruiterTasks(candidates, { referenceMs });
  const automationReady = candidates.filter(
    (row) => evaluateCandidateFunnelAutomation(row, referenceMs).automationEligible,
  ).length;

  const overloaded = workload.filter((row) => row.severity === "critical");
  const recruiterCapacityRisk =
    overloaded.length > 0
      ? `${overloaded.length} recruiter${overloaded.length === 1 ? "" : "s"} at capacity risk`
      : risks.critical > 0
        ? `${risks.critical} candidate${risks.critical === 1 ? "" : "s"} in critical funnel risk`
        : null;

  const pipelineBlockers: string[] = [];
  const paperworkTasks = tasks.filter((t) => t.type === "paperwork-follow-up").length;
  const interviewTasks = tasks.filter((t) => t.type === "interview-needed").length;
  const unassignedTasks = tasks.filter((t) => t.type === "assign-recruiter").length;

  if (paperworkTasks > 0) pipelineBlockers.push(`${paperworkTasks} paperwork follow-ups pending`);
  if (interviewTasks > 0) pipelineBlockers.push(`${interviewTasks} interviews need scheduling`);
  if (unassignedTasks > 0) pipelineBlockers.push(`${unassignedTasks} candidates missing owner`);
  if (risks.warning > 0) pipelineBlockers.push(`${risks.warning} candidates in warning state`);

  const automationOpportunities: string[] = [];
  if (automationReady > 0) {
    automationOpportunities.push(`${automationReady} candidates eligible for workspace automation`);
  }
  const outreachTasks = tasks.filter((t) => t.type === "recruiter-outreach").length;
  if (outreachTasks > 0) {
    automationOpportunities.push(`${outreachTasks} outreach tasks ready for recruiters`);
  }
  const melTasks = tasks.filter((t) => t.type === "ready-for-mel-review").length;
  if (melTasks > 0) {
    automationOpportunities.push(`${melTasks} MEL-ready reviews available`);
  }

  return {
    recruiterCapacityRisk,
    pipelineBlockers: pipelineBlockers.slice(0, 3),
    automationOpportunities: automationOpportunities.slice(0, 3),
  };
}
