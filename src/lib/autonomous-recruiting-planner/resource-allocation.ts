import type { ResourceAllocationRecommendation } from "@/lib/autonomous-recruiting-planner/types";
import type { RecruitingAutopilotSnapshot } from "@/lib/recruiting-autopilot/types";
import type { WorkforceCapacityForecastSnapshot } from "@/lib/workforce-capacity-forecast/types";
type ReEngagementSummary = {
  recoverableCandidates: number;
  potentialPlacements: number;
  estimatedCoverageGainPercent: number;
};

export function buildResourceAllocationRecommendations(input: {
  workforce: WorkforceCapacityForecastSnapshot;
  autopilot: RecruitingAutopilotSnapshot;
  reEngagementSummary: ReEngagementSummary;
}): ResourceAllocationRecommendation[] {
  const recommendations: ResourceAllocationRecommendation[] = [];

  for (const balancing of input.workforce.resourceBalancing) {
    const kind =
      balancing.kind === "move-recruiter"
        ? "recruiter-assignment"
        : balancing.kind === "reassign-territory"
          ? "territory-assignment"
          : balancing.kind === "shift-priorities"
            ? "priority-project"
            : "recruiter-assignment";
    recommendations.push({
      id: `alloc-${balancing.id}`,
      kind,
      title: balancing.title,
      detail: balancing.detail,
      fromLabel: balancing.fromLabel,
      toLabel: balancing.toLabel,
      expectedCoverageGain: balancing.expectedCoverageGain,
      expectedHireGain: balancing.expectedHireGain,
      expectedOpenCallReduction: balancing.expectedOpenCallReduction,
      priorityScore: balancing.priorityScore,
      confidenceScore: balancing.confidenceScore,
    });
  }

  const recoveryRecs = input.autopilot.all
    .filter((rec) => rec.kind === "reopen-previous-candidates" || rec.kind === "create-candidate-outreach-campaign")
    .slice(0, 3);
  for (const rec of recoveryRecs) {
    recommendations.push({
      id: `alloc-recovery-${rec.id}`,
      kind: "candidate-recovery",
      title: rec.title,
      detail: rec.reasoning,
      toLabel: rec.entityLabel,
      expectedCoverageGain: rec.opportunity.estimatedCoverageGain,
      expectedHireGain: Math.round(rec.opportunity.estimatedCandidateGain * 0.15),
      expectedOpenCallReduction: Math.round(rec.opportunity.estimatedCoverageGain * 0.1),
      priorityScore: rec.prioritizationScore,
      confidenceScore: rec.confidenceScore,
    });
  }

  if (input.reEngagementSummary.recoverableCandidates > 0) {
    recommendations.push({
      id: "alloc-recovery-campaign",
      kind: "candidate-recovery",
      title: "Launch candidate recovery campaign",
      detail: `${input.reEngagementSummary.recoverableCandidates} recoverable candidates with ${input.reEngagementSummary.potentialPlacements} potential placements`,
      expectedCoverageGain: input.reEngagementSummary.estimatedCoverageGainPercent,
      expectedHireGain: input.reEngagementSummary.potentialPlacements,
      expectedOpenCallReduction: Math.round(input.reEngagementSummary.recoverableCandidates * 0.2),
      priorityScore: 75 + Math.min(20, input.reEngagementSummary.recoverableCandidates),
      confidenceScore: 72,
    });
  }

  const priorityProjects = input.workforce.capacityPlanning.projectsRequiringStaffingSupport.slice(0, 3);
  for (const project of priorityProjects) {
    recommendations.push({
      id: `alloc-project-${project.projectId}`,
      kind: "priority-project",
      title: `Prioritize staffing: ${project.projectName}`,
      detail: `${project.openCalls} open calls at ${project.coveragePercent}% coverage`,
      toLabel: project.dmName,
      expectedCoverageGain: Math.max(3, 100 - project.coveragePercent),
      expectedHireGain: Math.ceil(project.openCalls * 0.4),
      expectedOpenCallReduction: Math.ceil(project.openCalls * 0.3),
      priorityScore: 60 + project.riskScore,
      confidenceScore: 68,
    });
  }

  return recommendations
    .sort((a, b) => b.priorityScore - a.priorityScore || b.confidenceScore - a.confidenceScore)
    .slice(0, 12);
}
