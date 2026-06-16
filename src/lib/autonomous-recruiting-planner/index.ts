export {
  buildAutonomousRecruitingPlannerSnapshot,
  type BuildAutonomousRecruitingPlannerInput,
} from "@/lib/autonomous-recruiting-planner/build-snapshot";
export { buildExecutiveStrategyView } from "@/lib/autonomous-recruiting-planner/executive-strategy";
export { buildGoalPlanningResult } from "@/lib/autonomous-recruiting-planner/goal-planning";
export {
  computeOptimizationScore,
  confidenceFromInputs,
  horizonScale,
  rankPlansByOptimization,
} from "@/lib/autonomous-recruiting-planner/optimization-ranking";
export { buildRecruitingPlans } from "@/lib/autonomous-recruiting-planner/planning-engine";
export { buildProjectPlanOutlooks } from "@/lib/autonomous-recruiting-planner/project-planning";
export {
  canAccessAutonomousRecruitingPlanner,
  resolveAutonomousRecruitingPlannerScope,
} from "@/lib/autonomous-recruiting-planner/permissions";
export { buildRecruiterWorkPlans } from "@/lib/autonomous-recruiting-planner/recruiter-work-plans";
export { buildResourceAllocationRecommendations } from "@/lib/autonomous-recruiting-planner/resource-allocation";
export { buildRiskConstraintSummary } from "@/lib/autonomous-recruiting-planner/risk-constraints";
export { buildTerritoryActionPlans } from "@/lib/autonomous-recruiting-planner/territory-action-plans";
export type {
  AutonomousRecruitingPlannerScope,
  AutonomousRecruitingPlannerSnapshot,
  ExecutiveStrategyView,
  GoalKind,
  GoalPlanningResult,
  GoalTarget,
  PlannerGoalParams,
  PlannerHorizon,
  ProjectOutlookStatus,
  ProjectPlanOutlook,
  RecruiterWorkPlan,
  RecruitingPlan,
  ResourceAllocationKind,
  ResourceAllocationRecommendation,
  RiskConstraintSummary,
  StrategyTradeOff,
  TerritoryActionPlan,
} from "@/lib/autonomous-recruiting-planner/types";
