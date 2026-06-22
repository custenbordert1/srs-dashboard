import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import { buildRecruiterTasks } from "@/lib/hiring-funnel-automation/build-recruiter-tasks";
import { evaluateCandidateFunnelAutomation } from "@/lib/hiring-funnel-automation/evaluate-candidate-automation";
import type { WorkloadBalanceRecommendation } from "@/lib/hiring-funnel-automation/types";

export function buildWorkloadBalanceRecommendations(
  candidates: ScoredCandidateWorkflowRow[],
  referenceMs = Date.now(),
): WorkloadBalanceRecommendation[] {
  const byRecruiter = new Map<string, ScoredCandidateWorkflowRow[]>();

  for (const row of candidates) {
    const recruiter = row.assignedRecruiter.trim() || "Unassigned";
    const list = byRecruiter.get(recruiter) ?? [];
    list.push(row);
    byRecruiter.set(recruiter, list);
  }

  const recommendations: WorkloadBalanceRecommendation[] = [];

  for (const [recruiter, owned] of byRecruiter) {
    const tasks = buildRecruiterTasks(owned, { referenceMs });
    const overdueTasks = tasks.filter((task) => task.risk === "critical").length;
    const activeTasks = tasks.length;
    const pipelineVolume = owned.filter(
      (row) => !["Not Qualified", "Active Rep", "Loaded in MEL"].includes(row.workflowStatus),
    ).length;

    let recommendation = "Workload is balanced.";
    let severity: WorkloadBalanceRecommendation["severity"] = "healthy";

    if (isUnassignedRecruiter(recruiter) && owned.length >= 3) {
      recommendation = `Assign ${owned.length} unowned candidates to recruiters.`;
      severity = "critical";
    } else if (overdueTasks >= 3) {
      recommendation = `Escalate workload — ${overdueTasks} overdue tasks need attention.`;
      severity = "critical";
    } else if (activeTasks >= 8) {
      recommendation = `Consider reassigning candidates — ${activeTasks} active tasks in queue.`;
      severity = "warning";
    } else if (pipelineVolume >= 15) {
      recommendation = "High pipeline volume — prioritize critical tasks first.";
      severity = "warning";
    }

    recommendations.push({
      recruiter,
      candidatesOwned: owned.length,
      activeTasks,
      overdueTasks,
      pipelineVolume,
      recommendation,
      severity,
    });
  }

  return recommendations.sort((a, b) => b.activeTasks - a.activeTasks);
}

export function summarizePipelineRisks(
  candidates: ScoredCandidateWorkflowRow[],
  referenceMs = Date.now(),
): { critical: number; warning: number; healthy: number } {
  let critical = 0;
  let warning = 0;
  let healthy = 0;

  for (const row of candidates) {
    const automation = evaluateCandidateFunnelAutomation(row, referenceMs);
    if (automation.risk === "critical") critical += 1;
    else if (automation.risk === "warning") warning += 1;
    else healthy += 1;
  }

  return { critical, warning, healthy };
}
