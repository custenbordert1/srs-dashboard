import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import { buildRecruiterTasks } from "@/lib/hiring-funnel-automation/build-recruiter-tasks";
import { evaluateCandidateFunnelAutomation } from "@/lib/hiring-funnel-automation/evaluate-candidate-automation";
import {
  buildWorkloadBalanceRecommendations,
  summarizePipelineRisks,
} from "@/lib/hiring-funnel-automation/build-workload-balance";
import type { ExecutiveAutomationRollups } from "@/lib/hiring-funnel-automation/types";
import { buildRecruiterActionMetrics } from "@/lib/recruiter-action-engine/build-action-metrics";
import { buildRecruiterActionDecisions } from "@/lib/recruiter-action-engine/build-action-decision";
import { buildProgressionMetrics } from "@/lib/candidate-progression-engine/build-progression-metrics";
import { buildCandidateProgressionDecisions } from "@/lib/candidate-progression-engine/build-progression-decision";

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

  const autoAssigned = candidates.filter(
    (row) => row.recruiterAssignmentSource === "auto" && !isUnassignedRecruiter(row.assignedRecruiter),
  );
  const owned = candidates.filter((row) => !isUnassignedRecruiter(row.assignedRecruiter));
  const manualRequired = candidates.filter((row) => isUnassignedRecruiter(row.assignedRecruiter));
  const confidenceValues = autoAssigned
    .map((row) => row.recruiterAssignmentConfidence ?? 0)
    .filter((value) => value > 0);

  const actionDecisions = buildRecruiterActionDecisions(candidates, referenceMs);
  const actionMetrics = buildRecruiterActionMetrics({
    candidates,
    decisions: actionDecisions,
    generated: candidates.filter((row) => row.requiredAction && row.actionType !== "none").length,
    referenceMs,
  });

  const progressionDecisions = buildCandidateProgressionDecisions(candidates, referenceMs);
  const progressionMetrics = buildProgressionMetrics({
    candidates,
    decisions: progressionDecisions,
    generated: candidates.filter((row) => row.recommendedStage).length,
    referenceMs,
  });

  return {
    recruiterCapacityRisk,
    pipelineBlockers: pipelineBlockers.slice(0, 3),
    automationOpportunities: automationOpportunities.slice(0, 3),
    autoAssignmentRate: owned.length > 0 ? Math.round((autoAssigned.length / owned.length) * 100) : 0,
    manualAssignmentRequired: manualRequired.length,
    assignmentConfidence:
      confidenceValues.length > 0
        ? Math.round(confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length)
        : 0,
    overdueRecruiterActions: actionMetrics.overdueRecruiterActions,
    actionsDueToday: actionMetrics.actionsDueToday,
    averageActionAgeDays: actionMetrics.averageActionAgeDays,
    recruiterSlaCompliance: actionMetrics.recruiterSlaCompliance,
    candidatesReadyToAdvance: progressionMetrics.candidatesReadyToAdvance,
    stalledCandidates: progressionMetrics.stalledCandidates,
    progressionSlaCompliance: progressionMetrics.progressionSlaCompliance,
    progressionBottlenecks: progressionMetrics.progressionBottlenecks,
  };
}
