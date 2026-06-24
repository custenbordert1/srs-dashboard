import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { buildCandidateSlaSnapshot } from "@/lib/candidate-action-sla";
import type {
  CandidateProgressionDecision,
  ProgressionMetrics,
} from "@/lib/candidate-progression-engine/types";

const ADVANCE_STAGE_TYPES = new Set([
  "contact-candidate",
  "schedule-interview",
  "send-paperwork",
  "ready-for-mel",
]);

export function buildProgressionMetrics(input: {
  candidates: ScoredCandidateWorkflowRow[];
  decisions: CandidateProgressionDecision[];
  generated: number;
  referenceMs?: number;
}): ProgressionMetrics {
  const referenceMs = input.referenceMs ?? Date.now();

  let candidatesReadyToAdvance = 0;
  let stalledCandidates = 0;
  let highPriorityCount = 0;
  const bottleneckCounts = new Map<string, number>();

  for (const decision of input.decisions) {
    if (!decision.shouldPersist) continue;

    if (ADVANCE_STAGE_TYPES.has(decision.progressionStageType)) {
      candidatesReadyToAdvance += 1;
    }
    if (decision.progressionStageType === "escalate") {
      stalledCandidates += 1;
    }
    if (decision.progressionPriority === "high") {
      highPriorityCount += 1;
    }

    const label = decision.recommendedStage;
    bottleneckCounts.set(label, (bottleneckCounts.get(label) ?? 0) + 1);
  }

  if (candidatesReadyToAdvance === 0 && stalledCandidates === 0) {
    for (const row of input.candidates) {
      if (!row.recommendedStage) continue;
      if (row.progressionPriority === "high") highPriorityCount += 1;
      const sla = buildCandidateSlaSnapshot({
        appliedDate: row.appliedDate,
        workflowStatus: row.workflowStatus,
        lastActionAt: row.lastActionAt,
        recruitingActions: row.recruitingActions,
        followUpDueAt: row.followUpDueAt,
        snoozedUntil: row.snoozedUntil,
        referenceMs,
      });
      if (
        sla.recruiterInactivitySeverity === "critical" ||
        sla.appliedAgingSeverity === "critical"
      ) {
        stalledCandidates += 1;
      } else if (row.recommendedStage !== "Escalate") {
        candidatesReadyToAdvance += 1;
      }
    }
  }

  const slaTotal = input.candidates.filter(
    (row) => row.workflowStatus !== "Not Qualified" && row.workflowStatus !== "Active Rep",
  ).length;
  const slaMet = slaTotal > 0 ? slaTotal - stalledCandidates : 0;

  const progressionBottlenecks = [...bottleneckCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([stage, count]) => `${count} at ${stage}`);

  return {
    candidatesReadyToAdvance,
    stalledCandidates,
    progressionSlaCompliance: slaTotal > 0 ? Math.round((slaMet / slaTotal) * 100) : 100,
    progressionBottlenecks,
    totalWithProgression: input.generated,
    highPriorityCount,
  };
}
