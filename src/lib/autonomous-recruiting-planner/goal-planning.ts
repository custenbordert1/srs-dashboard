import type {
  GoalKind,
  GoalPlanningResult,
  GoalTarget,
  PlannerGoalParams,
} from "@/lib/autonomous-recruiting-planner/types";
import type { RecruitingPlan } from "@/lib/autonomous-recruiting-planner/types";
import type { UnifiedRecruitingCommandCenterSnapshot } from "@/lib/unified-recruiting-command-center/types";
import type { RecruitingAutopilotSnapshot } from "@/lib/recruiting-autopilot/types";

const DEFAULT_GOALS: Array<{
  kind: GoalKind;
  label: string;
  resolveTarget: (params: PlannerGoalParams) => number;
  resolveCurrent: (kpis: UnifiedRecruitingCommandCenterSnapshot["kpis"]) => number;
  resolveProjected: (plan: RecruitingPlan) => number;
  actions: (autopilot: RecruitingAutopilotSnapshot, gap: number) => string[];
}> = [
  {
    kind: "coverage-95",
    label: "95% coverage",
    resolveTarget: (params) => params.targetCoveragePercent ?? 95,
    resolveCurrent: (kpis) => kpis.coveragePercent,
    resolveProjected: (plan) => plan.outcomes.coveragePercent,
    actions: (autopilot, gap) => {
      const actions = autopilot.highestImpact
        .filter((rec) => rec.opportunity.estimatedCoverageGain > 0)
        .slice(0, 2)
        .map((rec) => rec.title);
      if (gap > 10) actions.push("Launch territory blitz in lowest-coverage markets");
      if (gap > 5) actions.push("Re-engage stalled candidates in critical territories");
      return actions.length > 0 ? actions : ["Increase recruiting radius", "Refresh underperforming job postings"];
    },
  },
  {
    kind: "open-calls-50",
    label: "50% open call reduction",
    resolveTarget: (params) => params.targetOpenCallReductionPercent ?? 50,
    resolveCurrent: () => 0,
    resolveProjected: (plan) =>
      plan.outcomes.openCallsReduced > 0
        ? Math.round((plan.outcomes.openCallsReduced / Math.max(1, plan.outcomes.openCallsReduced + 5)) * 100)
        : 0,
    actions: (autopilot) =>
      autopilot.all
        .filter((rec) => rec.kind === "assign-additional-recruiter" || rec.kind === "launch-territory-blitz")
        .slice(0, 3)
        .map((rec) => rec.title)
        .concat(["Prioritize high-open-call projects", "Shift recruiter capacity to red territories"]),
  },
  {
    kind: "hires-20",
    label: "20% hire increase",
    resolveTarget: (params) => params.targetHireIncreasePercent ?? 20,
    resolveCurrent: () => 0,
    resolveProjected: (plan) => Math.min(100, Math.round(plan.outcomes.expectedHires * 4)),
    actions: (autopilot) =>
      autopilot.quickWins.slice(0, 2).map((rec) => rec.title).concat(["Accelerate paperwork pipeline", "Increase follow-up frequency on qualified candidates"]),
  },
  {
    kind: "critical-territories",
    label: "Reduce critical territories",
    resolveTarget: () => 0,
    resolveCurrent: (kpis) => kpis.criticalTerritories,
    resolveProjected: (plan) => plan.outcomes.criticalTerritories,
    actions: (autopilot, gap) => {
      if (gap <= 0) return ["Maintain current risk mitigation pace"];
      return autopilot.all
        .filter((rec) => rec.kind === "escalate-to-dm" || rec.kind === "increase-follow-up-frequency")
        .slice(0, 3)
        .map((rec) => rec.title);
    },
  },
];

export function buildGoalPlanningResult(input: {
  commandCenter: UnifiedRecruitingCommandCenterSnapshot;
  autopilot: RecruitingAutopilotSnapshot;
  bestPlan: RecruitingPlan;
  goalParams?: PlannerGoalParams;
}): GoalPlanningResult {
  const params = input.goalParams ?? {};
  const goals: GoalTarget[] = DEFAULT_GOALS.map((def) => {
    const targetValue = def.resolveTarget(params);
    const currentValue = def.resolveCurrent(input.commandCenter.kpis);
    const projectedValue = def.resolveProjected(input.bestPlan);
    const gap =
      def.kind === "critical-territories"
        ? Math.max(0, currentValue - targetValue)
        : Math.max(0, targetValue - projectedValue);
    const achievable = gap <= (def.kind === "coverage-95" ? 5 : def.kind === "critical-territories" ? 0 : 10);
    return {
      kind: def.kind,
      label: def.label,
      targetValue,
      currentValue,
      gap,
      achievable,
      requiredActions: def.actions(input.autopilot, gap),
      projectedValue,
    };
  });

  const overallAchievable = goals.filter((goal) => !goal.achievable).length <= 1;
  const unmet = goals.filter((goal) => !goal.achievable).map((goal) => goal.label);
  const summary = overallAchievable
    ? `Goals largely achievable with ${input.bestPlan.label}`
    : `Gap on: ${unmet.join(", ")} — additional actions required`;

  return { goals, overallAchievable, summary };
}
