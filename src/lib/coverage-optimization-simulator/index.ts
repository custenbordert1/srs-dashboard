export {
  buildCoverageOptimizationSimulatorSnapshot,
  type BuildCoverageOptimizationSimulatorInput,
} from "@/lib/coverage-optimization-simulator/build-snapshot";
export {
  buildBaselineMetrics,
  diffImpactMetrics,
  emptyImpactMetrics,
  simulateScenarioImpact,
  type ImpactModelContext,
} from "@/lib/coverage-optimization-simulator/impact-model";
export {
  buildForecastComparison,
  buildOptimizationSuggestions,
  rankScenariosByRoi,
  topRoiScenarios,
} from "@/lib/coverage-optimization-simulator/optimization-ranking";
export {
  canAccessCoverageOptimizationSimulator,
  resolveCoverageOptimizationSimulatorScope,
} from "@/lib/coverage-optimization-simulator/permissions";
export { buildRecommendationSimulationTests } from "@/lib/coverage-optimization-simulator/recommendation-testing";
export { buildResourceAllocationSimulations } from "@/lib/coverage-optimization-simulator/resource-allocation";
export {
  SIMULATOR_SCENARIOS,
  autopilotKindToScenarioKind,
  scenarioDefinitionForKind,
} from "@/lib/coverage-optimization-simulator/scenarios";
export {
  buildTerritorySimulatorOptions,
  filterTerritoryRowsForScope,
  findTerritoryRow,
  isTerritoryInSimulatorScope,
  territoryScaleForRow,
} from "@/lib/coverage-optimization-simulator/territory-scope";
export type {
  CoverageImpactComparison,
  CoverageImpactMetrics,
  CoverageOptimizationSimulatorScope,
  CoverageOptimizationSimulatorSnapshot,
  ForecastComparison,
  OptimizationSuggestion,
  RecommendationSimulationTest,
  ResourceAllocationKind,
  ResourceAllocationSimulation,
  SimulatorScenarioDefinition,
  SimulatorScenarioKind,
  SimulatorScenarioResult,
  TerritorySimulatorOption,
} from "@/lib/coverage-optimization-simulator/types";
