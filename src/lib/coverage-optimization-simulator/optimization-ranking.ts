import type {
  ForecastComparison,
  OptimizationSuggestion,
  SimulatorScenarioResult,
} from "@/lib/coverage-optimization-simulator/types";
import type { CoverageImpactMetrics } from "@/lib/coverage-optimization-simulator/types";

export function rankScenariosByRoi(scenarios: SimulatorScenarioResult[]): SimulatorScenarioResult[] {
  return [...scenarios].sort((a, b) => {
    if (b.expectedRoiScore !== a.expectedRoiScore) {
      return b.expectedRoiScore - a.expectedRoiScore;
    }
    return b.confidenceScore - a.confidenceScore;
  });
}

export function topRoiScenarios(scenarios: SimulatorScenarioResult[], limit = 10): SimulatorScenarioResult[] {
  return rankScenariosByRoi(scenarios).slice(0, limit);
}

export function buildOptimizationSuggestions(
  ranked: SimulatorScenarioResult[],
): OptimizationSuggestion[] {
  const suggestions: OptimizationSuggestion[] = [];
  if (ranked[0]) {
    suggestions.push({
      rank: 1,
      scenario: ranked[0],
      expectedRoiScore: ranked[0].expectedRoiScore,
      confidenceScore: ranked[0].confidenceScore,
    });
  }
  if (ranked[1]) {
    suggestions.push({
      rank: 2,
      scenario: ranked[1],
      expectedRoiScore: ranked[1].expectedRoiScore,
      confidenceScore: ranked[1].confidenceScore,
    });
  }
  return suggestions;
}

export function buildForecastComparison(input: {
  baseline: CoverageImpactMetrics;
  optimized: CoverageImpactMetrics;
}): ForecastComparison {
  return {
    currentForecast: input.baseline,
    optimizedForecast: input.optimized,
    coverageImprovement: input.optimized.coveragePercent - input.baseline.coveragePercent,
    candidateImprovement:
      input.optimized.additionalCandidates - input.baseline.additionalCandidates,
    hiringImprovement: input.optimized.additionalHires - input.baseline.additionalHires,
    riskReduction: input.optimized.riskReduction - input.baseline.riskReduction,
  };
}
