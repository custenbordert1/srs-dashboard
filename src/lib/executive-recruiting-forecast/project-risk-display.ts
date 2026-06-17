import type { ProjectCompletionRiskRow, ProjectRiskLevel } from "@/lib/executive-recruiting-forecast/types";

export function classifyProjectRiskLevel(riskScore: number): ProjectRiskLevel {
  if (riskScore >= 75) return "critical";
  if (riskScore >= 55) return "high";
  if (riskScore >= 35) return "medium";
  return "low";
}

export function suggestedActionForProjectRisk(row: ProjectCompletionRiskRow): string {
  if (row.pipelineCandidates === 0 && row.openOpportunities > 0) {
    return "Prioritize candidate sourcing for this project";
  }
  if (row.openOpportunities - row.pipelineCandidates >= 3) {
    return "Rebalance recruiters toward this project's pipeline";
  }
  if (row.openOpportunities >= 5) {
    return "Escalate DM staffing plan for high open-call volume";
  }
  return "Monitor weekly staffing pace";
}

export function enrichProjectCompletionRisk(row: ProjectCompletionRiskRow): ProjectCompletionRiskRow {
  const riskLevel = classifyProjectRiskLevel(row.riskScore);
  return {
    ...row,
    riskLevel,
    suggestedAction: suggestedActionForProjectRisk(row),
  };
}
