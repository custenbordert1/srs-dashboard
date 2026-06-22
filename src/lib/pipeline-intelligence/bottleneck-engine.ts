import type { BottleneckSeverity } from "@/lib/pipeline-intelligence/types";
import {
  STAGE_SLA_HOURS,
  type CanonicalPipelineStage,
} from "@/lib/pipeline-intelligence/stage-mapping";

export function resolveBottleneckSeverity(input: {
  stage: CanonicalPipelineStage;
  count: number;
  avgDaysInStage: number | null;
  beyondSlaCount: number;
}): BottleneckSeverity {
  const slaHours = STAGE_SLA_HOURS[input.stage];
  if (!slaHours || input.count === 0) return "normal";

  const slaDays = slaHours / 24;
  const avgDays = input.avgDaysInStage ?? 0;
  const slaRatio = slaDays > 0 ? avgDays / slaDays : 0;
  const beyondSlaPct = input.count > 0 ? input.beyondSlaCount / input.count : 0;

  if (slaRatio >= 2 || beyondSlaPct >= 0.5 || (input.beyondSlaCount >= 5 && beyondSlaPct >= 0.35)) {
    return "critical";
  }
  if (slaRatio >= 1.5 || beyondSlaPct >= 0.3 || input.beyondSlaCount >= 3) {
    return "high";
  }
  if (slaRatio >= 1 || beyondSlaPct >= 0.15 || input.beyondSlaCount >= 1) {
    return "warning";
  }
  return "normal";
}

export function severityRank(severity: BottleneckSeverity): number {
  if (severity === "critical") return 4;
  if (severity === "high") return 3;
  if (severity === "warning") return 2;
  return 1;
}
