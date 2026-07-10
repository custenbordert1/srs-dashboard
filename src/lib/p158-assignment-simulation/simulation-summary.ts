import type { P1581OutcomeCounts } from "@/lib/p158-assignment-simulation/paperwork-impact";
import type { P1581SimulationSummary, P1581WorkloadRow } from "@/lib/p158-assignment-simulation/types";

export function buildSimulationSummary(input: {
  candidatesEvaluated: number;
  simulatedAssignments: number;
  remainingUnassigned: number;
  workload: P1581WorkloadRow[];
  territoryImbalanceScore: number;
  outcomes: P1581OutcomeCounts;
  largestWorkloadIncrease: { recruiter: string; delta: number } | null;
}): P1581SimulationSummary {
  const avgRecruiterUtilization =
    input.workload.length > 0
      ? Math.round(
          input.workload.reduce((sum, r) => sum + r.utilizationPercent, 0) / input.workload.length,
        )
      : 0;

  return {
    candidatesEvaluated: input.candidatesEvaluated,
    candidatesAssignedInSimulation: input.simulatedAssignments,
    candidatesRemainingUnassigned: input.remainingUnassigned,
    largestWorkloadIncrease: input.largestWorkloadIncrease,
    territoryImbalanceScore: input.territoryImbalanceScore,
    avgRecruiterUtilization,
    readyForPaperwork: input.outcomes.readyForPaperwork,
    manualReview: input.outcomes.manualReview,
    followUp: input.outcomes.followUp,
    blocked: input.outcomes.blocked,
  };
}
