import type {
  CoverageImpactComparison,
  ResourceAllocationKind,
  ResourceAllocationSimulation,
} from "@/lib/coverage-optimization-simulator/types";
import {
  buildBaselineMetrics,
  diffImpactMetrics,
  simulateScenarioImpact,
  type ImpactModelContext,
} from "@/lib/coverage-optimization-simulator/impact-model";

type AllocationTemplate = {
  kind: ResourceAllocationKind;
  label: string;
  scenarioKind: Parameters<typeof simulateScenarioImpact>[0]["kind"];
  scale: number;
  fromLabel?: string;
  toLabel?: string;
};

const ALLOCATION_TEMPLATES: AllocationTemplate[] = [
  {
    kind: "move-recruiter",
    label: "Move recruiter to highest-risk territory",
    scenarioKind: "add-recruiter",
    scale: 0.9,
    fromLabel: "Lower-pressure territory",
    toLabel: "Critical territory",
  },
  {
    kind: "reassign-territory",
    label: "Reassign territory ownership to stronger DM bench",
    scenarioKind: "territory-blitz",
    scale: 0.85,
    fromLabel: "At-risk territory",
    toLabel: "Supported territory",
  },
  {
    kind: "prioritize-project",
    label: "Prioritize highest open-call project cluster",
    scenarioKind: "refresh-job-postings",
    scale: 1.05,
    toLabel: "Top open-call project",
  },
  {
    kind: "reallocate-budget",
    label: "Shift ad budget toward zero-pipeline stores",
    scenarioKind: "add-budget",
    scale: 1.1,
    fromLabel: "Healthy markets",
    toLabel: "Zero-pipeline stores",
  },
];

export function buildResourceAllocationSimulations(
  ctx: ImpactModelContext,
): ResourceAllocationSimulation[] {
  const baseline = buildBaselineMetrics(ctx);

  return ALLOCATION_TEMPLATES.map((template, index) => {
    const simulated = simulateScenarioImpact({
      kind: template.scenarioKind,
      ctx,
      confidenceScore: 72 - index * 3,
      territoryScale: template.scale,
    });

    const impact: CoverageImpactComparison = {
      current: baseline,
      projected: simulated.projected,
      difference: diffImpactMetrics(simulated.projected, baseline),
    };

    return {
      id: `allocation-${template.kind}`,
      kind: template.kind,
      label: template.label,
      fromLabel: template.fromLabel,
      toLabel: template.toLabel,
      impact,
      expectedRoiScore: simulated.expectedRoiScore,
      confidenceScore: simulated.confidenceScore,
    };
  }).sort((a, b) => b.expectedRoiScore - a.expectedRoiScore);
}
