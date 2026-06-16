import {
  buildBaselineMetrics,
  diffImpactMetrics,
  simulateScenarioImpact,
  type ImpactModelContext,
} from "@/lib/coverage-optimization-simulator/impact-model";
import type {
  DmCapacityRow,
  RecruiterCapacityRow,
  ResourceBalancingKind,
  ResourceBalancingRecommendation,
} from "@/lib/workforce-capacity-forecast/types";

type BalancingTemplate = {
  kind: ResourceBalancingKind;
  title: string;
  detail: string;
  scenarioKind: Parameters<typeof simulateScenarioImpact>[0]["kind"];
  scale: number;
  fromLabel?: string;
  toLabel?: string;
};

const BALANCING_TEMPLATES: BalancingTemplate[] = [
  {
    kind: "move-recruiter",
    title: "Move recruiter to highest-risk territory",
    detail: "Shift recruiter capacity from lower-pressure markets to critical open-call clusters.",
    scenarioKind: "add-recruiter",
    scale: 0.9,
    fromLabel: "Lower-pressure territory",
    toLabel: "Critical territory",
  },
  {
    kind: "reassign-territory",
    title: "Reassign territory ownership",
    detail: "Pair at-risk territories with DMs that have spare bench capacity.",
    scenarioKind: "territory-blitz",
    scale: 0.85,
    fromLabel: "At-risk territory",
    toLabel: "Supported DM bench",
  },
  {
    kind: "shift-priorities",
    title: "Shift daily priorities to zero-pipeline stores",
    detail: "Re-rank recruiter action queues toward stores with open calls and no pipeline.",
    scenarioKind: "refresh-job-postings",
    scale: 1.05,
    toLabel: "Zero-pipeline stores",
  },
  {
    kind: "increase-recruiting-effort",
    title: "Increase recruiting effort on stalled candidates",
    detail: "Boost follow-up cadence and re-engagement outreach on recoverable pipeline.",
    scenarioKind: "re-engage-candidates",
    scale: 1.1,
    toLabel: "Stalled candidate pool",
  },
];

export function buildResourceBalancingRecommendations(input: {
  ctx: ImpactModelContext;
  recruiterCapacity: RecruiterCapacityRow[];
  dmCapacity: DmCapacityRow[];
}): ResourceBalancingRecommendation[] {
  const baseline = buildBaselineMetrics(input.ctx);
  const overloadedRecruiter = input.recruiterCapacity.find((row) => row.state === "overloaded");
  const spareRecruiter = [...input.recruiterCapacity]
    .filter((row) => row.state === "underutilized" || row.spareCapacityPercent >= 35)
    .sort((a, b) => b.spareCapacityPercent - a.spareCapacityPercent)[0];
  const atRiskDm = input.dmCapacity.find((row) => row.atRisk);

  return BALANCING_TEMPLATES.map((template, index) => {
    const simulated = simulateScenarioImpact({
      kind: template.scenarioKind,
      ctx: input.ctx,
      confidenceScore: 74 - index * 4,
      territoryScale: template.scale,
    });
    const diff = diffImpactMetrics(simulated.projected, baseline);

    const fromLabel =
      template.kind === "move-recruiter" && spareRecruiter
        ? spareRecruiter.recruiterName
        : template.fromLabel;
    const toLabel =
      template.kind === "move-recruiter" && overloadedRecruiter
        ? overloadedRecruiter.recruiterName
        : template.kind === "reassign-territory" && atRiskDm
          ? atRiskDm.dmName
          : template.toLabel;

    const priorityScore =
      diff.additionalHires * 8 +
      diff.coveragePercent * 5 +
      diff.openCallsReduced * 4 +
      simulated.expectedRoiScore * 0.15;

    return {
      id: `balance-${template.kind}`,
      kind: template.kind,
      title: template.title,
      detail: template.detail,
      fromLabel,
      toLabel,
      expectedHireGain: diff.additionalHires,
      expectedCoverageGain: diff.coveragePercent,
      expectedOpenCallReduction: diff.openCallsReduced,
      confidenceScore: simulated.confidenceScore,
      priorityScore: Math.round(priorityScore),
    };
  }).sort((a, b) => b.priorityScore - a.priorityScore);
}
