import type { P167SchedulerRecommendation, P167SimulationScenario } from "@/lib/p167-intelligent-production-scheduler/types";

export function recommendationLabel(rec: P167SchedulerRecommendation): string {
  const labels: Record<P167SchedulerRecommendation, string> = {
    READY_NOW: "Ready now",
    WAIT_2_MINUTES: "Wait 2 minutes",
    WAIT_5_MINUTES: "Wait 5 minutes",
    WAIT_10_MINUTES: "Wait 10 minutes",
    WAIT_15_MINUTES: "Wait 15 minutes",
    NO_ELIGIBLE_CANDIDATES: "No eligible candidates",
    PAUSE_INVESTIGATION_REQUIRED: "Pause — investigation required",
  };
  return labels[rec];
}

export function recommendationTone(
  rec: P167SchedulerRecommendation,
): "success" | "warning" | "critical" | "neutral" {
  if (rec === "READY_NOW") return "success";
  if (rec === "NO_ELIGIBLE_CANDIDATES") return "neutral";
  if (rec === "PAUSE_INVESTIGATION_REQUIRED") return "critical";
  return "warning";
}

export function scenarioLabel(scenario: P167SimulationScenario): string {
  const labels: Record<P167SimulationScenario, string> = {
    run_now: "Run now",
    run_in_2_min: "Run in 2 min",
    run_in_5_min: "Run in 5 min",
    run_in_10_min: "Run in 10 min",
    run_in_15_min: "Run in 15 min",
  };
  return labels[scenario];
}
