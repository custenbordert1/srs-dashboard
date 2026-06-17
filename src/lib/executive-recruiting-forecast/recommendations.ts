import type {
  DmCapacityRow,
  ExecutiveForecastRecommendation,
  RecruiterCapacityRow,
  TerritoryShortageForecastRow,
} from "@/lib/executive-recruiting-forecast/types";

export function buildExecutiveForecastRecommendations(input: {
  territoryShortages: TerritoryShortageForecastRow[];
  recruiterCapacity: RecruiterCapacityRow[];
  dmCapacity: DmCapacityRow[];
  projectedApplicantShortage: number;
}): ExecutiveForecastRecommendation[] {
  const recommendations: ExecutiveForecastRecommendation[] = [];
  let id = 0;
  const nextId = () => `p44-rec-${++id}`;

  for (const territory of input.territoryShortages.filter((row) => row.likelyMissCoverage).slice(0, 5)) {
    recommendations.push({
      id: nextId(),
      kind: "escalate-dm-territory",
      title: `Escalate ${territory.dmName} territory risk`,
      rationale: territory.reasons.join(" · "),
      expectedImpact: `Reduce projected shortage of ${territory.projectedShortage} placements`,
      priority: territory.shortageScore >= 75 ? "high" : "medium",
      territoryLabel: territory.territoryLabel,
      owner: territory.dmName,
    });
    if (territory.pipelineCandidates < territory.openOpportunities) {
      recommendations.push({
        id: nextId(),
        kind: "refresh-job-ads",
        title: `Refresh job ads in ${territory.territoryLabel}`,
        rationale: "Applicant pool is thinner than open opportunity demand",
        expectedImpact: "Increase applicant flow over next 30 days",
        priority: "high",
        territoryLabel: territory.territoryLabel,
        owner: territory.dmName,
      });
    }
  }

  if (input.projectedApplicantShortage > 10) {
    recommendations.push({
      id: nextId(),
      kind: "increase-pay",
      title: "Review pay bands in high-shortage markets",
      rationale: "Projected applicant flow trails staffing demand",
      expectedImpact: "Improve applicant velocity in constrained territories",
      priority: "medium",
      territoryLabel: null,
      owner: null,
    });
  }

  const overloadedRecruiters = input.recruiterCapacity.filter((row) => row.status === "overloaded");
  if (overloadedRecruiters.length > 0) {
    const target = overloadedRecruiters[0]!;
    recommendations.push({
      id: nextId(),
      kind: "move-recruiter-focus",
      title: `Rebalance workload from ${target.recruiter}`,
      rationale: `${target.assignedCandidates} assigned candidates with ${target.overdueFollowUps} overdue follow-ups`,
      expectedImpact: "Stabilize recruiter capacity and follow-up SLA",
      priority: "high",
      territoryLabel: null,
      owner: target.recruiter,
    });
  }

  const underused = input.recruiterCapacity.filter((row) => row.status === "underused");
  if (underused.length > 0 && overloadedRecruiters.length > 0) {
    recommendations.push({
      id: nextId(),
      kind: "prioritize-candidates",
      title: `Shift candidates to ${underused[0]!.recruiter}`,
      rationale: "Recruiter has spare capacity while peers are overloaded",
      expectedImpact: "Improve throughput without adding headcount",
      priority: "medium",
      territoryLabel: null,
      owner: underused[0]!.recruiter,
    });
  }

  for (const dm of input.dmCapacity.filter((row) => row.status === "overloaded").slice(0, 3)) {
    recommendations.push({
      id: nextId(),
      kind: "automation",
      title: `Enable follow-up automation for ${dm.dmName}`,
      rationale: `${dm.openOpportunities} open opportunities with coverage pressure ${dm.territoryCoveragePressure}%`,
      expectedImpact: "Reduce manual follow-up load on recruiters",
      priority: "low",
      territoryLabel: null,
      owner: dm.dmName,
    });
  }

  return recommendations.sort((a, b) => {
    const rank = { high: 0, medium: 1, low: 2 };
    return rank[a.priority] - rank[b.priority];
  });
}
