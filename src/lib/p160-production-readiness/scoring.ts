import type { P160ReadinessLevel } from "@/lib/p160-production-readiness/types";

export function levelToScore(level: P160ReadinessLevel): number {
  switch (level) {
    case "ready":
      return 100;
    case "warning":
      return 60;
    case "blocked":
      return 0;
  }
}

export function aggregateLevel(levels: P160ReadinessLevel[]): P160ReadinessLevel {
  if (levels.some((l) => l === "blocked")) return "blocked";
  if (levels.some((l) => l === "warning")) return "warning";
  return "ready";
}

export function weightedScore(weights: Array<{ weight: number; level: P160ReadinessLevel }>): number {
  const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0);
  if (totalWeight <= 0) return 0;
  const score = weights.reduce((sum, w) => sum + w.weight * levelToScore(w.level), 0) / totalWeight;
  return Math.round(score);
}

export function checklistScore(
  items: Array<{ status: "complete" | "partial" | "pending" }>,
): number {
  if (items.length === 0) return 0;
  const points: number[] = items.map((item) => {
    if (item.status === "complete") return 100;
    if (item.status === "partial") return 60;
    return 0;
  });
  return Math.round(points.reduce((a, b) => a + b, 0) / points.length);
}
