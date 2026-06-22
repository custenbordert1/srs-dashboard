import type { PipelineBottleneck, PipelineBottleneckRecommendation } from "@/lib/pipeline-intelligence/types";
import { severityRank } from "@/lib/pipeline-intelligence/bottleneck-engine";

export function buildPipelineBottleneckRecommendations(
  bottlenecks: PipelineBottleneck[],
): PipelineBottleneckRecommendation[] {
  let id = 0;
  const nextId = () => `p51-bottleneck-${++id}`;

  return bottlenecks
    .filter((row) => row.severity === "critical" || row.severity === "high")
    .map((row) => ({
      id: nextId(),
      kind: "pipeline-bottleneck" as const,
      title: `Clear ${row.stage} bottleneck in ${row.territoryLabel}`,
      rationale: row.message,
      expectedImpact: `Reduce stalled candidates in ${row.stage} and improve territory conversion`,
      priority: (row.severity === "critical" ? "critical" : "high") as "critical" | "high",
      territoryLabel: row.territoryLabel,
      owner: row.dmName,
      stage: row.stage,
    }))
    .sort((a, b) => severityRank(b.priority === "critical" ? "critical" : "high") - severityRank(a.priority === "critical" ? "critical" : "high"));
}
