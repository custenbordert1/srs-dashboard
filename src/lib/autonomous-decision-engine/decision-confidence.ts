import type { OrchestratorRiskLevel } from "@/lib/autonomous-recruiting-orchestrator/types";
import type { OperationsSeverity } from "@/lib/autonomous-operations-center/types";

export function confidenceFromOrchestration(input: {
  automationEligible: boolean;
  riskLevel: OrchestratorRiskLevel;
  blockerCount: number;
}): number {
  let score = 72;
  if (input.automationEligible) score += 18;
  if (input.blockerCount === 0) score += 6;
  if (input.riskLevel === "low") score += 4;
  if (input.riskLevel === "medium") score -= 4;
  if (input.riskLevel === "high") score -= 12;
  if (input.riskLevel === "critical") score -= 20;
  return Math.max(35, Math.min(98, score));
}

export function confidenceFromIssue(input: {
  severity: OperationsSeverity;
  issueConfidence: number;
}): number {
  const base = input.issueConfidence;
  if (input.severity === "critical") return Math.min(95, base + 5);
  if (input.severity === "high") return Math.min(92, base);
  if (input.severity === "medium") return Math.max(50, base - 8);
  return Math.max(40, base - 15);
}

export function confidenceFromPlatformImprovement(confidenceHint: number = 75): number {
  return Math.max(55, Math.min(88, confidenceHint));
}

export function averageConfidence(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}
