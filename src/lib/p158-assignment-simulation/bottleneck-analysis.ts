import type { P158AssignmentQueueItem } from "@/lib/p158-autonomous-recruiter-assignment/types";
import type { P1581SimulationWarning } from "@/lib/p158-assignment-simulation/types";
import type { P1581WorkloadRow } from "@/lib/p158-assignment-simulation/types";
import type { P1581TerritoryHeatCell } from "@/lib/p158-assignment-simulation/types";

const WORKLOAD_CRITICAL_DELTA = 15;
const WORKLOAD_WARNING_DELTA = 10;
const UTILIZATION_WARNING = 85;

export function analyzeSimulationBottlenecks(input: {
  queue: P158AssignmentQueueItem[];
  workload: P1581WorkloadRow[];
  territory: P1581TerritoryHeatCell[];
  simulatedCount: number;
  remainingUnassigned: number;
}): P1581SimulationWarning[] {
  const warnings: P1581SimulationWarning[] = [];

  const blocked = input.queue.filter((q) => q.status === "blocked");
  if (blocked.length > 0) {
    warnings.push({
      severity: "warning",
      code: "blocked_candidates",
      message: `${blocked.length} candidate(s) blocked (duplicate or policy) — will not assign.`,
    });
  }

  const manualReview = input.queue.filter((q) => q.status === "manual_review");
  if (manualReview.length > 10) {
    warnings.push({
      severity: "info",
      code: "manual_review_backlog",
      message: `${manualReview.length} candidates need manual review before assignment.`,
    });
  }

  for (const row of input.workload) {
    if (row.delta >= WORKLOAD_CRITICAL_DELTA) {
      warnings.push({
        severity: "critical",
        code: "workload_spike",
        message: `${row.recruiter} workload would increase by ${row.delta} (${row.before} → ${row.after}).`,
      });
    } else if (row.delta >= WORKLOAD_WARNING_DELTA) {
      warnings.push({
        severity: "warning",
        code: "workload_increase",
        message: `${row.recruiter} projected +${row.delta} candidates.`,
      });
    }
    if (row.utilizationPercent >= UTILIZATION_WARNING) {
      warnings.push({
        severity: "warning",
        code: "high_utilization",
        message: `${row.recruiter} utilization would reach ${row.utilizationPercent}%.`,
      });
    }
  }

  const hotTerritories = input.territory.filter((t) => t.imbalanceScore >= 70 && t.unassignedAfter > 0);
  if (hotTerritories.length > 0) {
    warnings.push({
      severity: "warning",
      code: "territory_imbalance",
      message: `${hotTerritories.length} territor(ies) remain imbalanced after simulation.`,
    });
  }

  if (input.remainingUnassigned > 20) {
    warnings.push({
      severity: "info",
      code: "unassigned_remainder",
      message: `${input.remainingUnassigned} candidates would remain unassigned after this run.`,
    });
  }

  if (input.simulatedCount === 0) {
    warnings.push({
      severity: "critical",
      code: "empty_simulation",
      message: "No candidates qualify for simulated assignment — review confidence thresholds.",
    });
  }

  const lowConfidence = input.queue.filter(
    (q) => q.status === "queued" && q.confidence < 65,
  );
  if (lowConfidence.length > 0) {
    warnings.push({
      severity: "info",
      code: "low_confidence_queue",
      message: `${lowConfidence.length} queued assignment(s) below 65% confidence.`,
    });
  }

  return warnings;
}

export function buildConfidenceDistribution(
  queue: P158AssignmentQueueItem[],
): import("@/lib/p158-assignment-simulation/types").P1581ConfidenceBucket[] {
  const buckets = [
    { label: "90–100", min: 90, max: 100, count: 0 },
    { label: "80–89", min: 80, max: 89, count: 0 },
    { label: "70–79", min: 70, max: 79, count: 0 },
    { label: "60–69", min: 60, max: 69, count: 0 },
    { label: "<60", min: 0, max: 59, count: 0 },
  ];

  for (const item of queue.filter((q) => q.status === "queued")) {
    const bucket = buckets.find((b) => item.confidence >= b.min && item.confidence <= b.max);
    if (bucket) bucket.count += 1;
  }

  return buckets;
}
